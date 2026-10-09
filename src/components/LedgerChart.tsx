import { useState } from 'react';
import type { RecordData } from '../types';
import { calculateLedger, periodRange, recentDays } from '../domain/ledger';
import { formatCurrency } from '../lib/utils';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
export function LedgerChart({ records }: { records: RecordData[] }) {
  const [period, setPeriod] = useState<'30' | 'day' | 'week' | 'month' | 'year' | 'all'>('30');
  const days = recentDays(30);
  const range = period === '30' ? { from: days[0], to: days[29] } : period === 'all' ? undefined : periodRange(period);
  const f = calculateLedger(records, undefined, range);
  const chart = period === '30' ? days.map(date => f.days.get(date) ?? { date, income: 0, expense: 0 }) : [...f.days.values()].sort((a,b) => a.date.localeCompare(b.date));
  return <section className="card"><h2>歲月流線 · Trend</h2><label>統計期間<select value={period} onChange={e => setPeriod(e.target.value as typeof period)}><option value="30">最近 30 天</option><option value="day">今日</option><option value="week">本週（週一開始）</option><option value="month">本月</option><option value="year">今年</option><option value="all">全部歷史</option></select></label>
    <div className="stats"><p>收入<strong>{formatCurrency(f.income)}</strong></p><p>一般支出<strong>{formatCurrency(f.expense)}</strong></p><p>淨收支<strong>{formatCurrency(f.netFlow)}</strong></p><p>現金變動<strong>{formatCurrency(f.cashMovement)}</strong></p></div>
    <p>臺北時區 · {range ? range.from + ' 至 ' + range.to : '全部歷史'} · 調整與繳款另列</p>
    <div className="chart" role="img" aria-label="每日一般收入和支出走勢">
    <ResponsiveContainer width="100%" height={240} minWidth={0}><AreaChart data={chart} margin={{ right: 8, left: -16 }}><CartesianGrid vertical={false} stroke="#bccad6"/><XAxis dataKey="date" tickFormatter={s => s.slice(5)} minTickGap={28} tick={{fontSize:12}}/><YAxis tick={{fontSize:12}} width={65}/><Tooltip/><Area isAnimationActive={false} dataKey="income" name="收入" stroke="#7a998b" fill="#bccad6"/><Area isAnimationActive={false} dataKey="expense" name="支出" stroke="#b08b8b" fill="#d6adad"/></AreaChart></ResponsiveContainer>
    </div><details><summary>檢視圖表資料</summary><div className="table-wrap"><table><thead><tr><th>日期</th><th>收入</th><th>支出</th></tr></thead><tbody>{chart.map(d => <tr key={d.date}><td>{d.date}</td><td>{d.income}</td><td>{d.expense}</td></tr>)}</tbody></table></div></details>
  </section>;
}
