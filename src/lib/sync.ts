import type { RecordData } from '../types';
export type Pending = { id: string; method: 'POST' | 'PUT' | 'DELETE'; record: RecordData; status: 'pending' | 'failed' | 'conflict'; error?: string };
export interface SyncState { records: RecordData[]; pending: Pending[]; busy: boolean; stale: boolean; message: string; }
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; }
export class SyncLedger {
  state: SyncState = { records: [], pending: [], busy: false, stale: true, message: '尚未讀取雲端' };
  private listeners = new Set<() => void>();
  private tail = Promise.resolve();
  private refreshing: Promise<void> | null = null;
  private key: string;
  constructor(public owner: string, private token: () => string, private storage: StorageLike, private request: typeof fetch = (url, init) => fetch(url, init)) {
    this.key = 'epea:v1:' + owner;
    const legacy = storage.getItem('ephemera_records_' + owner);
    // Immutable first copy; never merge it or upload it automatically.
    if (legacy && !storage.getItem('epea:legacy-backup:' + owner)) storage.setItem('epea:legacy-backup:' + owner, legacy);
    const saved = storage.getItem(this.key);
    if (saved) {
      const data = JSON.parse(saved);
      if (!Array.isArray(data.records) || !Array.isArray(data.pending)) throw new Error('快取格式損壞，原始資料仍保留，請先匯出');
      if (data.records.some((r: RecordData) => r.user_id !== owner) || data.pending.some((p: Pending) => p.record?.user_id !== owner || !['POST','PUT','DELETE'].includes(p.method))) throw new Error('快取帳戶不一致，停止同步');
      this.state = { ...this.state, records: data.records, pending: data.pending };
    }
  }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  snapshot = () => this.state;
  private emit(patch: Partial<SyncState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn()); }
  private save(records: RecordData[], pending: Pending[]) {
    this.storage.setItem(this.key, JSON.stringify({ records, pending, schema: 1 }));
    this.emit({ records, pending });
  }
  private serial(task: () => Promise<void>) { const result = this.tail.then(task); this.tail = result.catch(() => {}); return result; }
  async api(url: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    const token = this.token();
    if (token) headers.set('Authorization', 'Bearer ' + token);
    headers.set('Content-Type', 'application/json');
    const response = await this.request(url, { ...init, credentials: 'same-origin', headers, signal: AbortSignal.timeout(20000) });
    if (!response.ok) {
      if (response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('epea:auth-required'));
      const body = await response.json().catch(() => ({}));
      throw Object.assign(new Error(body.error ?? '連線失敗'), { status: response.status });
    }
    return response.status === 204 ? null : response.json();
  }
  private async lock<T>(scope: string, task: () => T | Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request('epea:' + scope + ':' + this.owner, task);
    return task();
  }
  private cached() {
    const saved = this.storage.getItem(this.key);
    if (!saved) return { records: this.state.records, pending: this.state.pending };
    const data = JSON.parse(saved) as { records: RecordData[]; pending: Pending[] };
    if (!Array.isArray(data.records) || !Array.isArray(data.pending) || data.records.some(r => r.user_id !== this.owner) || data.pending.some(p => p.record?.user_id !== this.owner || !['POST','PUT','DELETE'].includes(p.method))) throw new Error('本機快取格式或帳戶不符；停止同步並保留原資料');
    return data;
  }
  reloadCache = () => {
    try { this.emit(this.cached()); }
    catch (error) { this.emit({ stale: true, message: (error as Error).message }); }
  };
  private mutate(task: (data: { records: RecordData[]; pending: Pending[] }) => { records: RecordData[]; pending: Pending[] }) {
    return this.lock('queue', () => {
      const next = task(this.cached());
      this.save(next.records, next.pending);
    });
  }
  async enqueue(method: Pending['method'], record: RecordData) {
    if (record.user_id !== this.owner) throw new Error('帳戶不符');
    let operationId = '';
    await this.mutate(data => {
      const existing = data.pending.find(p => p.record.id === record.id);
      if (existing) {
        if (existing.method !== method || JSON.stringify(existing.record) !== JSON.stringify(record)) throw new Error('此紀錄已有待處理操作；請先核對雲端並取消舊操作，再提交修改');
        operationId = existing.id;
        return data;
      }
      const pending: Pending = { id: crypto.randomUUID(), method, record, status: 'pending' };
      operationId = pending.id;
      return { records: data.records, pending: [...data.pending, pending] };
    });
    this.emit({ message: '已儲存本機待同步操作；尚未確認雲端' });
    if (method === 'POST') {
      // Resolve only after durable local storage; cloud confirmation remains separate.
      void this.refresh();
      return;
    }
    await this.refresh();
    const unresolved = this.state.pending.find(p => p.id === operationId);
    if (unresolved) throw new Error(unresolved.error ?? '操作尚未同步，輸入已保留');
  }
  refresh = (): Promise<void> => {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.runRefresh().finally(() => {
      this.refreshing = null;
      // Entries added while a snapshot was in flight must not wait for the next timer.
      if (!this.state.stale && this.state.pending.some(op => op.status === 'pending') && (typeof navigator === 'undefined' || navigator.onLine !== false)) void this.refresh();
    });
    return this.refreshing;
  };
  private runRefresh = () => this.serial(() => this.lock('sync', async () => {
    this.emit(this.cached());
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { this.emit({ stale: true, message: '目前離線；新紀錄已保存在此裝置，恢復連線後自動同步' }); return; }
    this.emit({ busy: true });
    try {
      for (const op of [...this.state.pending]) {
        if (op.status === 'conflict') continue;
        try {
          const result = await this.api('/api/records' + (op.method === 'POST' ? '' : '/' + encodeURIComponent(op.record.id)), {
            method: op.method, body: op.method === 'DELETE' ? undefined : JSON.stringify(op.record),
            headers: op.method === 'POST' ? {} : { 'If-Match': String(op.record.version) },
          });
          if (op.method !== 'DELETE' && (!result || result.id !== op.record.id || result.user_id !== this.owner || !Number.isInteger(result.version))) throw new Error('雲端回覆無效，不會標示同步成功');
          await this.mutate(data => {
            const rows = data.records.filter(r => r.id !== op.record.id);
            if (result) rows.push(result);
            return { records: rows, pending: data.pending.filter(p => p.id !== op.id) };
          });
        } catch (error) {
          const status = (error as { status?: number }).status;
          const conflict = status !== undefined && [400, 403, 404, 409, 422].includes(status);
          await this.mutate(data => ({ records: data.records, pending: data.pending.map(p => p.id === op.id ? { ...p, status: conflict ? 'conflict' : 'failed', error: (error as Error).message } : p) }));
          if (!conflict) throw error; // One outage must not delay every queued entry separately.
        }
      }
      const rows = await this.api('/api/records');
      if (!Array.isArray(rows) || rows.some(r => r.user_id !== this.owner)) throw new Error('雲端回覆帳戶或格式不符');
      await this.mutate(data => ({ records: rows, pending: data.pending })); // authoritative replacement, including an empty ledger
      this.emit({ stale: false, message: this.state.pending.length ? '尚有未確認操作；下列統計僅含雲端紀錄' : '已確認雲端快照' });
    } catch (error) { this.emit({ stale: true, message: (error as Error).message + '；顯示上次快照' }); }
    finally { this.emit({ busy: false }); }
  })).catch(error => this.emit({ busy: false, stale: true, message: (error as Error).message }));
  /** Keep a recovery copy before allowing user-reviewed discard of an operation. */
  async discard(id: string) {
    await this.mutate(data => {
      const op = data.pending.find(p => p.id === id);
      if (!op) return data;
      this.storage.setItem('epea:discarded:' + op.id, JSON.stringify(op));
      return { records: data.records, pending: data.pending.filter(p => p.id !== id) };
    });
  }
}
