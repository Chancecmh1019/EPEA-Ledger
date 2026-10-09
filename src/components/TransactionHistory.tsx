import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, CreditCard, Pencil, Search, SlidersHorizontal, Trash2, FileClock } from 'lucide-react';
import type { RecordData } from '../types';
import { correctionCandidate, taipeiDay, taipeiInput } from '../domain/ledger';
import { formatCurrency } from '../lib/utils';
import { download } from '../lib/export';
import { Modal } from './Modal';
import { TransactionForm } from './TransactionForm';

export function TransactionRow({ record, onEdit, onDelete, pending = false }: { record: RecordData; onEdit: () => void; onDelete: () => void; pending?: boolean }) {
  const Icon = record.payment_method === 'cash' ? Banknote : CreditCard;
  return <article className="transaction-row">
    <div className={`transaction-icon ${record.type}`}><Icon size={20}/></div>
    <div className="transaction-copy"><h3>{record.description}</h3><p>{record.payment_method === 'cash' ? '現金' : '信用卡'}<span>·</span>{taipeiInput(record.created_at).slice(11)}{record.kind === 'repayment' ? ' · 繳款' : record.kind === 'adjustment' ? ' · 調整' : ''}</p>{record.note && <p className="transaction-note">{record.note}</p>}{correctionCandidate(record) && <span className="record-badge">歷史校正 · 保留原分類</span>}{pending && <span className="record-badge">待確認</span>}</div>
    <div className="transaction-end"><strong className={record.type === 'income' ? 'income-text' : ''}>{record.type === 'income' ? '+' : '−'}{formatCurrency(record.amount)}</strong><div className="row-actions"><button type="button" aria-label={`編輯 ${record.description}`} disabled={pending} onClick={onEdit}><Pencil size={14}/>編輯</button><button type="button" aria-label={`刪除 ${record.description}`} disabled={pending} onClick={onDelete}><Trash2 size={14}/>刪除</button></div></div>
  </article>;
}
type Filters = { search: string; type: string; method: string; from: string; to: string };
export function TransactionHistory({ owner, records, pendingIds, onUpdate, onDelete, history, recent = false }: {
  owner: string; records: RecordData[]; pendingIds: string[]; onUpdate: (record: RecordData) => Promise<void>;
  onDelete: (record: RecordData) => Promise<void>; history: (id: string) => Promise<unknown[]>; recent?: boolean;
}) {
  const filterKey = 'epea:history-filter:' + owner;
  const [filters, setFilters] = useState<Filters>(() => {
    const empty = { search: '', type: 'all', method: 'all', from: '', to: '' };
    if (recent) return empty;
    try { return { ...empty, ...JSON.parse(sessionStorage.getItem(filterKey) ?? '{}') }; } catch { return empty; }
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [limit, setLimit] = useState(() => {
    const saved = Number(sessionStorage.getItem('epea:history-limit:' + owner));
    return Number.isSafeInteger(saved) && saved >= 60 ? saved : 60;
  });
  const [edit, setEdit] = useState<RecordData | null>(null);
  const [deleting, setDeleting] = useState<RecordData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const deleteLock = useRef(false);
  const search = useDeferredValue(filters.search.trim().toLowerCase());
  useEffect(() => { if (!recent) sessionStorage.setItem(filterKey, JSON.stringify(filters)); }, [filters, filterKey, recent]);
  useEffect(() => { if (!recent) sessionStorage.setItem('epea:history-limit:' + owner, String(limit)); }, [limit, owner, recent]);
  const filtered = useMemo(() => records.filter(record => {
    const day = taipeiDay(record.created_at);
    return (!search || `${record.description} ${record.note} ${record.amount}`.toLowerCase().includes(search)) && (filters.type === 'all' || record.type === filters.type) && (filters.method === 'all' || record.payment_method === filters.method) && (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to);
  }).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)), [records, search, filters.type, filters.method, filters.from, filters.to]);
  const visible = filtered.slice(0, recent ? 5 : limit);
  const groups = new Map<string, RecordData[]>();
  visible.forEach(record => { const day = taipeiDay(record.created_at); groups.set(day, [...(groups.get(day) ?? []), record]); });
  const patch = (value: Partial<Filters>) => { setFilters({ ...filters, ...value }); setLimit(60); };
  const close = () => { if (!busy) { setEdit(null); setDeleting(null); setError(''); } };
  return <section className={recent ? 'recent-records' : 'history-page'}>
    {!recent && <><div className="history-search"><Search size={18}/><input aria-label="搜尋紀錄" type="search" value={filters.search} placeholder="搜尋名稱、備註或金額" onChange={event => patch({ search: event.target.value })}/><button className="icon-button" aria-label="篩選紀錄" aria-expanded={filterOpen} onClick={() => setFilterOpen(!filterOpen)}><SlidersHorizontal size={19}/></button></div>
      <div className="history-toolbar"><div className="filter-chips">{[['all', '全部'], ['expense', '支出'], ['income', '收入']].map(([value, label]) => <button key={value} type="button" aria-pressed={filters.type === value} onClick={() => patch({ type: value })}>{label}</button>)}</div><span>{filtered.length.toLocaleString()} 筆紀錄</span></div>
      {filterOpen && <div className="filter-panel"><label>付款方式<select value={filters.method} onChange={event => patch({ method: event.target.value })}><option value="all">全部</option><option value="cash">現金</option><option value="credit_card">信用卡</option></select></label><label>從<input type="date" value={filters.from} onChange={event => patch({ from: event.target.value })}/></label><label>至<input type="date" value={filters.to} onChange={event => patch({ to: event.target.value })}/></label><button className="text-button" onClick={() => patch({ search: '', type: 'all', method: 'all', from: '', to: '' })}>清除篩選</button></div>}
      {!filterOpen && (filters.method !== 'all' || filters.from || filters.to) && <button className="text-button active-filter" onClick={() => setFilterOpen(true)}>已套用日期或付款篩選 · 查看</button>}
    </>}
    {[...groups].map(([day, rows]) => <section className="day-group" key={day}><div className="day-heading"><h2>{day === taipeiDay(new Date()) ? '今天' : day.replaceAll('-', ' / ')}</h2><span>{rows.length} 筆</span></div>{rows.map(record => <TransactionRow key={record.id} record={record} pending={pendingIds.includes(record.id)} onEdit={() => { setError(''); setEdit(record); }} onDelete={() => { setError(''); setDeleting(record); }}/>)}</section>)}
    {!visible.length && <div className="empty-state"><FileClock size={30}/><h3>{records.length ? '沒有符合的紀錄' : '第一筆，從今天開始'}</h3><p>{records.length ? '換個關鍵字，或清除篩選看看。' : '記下第一筆收支，就會出現在這裡。'}</p></div>}
    {!recent && filtered.length > limit && <button className="button secondary load-more" onClick={() => setLimit(limit + 60)}>顯示更多紀錄 <span>{Math.min(limit, filtered.length)} / {filtered.length}</span></button>}
    {edit && <Modal title="編輯紀錄" onClose={close} busy={busy}><TransactionForm key={edit.id} owner={owner} initial={edit} pendingIds={pendingIds} onBusy={setBusy} onCancel={close} onSave={async record => { await onUpdate(record); setEdit(null); }}/><button className="text-button audit-action" disabled={busy} onClick={async () => { try { download('record-history-' + edit.id + '.json', await history(edit.id)); } catch (failure) { setError((failure as Error).message); } }}><FileClock size={16}/>匯出這筆的修改歷史</button>{error && <p className="notice error" role="alert">{error}</p>}</Modal>}
    {deleting && <Modal title="刪除這筆紀錄？" onClose={close} busy={busy}><div className="delete-summary"><p>{deleting.description}</p><strong>{formatCurrency(deleting.amount)}</strong><span>{taipeiDay(deleting.created_at)} · {deleting.payment_method === 'cash' ? '現金' : '信用卡'}</span></div><p className="muted">刪除後會從帳本與統計中移除，修改歷史仍會保留。</p>{correctionCandidate(deleting) && <p className="notice warning">這是歷史校正紀錄。請確認它確實應刪除，避免影響對帳。</p>}{error && <p className="notice error" role="alert">{error}</p>}<div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={close}>保留紀錄</button><button className="button danger" disabled={busy} onClick={async () => { if (deleteLock.current) return; deleteLock.current = true; setBusy(true); setError(''); try { await onDelete(deleting); setDeleting(null); } catch (failure) { setError((failure as Error).message); } finally { deleteLock.current = false; setBusy(false); } }}>{busy ? '正在刪除…' : '確認刪除'}</button></div></Modal>}
  </section>;
}
