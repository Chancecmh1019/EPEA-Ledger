import type { calculateLedger } from '../domain/ledger';
import { formatCurrency } from '../lib/utils';
export function WaterTank({ financials: f, isRefreshing = false }: { financials: ReturnType<typeof calculateLedger>; isRefreshing?: boolean }) {
  const value = f.cashBalance ?? f.cashMovement;
  const fill = Math.min(100, Math.max(0,value / 50000 * 100));
  return <section className="water-tank card" aria-label="現金水槽">
    <div className="water-fill" style={{height:fill+'%',background:value<0?'#d6adad':'#bccad6'}} aria-hidden="true"><svg viewBox="0 0 400 30" preserveAspectRatio="none"><path d="M0 15 Q100 0 200 15 T400 15 V30 H0Z" fill={value<0?'#d6adad':'#bccad6'}/></svg></div>
    <div className="water-label"><h2>浮生儲水槽</h2><p>{f.cashBalance===null?'現金累積變動 · 期初未確認':'現金餘額'}</p><strong data-testid="tank-balance" className="balance">{formatCurrency(value)}</strong>
    <p>{value<0?'負值仍完整顯示；水位呈空槽':'水位為視覺比例，满格 NT$50,000'}</p>{isRefreshing&&<p role="status">正在確認雲端…</p>}</div>
  </section>;
}
