import type { calculateLedger } from '../domain/ledger';
import { recentDays } from '../domain/ledger';
export function ActivityGrid({ financials }: { financials: ReturnType<typeof calculateLedger> }) {
  return <section className="card"><h2>光陰格子 · Footprints</h2><div className="activity">{recentDays(28).map(date => { const count = financials.days.get(date)?.count ?? 0; return <div key={date} aria-label={date + '：' + count + ' 筆'} title={date + '：' + count + ' 筆'} style={{ background: count ? '#bccad6' : '#fff8', opacity: count > 4 ? 1 : count ? .65 : 1 }}><span>{date.slice(8)}</span></div>; })}</div><p>最近 28 天 · 臺北日期</p></section>;
}
