import { useState, useRef } from 'react';
import type { RecordData } from '../types';
import { fromTaipeiInput, taipeiInput, validateRecord } from '../domain/ledger';
type Draft = { id: string; amount: string; type: RecordData['type']; method: RecordData['payment_method']; description: string; note: string; date: string; kind: NonNullable<RecordData['kind']>; reason: string; original: string; adjustmentAt: string };
export function FluidSlider({ owner, initial, onSave, onCancel }: { owner: string; initial?: RecordData; onSave: (r: RecordData) => Promise<void>; onCancel?: () => void }) {
  const key = 'epea:draft:' + owner + ':' + (initial?.id ?? 'new');
  const fresh = (): Draft => ({ id: initial?.id ?? crypto.randomUUID(), amount: initial ? String(initial.amount) : '', type: initial?.type ?? 'expense', method: initial?.payment_method ?? 'cash', description: initial?.description ?? '', note: initial?.note ?? '', date: taipeiInput(initial?.created_at), kind: initial?.kind ?? 'ordinary', reason: initial?.adjustment_reason ?? '', original: initial?.original_record_id ?? '', adjustmentAt: initial?.adjustment_at ?? new Date().toISOString() });
  const [draft, setDraft] = useState<Draft>(() => { try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fresh(); } catch { return fresh(); } });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const lock = useRef(false);
  function change(patch: Partial<Draft>) { const next = { ...draft, ...patch }; try { localStorage.setItem(key, JSON.stringify(next)); setDraft(next); setError(''); } catch { setError('本機儲存不可用，請勿關閉頁面'); setDraft(next); } }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try {
      const r = validateRecord({ ...initial, id: draft.id, user_id: owner, amount: draft.amount, type: draft.type, payment_method: draft.method, description: draft.description, note: draft.note, created_at: initial && draft.date === taipeiInput(initial.created_at) ? initial.created_at : fromTaipeiInput(draft.date), kind: draft.kind, adjustment_reason: draft.kind === 'adjustment' ? draft.reason : null, adjustment_at: draft.kind === 'adjustment' ? draft.adjustmentAt : null, original_record_id: draft.original || null, is_urgent: initial?.is_urgent ?? false });
      await onSave(r);
      localStorage.removeItem(key);
      if (!initial) setDraft(fresh());
      setMessage('雲端已確認儲存');
    } catch (err) { setError((err as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  return <form className="card entry" onSubmit={submit} aria-label={initial ? '編輯紀錄' : '新增紀錄'}>
    <h2>{initial ? '編輯留痕' : '留下一筆 · Record'}</h2>
    <label>金額（NT$，整數）<input autoFocus inputMode="numeric" pattern="[0-9]+" required value={draft.amount} onChange={e => change({ amount: e.target.value })} className="amount-input" aria-label="金額" /></label>
    <div className="form-row"><label>收支<select aria-label="收支" value={draft.type} onChange={e => change({ type: e.target.value as Draft['type'] })}><option value="expense">支出</option><option value="income">收入</option></select></label>
    <label>付款方式<select aria-label="付款方式" value={draft.method} onChange={e => change({ method: e.target.value as Draft['method'] })}><option value="cash">現金</option><option value="credit_card">信用卡</option></select></label></div>
    <label>說明<input required maxLength={500} value={draft.description} onChange={e => change({ description: e.target.value })} placeholder="今日的生活片刻" /></label>
    <label>日期與時間（臺北）<input type="datetime-local" required value={draft.date} onChange={e => change({ date: e.target.value })} /></label>
    <label>交易種類<select aria-label="交易種類" value={draft.kind} onChange={e => change({ kind: e.target.value as Draft['kind'], ...(e.target.value === 'repayment' ? { method: 'cash', type: 'expense' } : {}) })}><option value="ordinary">一般收支</option><option value="repayment">卡費繳款（現金，不重算支出）</option><option value="adjustment">明確調整（須附理由）</option></select></label>
    {draft.kind === 'adjustment' && <><label>調整理由<input required value={draft.reason} onChange={e => change({ reason: e.target.value })} /></label><label>原始紀錄 ID（選填）<input value={draft.original} onChange={e => change({ original: e.target.value })} /></label></>}
    <label>備註（選填）<textarea rows={2} maxLength={5000} value={draft.note} onChange={e => change({ note: e.target.value })} /></label>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <div className="form-actions">{onCancel && <button type="button" onClick={onCancel}>返回</button>}<button className="primary" disabled={busy} type="submit">{busy ? '儲存中…' : '儲存留痕'}</button></div>
  </form>;
}
