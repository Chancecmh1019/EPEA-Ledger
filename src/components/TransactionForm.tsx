import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, CreditCard, Banknote } from 'lucide-react';
import type { RecordData } from '../types';
import { fromTaipeiInput, taipeiInput, validateRecord } from '../domain/ledger';
import { formatCurrency } from '../lib/utils';

type Draft = {
  id: string; amount: string; type: RecordData['type']; method: RecordData['payment_method'];
  description: string; note: string; date: string; dateEdited?: boolean; submittedAt?: string;
  kind: NonNullable<RecordData['kind']>; reason: string; original: string; adjustmentAt: string;
};
export function TransactionForm({ owner, initial, onSave, onCancel, pendingIds = [], confirmedRecords = [], onBusy }: {
  owner: string; initial?: RecordData; onSave: (record: RecordData) => Promise<void>;
  onCancel?: () => void; pendingIds?: string[]; confirmedRecords?: RecordData[]; onBusy?: (busy: boolean) => void;
}) {
  const key = 'epea:draft:' + owner + ':' + (initial?.id ?? 'new');
  const preferenceKey = 'epea:entry-preferences:' + owner;
  const fresh = (): Draft => {
    let method: RecordData['payment_method'] = 'cash';
    try { if (JSON.parse(localStorage.getItem(preferenceKey) ?? '{}').method === 'credit_card') method = 'credit_card'; } catch { /* Use the predictable default. */ }
    return { id: initial?.id ?? crypto.randomUUID(), amount: initial ? String(initial.amount) : '', type: initial?.type ?? 'expense', method: initial?.payment_method ?? method, description: initial?.description ?? '', note: initial?.note ?? '', date: taipeiInput(initial?.created_at), kind: initial?.kind ?? 'ordinary', reason: initial?.adjustment_reason ?? '', original: initial?.original_record_id ?? '', adjustmentAt: initial?.adjustment_at ?? new Date().toISOString() };
  };
  const [draft, setDraft] = useState<Draft>(() => {
    try { const saved = JSON.parse(localStorage.getItem(key) ?? 'null'); return saved && saved.id && typeof saved.amount === 'string' ? { ...fresh(), ...saved } : fresh(); } catch { return fresh(); }
  });
  const [details, setDetails] = useState(!!initial && (initial.kind === 'adjustment' || initial.kind === 'repayment'));
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const alreadyPending = pendingIds.includes(draft.id);
  useEffect(() => {
    if (initial || busy || !draft.submittedAt || alreadyPending) return;
    const confirmed = confirmedRecords.find(record => record.id === draft.id);
    if (!confirmed || confirmed.amount !== Number(draft.amount) || confirmed.type !== draft.type || confirmed.payment_method !== draft.method || confirmed.note !== draft.note || Date.parse(confirmed.created_at) !== Date.parse(draft.submittedAt)) return;
    const description = draft.description.trim() || (draft.kind === 'repayment' ? '信用卡繳款' : draft.type === 'income' ? '收入' : '日常支出');
    if (confirmed.description !== description) return;
    try {
      localStorage.removeItem(key);
      localStorage.setItem(preferenceKey, JSON.stringify({ method: draft.method }));
      setDraft(fresh());
      setSuccess(`${draft.type === 'income' ? '收入' : '支出'} ${formatCurrency(confirmed.amount)} 已儲存`);
    } catch { setError('雲端已確認，但本機草稿未能清除。請先保留備份。'); }
  }, [initial, busy, draft, alreadyPending, confirmedRecords, key, preferenceKey]);
  function change(patch: Partial<Draft>) {
    const next = { ...draft, ...patch, ...(patch.date !== undefined ? { submittedAt: undefined } : {}) };
    setDraft(next); setError(''); setSuccess('');
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { setError('草稿無法保存到此瀏覽器，請勿關閉頁面。'); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true); onBusy?.(true); setError(''); setSuccess('');
    try {
      if (!draft.amount || Number(draft.amount) <= 0) throw new Error('請輸入大於 0 的整數金額。');
      const createdAt = initial && draft.date === taipeiInput(initial.created_at) ? initial.created_at : draft.submittedAt ?? (draft.dateEdited || initial ? fromTaipeiInput(draft.date) : new Date().toISOString());
      const record = validateRecord({ ...initial, id: draft.id, user_id: owner, amount: draft.amount, type: draft.type, payment_method: draft.method, description: draft.description.trim() || (draft.kind === 'repayment' ? '信用卡繳款' : draft.type === 'income' ? '收入' : '日常支出'), note: draft.note, created_at: createdAt, kind: draft.kind, adjustment_reason: draft.kind === 'adjustment' ? draft.reason : null, adjustment_at: draft.kind === 'adjustment' ? draft.adjustmentAt : null, original_record_id: draft.kind === 'adjustment' ? draft.original || null : initial?.original_record_id ?? null, is_urgent: initial?.is_urgent ?? false });
      const submitted = { ...draft, submittedAt: createdAt };
      localStorage.setItem(key, JSON.stringify(submitted));
      setDraft(submitted);
      await onSave(record);
      // New entries complete after durable local save; edits still await cloud confirmation.
      localStorage.removeItem(key);
      if (!initial) {
        localStorage.setItem(preferenceKey, JSON.stringify({ method: draft.method }));
        setDraft(fresh());
        input.current?.blur();
      }
      setSuccess(`${draft.type === 'income' ? '收入' : '支出'} ${formatCurrency(record.amount)} ${initial ? '已同步' : '已保存至此裝置，將自動同步'}`);
    } catch (failure) { setError((failure as Error).message); }
    finally { lock.current = false; setBusy(false); onBusy?.(false); }
  }
  return <form className={`transaction-form ${initial ? 'transaction-form-edit' : ''}`} aria-label={initial ? '編輯紀錄' : '新增紀錄'} onSubmit={submit}>
    <div className="segmented direction-control" aria-label="收支方向">
      {(['expense', 'income'] as const).map(type => <button key={type} type="button" aria-pressed={draft.type === type} disabled={busy || alreadyPending || draft.kind === 'repayment'} onClick={() => change({ type, ...(type === 'income' && !initial ? { method: 'cash' } : {}) })}>{type === 'expense' ? '支出' : '收入'}</button>)}
    </div>
    <label className="amount-field"><span>{initial ? '修改金額' : '記下這筆金額'} <span className="currency-label">TWD</span></span>
      <div className="amount-line"><span aria-hidden="true">$</span><input ref={input} autoFocus={!!initial} aria-label="金額" inputMode="numeric" pattern="[0-9]+" placeholder="0" required autoComplete="off" value={draft.amount} disabled={busy || alreadyPending} onChange={event => change({ amount: event.target.value })}/></div>
    </label>
    <div className="payment-choices" aria-label="付款方式">
      {([{ value: 'cash', label: '現金', Icon: Banknote }, { value: 'credit_card', label: '信用卡', Icon: CreditCard }] as const).map(({ value, label, Icon }) => <button key={value} type="button" aria-pressed={draft.method === value} disabled={busy || alreadyPending || draft.kind === 'repayment'} onClick={() => change({ method: value })}><Icon size={19}/>{label}{draft.method === value && <Check size={15}/>}</button>)}
    </div>
    {draft.type === 'income' && draft.method === 'credit_card' && <p className="field-note">信用卡收入會計為退款，減少卡片負債，不計入現金收入。</p>}
    <label className="description-field"><span>記的是什麼？<small>選填</small></span><input aria-label="說明" placeholder={draft.type === 'income' ? '薪資、退款、收到的款項…' : '午餐、咖啡、搭車…'} maxLength={500} value={draft.description} disabled={busy || alreadyPending} onChange={event => change({ description: event.target.value })}/></label>
    <button className="details-toggle" type="button" aria-expanded={details} disabled={busy} onClick={() => setDetails(!details)}>日期、備註與其他選項<ChevronDown size={16} className={details ? 'rotate' : ''}/></button>
    {details && <div className="entry-details">
      <label>日期與時間（臺北）<input type="datetime-local" required aria-label="日期與時間" value={draft.date} disabled={busy || alreadyPending} onChange={event => change({ date: event.target.value, dateEdited: true })}/></label>
      <label>備註 <small>選填</small><textarea rows={2} maxLength={5000} value={draft.note} disabled={busy || alreadyPending} onChange={event => change({ note: event.target.value })}/></label>
      <label>交易種類<select aria-label="交易種類" value={draft.kind} disabled={busy || alreadyPending} onChange={event => change({ kind: event.target.value as Draft['kind'], ...(event.target.value === 'repayment' ? { method: 'cash', type: 'expense' } : {}) })}><option value="ordinary">一般收支</option><option value="repayment">信用卡繳款</option><option value="adjustment">帳務調整</option></select></label>
      {draft.kind === 'repayment' && <p className="field-note">以現金支付卡費，減少卡片負債，不重複計入消費。</p>}
      {draft.kind === 'adjustment' && <><label>調整理由<input required value={draft.reason} disabled={busy || alreadyPending} onChange={event => change({ reason: event.target.value })}/></label><label>對應原始紀錄 ID <small>選填</small><input value={draft.original} disabled={busy || alreadyPending} onChange={event => change({ original: event.target.value })}/></label></>}
    </div>}
    {alreadyPending && <p className="notice warning">這筆操作尚未確認。原輸入已鎖定保留，可按儲存重試，或在「帳戶」核對待處理操作。</p>}
    {error && <p className="notice error" role="alert">{error} 輸入內容已保留。</p>}
    {success && <p className="notice success" role="status"><Check size={17}/>{success}</p>}
    <div className="entry-action">
      {onCancel && <button className="button secondary" type="button" disabled={busy} onClick={onCancel}>取消</button>}
      <button className="button primary save-entry" type="submit" disabled={busy || !draft.amount}>{busy ? '正在儲存…' : initial ? '儲存修改' : `記一筆${draft.type === 'income' ? '收入' : '支出'}`}<ArrowRight size={19}/></button>
    </div>
  </form>;
}
