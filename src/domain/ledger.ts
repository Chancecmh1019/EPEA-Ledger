import type { FinancialSettings, RecordData } from '../types';
import { defaultSettings } from '../types';
export function money(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.0+)?$/.test(value))) throw new Error('金額須為非負整數新臺幣');
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error('金額超過安全範圍或含小數');
  return result;
}
export function validDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) throw new Error('日期須含明確時區');
  const time = value.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (time && (Number(time[1]) > 23 || Number(time[2]) > 59 || Number(time[3] ?? 0) > 59)) throw new Error('時間無效');
  const day = value.slice(0, 10), parsed = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day || !Number.isFinite(Date.parse(value))) throw new Error('日期無效');
  return value;
}
export function taipeiDay(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(validDate(value));
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function taipeiInput(value = new Date().toISOString()): string { validDate(value); return new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 16); }
export function fromTaipeiInput(value: string): string { return new Date(validDate(`${value}:00+08:00`)).toISOString(); }
export function validateRecord(input: unknown): RecordData {
  if (!input || typeof input !== 'object') throw new Error('紀錄格式無效');
  const r = input as RecordData;
  if (typeof r.id !== 'string' || !r.id || r.id.length > 200 || typeof r.user_id !== 'string' || !r.user_id) throw new Error('缺少紀錄或帳戶識別');
  if (!['income', 'expense'].includes(r.type) || !['cash', 'credit_card'].includes(r.payment_method)) throw new Error('收支方向或付款方式無效');
  if (typeof r.description !== 'string' || !r.description.trim() || r.description.length > 500 || typeof r.note !== 'string' || r.note.length > 5000) throw new Error('說明或備註無效');
  const kind = r.kind ?? 'ordinary';
  if (!['ordinary', 'repayment', 'adjustment'].includes(kind)) throw new Error('交易種類無效');
  if (kind === 'repayment' && (r.payment_method !== 'cash' || r.type !== 'expense')) throw new Error('卡費繳款須為現金支出');
  if (kind === 'adjustment' && (!r.adjustment_reason?.trim() || !r.adjustment_at)) throw new Error('調整須附理由與調整時間');
  if (r.adjustment_at) validDate(r.adjustment_at);
  if (r.version !== undefined && (!Number.isSafeInteger(r.version) || r.version < 1)) throw new Error('紀錄版本無效');
  return { ...r, amount: money(r.amount), created_at: validDate(r.created_at), kind };
}
export const correctionCandidate = (r: RecordData) => /校正|調整|adjustment|correction|reconciliation|balance correction/i.test(`${r.description} ${r.note}`) || r.kind === 'adjustment';
const exact = (value: bigint) => { const n = Number(value); if (!Number.isSafeInteger(n)) throw new Error('總額超過安全整數範圍，停止顯示以避免失真'); return n; };
export function calculateLedger(raw: unknown[], settings: FinancialSettings = defaultSettings, range?: { from: string; to: string }) {
  const issues: { id: string; reason: string }[] = [], seen = new Set<string>(), records: RecordData[] = [];
  for (const item of raw) {
    try { const r = validateRecord(item); if (seen.has(r.id)) throw new Error('重複識別碼，須人工核對'); seen.add(r.id); if (!r.deleted_at) records.push(r); }
    catch (error) { issues.push({ id: String((item as RecordData)?.id ?? '?'), reason: (error as Error).message }); }
  }
  let income = 0n, expense = 0n, cash = 0n, credit = 0n, cardRefunds = 0n, repayments = 0n, adjustmentCash = 0n, liabilityDelta = 0n;
  const days = new Map<string, { date: string; income: number; expense: number; cashOut: number; creditOut: number; count: number }>();
  for (const r of records) {
    const day = taipeiDay(r.created_at);
    if (range && (day < range.from || day > range.to)) continue;
    if (!range && settings.openingAt && day < settings.openingAt) continue;
    const a = BigInt(r.amount), signed = r.type === 'income' ? a : -a;
    const d = days.get(day) ?? { date: day, income: 0, expense: 0, cashOut: 0, creditOut: 0, count: 0 }; d.count++;
    if (r.payment_method === 'cash') cash += signed; else liabilityDelta -= signed;
    if (r.kind === 'adjustment') { if (r.payment_method === 'cash') adjustmentCash += signed; }
    else if (r.kind === 'repayment') { repayments += a; liabilityDelta -= a; }
    else if (r.payment_method === 'credit_card' && r.type === 'income') cardRefunds += a;
    else if (r.type === 'income') { income += a; d.income = exact(BigInt(d.income) + a); }
    else { expense += a; d.expense = exact(BigInt(d.expense) + a); if (r.payment_method === 'credit_card') { credit += a; d.creditOut = exact(BigInt(d.creditOut) + a); } else d.cashOut = exact(BigInt(d.cashOut) + a); }
    days.set(day, d);
  }
  const cashBalance = settings.openingCash === null || range ? null : exact(BigInt(money(settings.openingCash)) + cash);
  const liabilities = settings.openingLiability === null || range ? null : exact(BigInt(money(settings.openingLiability)) + liabilityDelta);
  return { records, issues, income: exact(income), expense: exact(expense), netFlow: exact(income - expense), cashMovement: exact(cash), cashBalance, creditSpending: exact(credit), cardRefunds: exact(cardRefunds), repayments: exact(repayments), adjustmentCash: exact(adjustmentCash), liabilities, availableCredit: liabilities === null || settings.creditLimit === null ? null : exact(BigInt(money(settings.creditLimit)) - BigInt(liabilities)), days };
}
export function recentDays(count: number, now = new Date()): string[] { const end = new Date(`${taipeiDay(now)}T00:00:00Z`); return Array.from({ length: count }, (_, i) => new Date(end.getTime() - (count - i - 1) * 86400000).toISOString().slice(0, 10)); }
export function periodRange(period: 'day' | 'week' | 'month' | 'year', now = new Date()) { const to = taipeiDay(now), date = new Date(`${to}T00:00:00Z`); if (period === 'week') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7); if (period === 'month' || period === 'year') date.setUTCDate(1); if (period === 'year') date.setUTCMonth(0); return { from: date.toISOString().slice(0, 10), to }; }
