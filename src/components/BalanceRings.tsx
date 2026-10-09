import type { calculateLedger } from '../domain/ledger';
import { formatCurrency } from '../lib/utils';
type Financials = ReturnType<typeof calculateLedger>;
export function BalanceRings({ financials: f }: { financials: Financials }) {
  return <section className="card"><h2>餘額對稱儀 · Balance</h2>
    <div className="balance-row"><div className="ring"><span>Cash</span></div><div><p>{f.cashBalance === null ? '現金累積變動（期初未確認）' : '現金餘額'}</p><strong data-testid="rings-balance" className="balance">{formatCurrency(f.cashBalance ?? f.cashMovement)}</strong></div></div>
    <div className="balance-row"><div className="ring pink"><span>Card</span></div><div><p>信用卡支出 {formatCurrency(f.creditSpending)}</p><p>負債 {f.liabilities === null ? '期初未確認' : formatCurrency(f.liabilities)}</p><p>可用額度 {f.availableCredit === null ? '尚未設定／確認' : formatCurrency(f.availableCredit)}</p></div></div>
    <p>卡費繳款 {formatCurrency(f.repayments)} · 卡片退款 {formatCurrency(f.cardRefunds)}</p>
  </section>;
}
