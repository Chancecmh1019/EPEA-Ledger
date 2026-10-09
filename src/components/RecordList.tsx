import { useMemo, useRef, useState, useEffect } from 'react';
import type { RecordData } from '../types';
import { correctionCandidate, taipeiDay, taipeiInput } from '../domain/ledger';
import { formatCurrency } from '../lib/utils';
import { FluidSlider } from './FluidSlider';
import { download } from '../lib/export';
export function RecordList({ records, owner, pendingIds, onUpdate, onDelete, history }: { records: RecordData[]; owner: string; pendingIds: string[]; onUpdate: (r: RecordData) => Promise<void>; onDelete: (r: RecordData) => Promise<void>; history: (id: string) => Promise<unknown[]> }) {
  const filterKey = 'epea:history-filter:' + owner;
  const [savedFilter] = useState(() => { try { return JSON.parse(sessionStorage.getItem(filterKey) ?? '{}'); } catch { return {}; } });
  const [search, setSearch] = useState<string>(savedFilter.search ?? ''), [method, setMethod] = useState<string>(savedFilter.method ?? 'all'), [type, setType] = useState<string>(savedFilter.type ?? 'all'), [from, setFrom] = useState<string>(savedFilter.from ?? ''), [to, setTo] = useState<string>(savedFilter.to ?? '');
  useEffect(() => { sessionStorage.setItem(filterKey, JSON.stringify({ search, method, type, from, to })); }, [filterKey,search,method,type,from,to]);
  const [edit, setEdit] = useState<RecordData | null>(null), [deleting, setDeleting] = useState<RecordData | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [limit, setLimit] = useState(50);
  const scroll = useRef(0), returnFocus = useRef<HTMLElement | null>(null), dialog = useRef<HTMLDialogElement>(null);
  const filtered = useMemo(() => records.filter(r => {
    let day: string; try { day = taipeiDay(r.created_at); } catch { return false; }
    return (!search || (r.description + ' ' + r.note).toLowerCase().includes(search.toLowerCase())) && (method === 'all' || r.payment_method === method) && (type === 'all' || r.type === type) && (!from || day >= from) && (!to || day <= to);
  }).sort((a,b) => b.created_at.localeCompare(a.created_at)), [records,search,method,type,from,to]);
  useEffect(() => { if (edit || deleting) dialog.current?.showModal(); }, [edit, deleting]);
  useEffect(() => {
    if (!edit && !deleting) return;
    const body = document.body;
    const old = { position: body.style.position, top: body.style.top, width: body.style.width };
    body.style.position = 'fixed'; body.style.top = '-' + scroll.current + 'px'; body.style.width = '100%';
    return () => { Object.assign(body.style, old); window.scrollTo(0, scroll.current); };
  }, [edit, deleting]);
  function close() { setEdit(null); setDeleting(null); setError(''); requestAnimationFrame(() => { window.scrollTo(0, scroll.current); returnFocus.current?.focus({ preventScroll: true }); }); }
  function open(r: RecordData, action: 'edit' | 'delete') { scroll.current = window.scrollY; returnFocus.current = document.activeElement as HTMLElement; if (action === 'edit') setEdit(r); else setDeleting(r); }
  return <section className="card history"><h2>時光軸 · Timeline</h2>
    <label>搜尋<input type="search" value={search} onChange={e => { setSearch(e.target.value); setLimit(50); }} placeholder="搜尋說明、備註" /></label>
    <div className="form-row"><label>付款篩選<select value={method} onChange={e => setMethod(e.target.value)}><option value="all">所有付款方式</option><option value="cash">現金</option><option value="credit_card">信用卡</option></select></label><label>收支篩選<select value={type} onChange={e => setType(e.target.value)}><option value="all">所有收支</option><option value="income">收入</option><option value="expense">支出</option></select></label></div>
    <div className="form-row"><label>起始日期<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>結束日期<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></div>
    <p>{filtered.length} 筆 · 待處理操作不計入雲端統計</p>
    {filtered.slice(0,limit).map(r => <article className="record" key={r.id}>
      <div className="record-heading"><h3>{r.description}</h3><strong>{r.type === 'income' ? '+' : '−'}{formatCurrency(r.amount)}</strong></div>
      <p>{taipeiInput(r.created_at).replace('T', ' ')} · {r.payment_method === 'cash' ? '現金' : '信用卡'} · {r.kind === 'repayment' ? '卡費繳款' : r.kind === 'adjustment' ? '明確調整' : '一般收支'}</p>
      {r.note && <p>{r.note}</p>}{correctionCandidate(r) && <p className="warning">校正候選：目前仍依原始分類計入，需人工核對</p>}
      <div className="record-actions"><button disabled={pendingIds.includes(r.id)} onClick={() => open(r, 'edit')}>編輯</button><button disabled={pendingIds.includes(r.id)} onClick={() => open(r, 'delete')}>刪除</button><button onClick={async () => { try { download('audit-' + r.id + '.json', await history(r.id)); } catch (e) { setError((e as Error).message); } }}>稽核歷史</button></div>
    </article>)}
    {!filtered.length && <p>尚無符合條件的留痕。</p>}{filtered.length > limit && <button onClick={() => setLimit(limit + 50)}>載入更多</button>}
    {error && <p role="alert">{error}</p>}
    {(edit || deleting) && <dialog ref={dialog} className="sheet" onCancel={e => { e.preventDefault(); if (!busy) close(); }}>
      {edit && <FluidSlider key={edit.id} owner={owner} initial={edit} onCancel={close} onSave={async r => { await onUpdate(r); close(); }} />}
      {deleting && <div className="card"><h2>確認刪除「{deleting.description}」？</h2><p>同步後以刪除標記保存稽核歷史。校正候選仍須先人工審查。</p><div className="form-row"><button disabled={busy} onClick={close}>取消</button><button disabled={busy} className="primary" onClick={async () => { setBusy(true); try { await onDelete(deleting); close(); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }}>確認刪除</button></div>{error && <p role="alert">{error}</p>}</div>}
    </dialog>}
  </section>;
}
