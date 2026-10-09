import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RecordData } from '../src/types.js';
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export interface Repository {
  snapshot(owner: string): Promise<RecordData[]>;
  create(owner: string, record: RecordData): Promise<RecordData>;
  update(owner: string, record: RecordData, expected: number): Promise<RecordData>;
  remove(owner: string, id: string, expected: number): Promise<void>;
  history(owner: string, id: string): Promise<unknown[]>;
}
const fields = ['id','type','amount','description','note','payment_method','created_at','is_urgent','kind','adjustment_reason','adjustment_at','original_record_id'] as const;
function same(a: RecordData, b: RecordData) { return fields.every(k => {
  if (k === 'created_at' || k === 'adjustment_at') return (!a[k] && !b[k]) || Date.parse(a[k]!) === Date.parse(b[k]!);
  if (k === 'amount') return Number(a[k]) === Number(b[k]);
  if (k === 'is_urgent') return !!a[k] === !!b[k];
  if (k === 'kind') return (a[k] ?? 'ordinary') === (b[k] ?? 'ordinary');
  return (a[k] ?? null) === (b[k] ?? null);
}); }
export class SupabaseRepository implements Repository {
  constructor(private db: SupabaseClient, private ownerColumn: 'user_id' | 'line_user_id') {}
  private decode(row: Record<string, unknown>): RecordData { return { ...row, user_id: row[this.ownerColumn], kind: row.kind ?? 'ordinary' } as RecordData; }
  private encode(r: RecordData, owner: string) { return { ...Object.fromEntries(fields.map(k => [k, r[k] ?? null])), is_urgent: r.is_urgent ?? false, kind: r.kind ?? 'ordinary', [this.ownerColumn]: owner }; }
  async snapshot(owner: string) {
    // One SQL statement returns one JSON value: no PostgREST row cap and no mixed-page snapshot.
    const { data, error } = await this.db.rpc('epea_snapshot', { account_owner: owner, owner_column: this.ownerColumn });
    if (error || !Array.isArray(data)) throw new ApiError(503, '雲端讀取失敗；請確認已審核的結構與遷移');
    return data.map(row => this.decode(row));
  }
  private async find(owner: string, id: string) {
    const { data, error } = await this.db.from('records').select('*').eq(this.ownerColumn, owner).eq('id', id).maybeSingle();
    if (error) throw new ApiError(503, '雲端讀取失敗');
    return data ? this.decode(data) : null;
  }
  async create(owner: string, r: RecordData) {
    if (r.original_record_id && !(await this.find(owner, r.original_record_id))) throw new ApiError(400, '原始參考紀錄不屬於此帳戶或不存在');
    const existing = await this.find(owner, r.id);
    if (existing) { if (!existing.deleted_at && same(existing, r)) return existing; throw new ApiError(409, '識別碼已存在或已刪除，請人工檢查'); }
    const { data, error } = await this.db.from('records').insert(this.encode(r, owner)).select().single();
    if (error) {
      if (error.code === '23505') { const retry = await this.find(owner, r.id); if (retry && !retry.deleted_at && same(retry, r)) return retry; throw new ApiError(409, '重複提交衝突'); }
      throw new ApiError(503, '雲端未確認儲存，資料仍在待處理佇列');
    }
    return this.decode(data);
  }
  async update(owner: string, r: RecordData, expected: number) {
    if (r.original_record_id && !(await this.find(owner, r.original_record_id))) throw new ApiError(400, '原始參考紀錄不屬於此帳戶或不存在');
    const { data, error } = await this.db.from('records').update(this.encode(r, owner)).eq(this.ownerColumn, owner).eq('id', r.id).eq('version', expected).is('deleted_at', null).select().maybeSingle();
    if (error) throw new ApiError(503, '雲端更新失敗');
    if (!data) { const current = await this.find(owner, r.id); if (current && !current.deleted_at && current.version === expected + 1 && same(current, r)) return current; throw new ApiError(409, '版本衝突，請重新讀取並核對'); }
    return this.decode(data);
  }
  async remove(owner: string, id: string, expected: number) {
    const { data, error } = await this.db.from('records').update({ deleted_at: new Date().toISOString() }).eq(this.ownerColumn, owner).eq('id', id).eq('version', expected).is('deleted_at', null).select('id').maybeSingle();
    if (error) throw new ApiError(503, '雲端刪除失敗');
    if (!data) { const current = await this.find(owner, id); if (!current?.deleted_at || current.version !== expected + 1) throw new ApiError(409, '版本衝突或紀錄不存在'); }
  }
  async history(owner: string, id: string) {
    const { data, error } = await this.db.rpc('epea_history', { account_owner: owner, record_id: id, owner_column: this.ownerColumn });
    if (error || !Array.isArray(data)) throw new ApiError(503, '稽核歷史讀取失敗');
    return data;
  }
}
export function configuredRepository(): Repository | null {
  const column = process.env.SUPABASE_OWNER_COLUMN;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY || !['user_id','line_user_id'].includes(column ?? '')) return null;
  return new SupabaseRepository(createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } }), column as 'user_id' | 'line_user_id');
}
