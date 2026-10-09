import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CreditCard, Info } from 'lucide-react';
import type { FinancialSettings, RecordData } from '../types';
import { calculateLedger, periodRange, recentDays, taipeiDay } from '../domain/ledger';
import { formatCurrency } from '../lib/utils';

export function Overview({ records, settings, onSettings }: { records: RecordData[]; settings: FinancialSettings; onSettings: () => void }) {
  const [period, setPeriod] = useState<'month' | 'week' | 'year' | '30'>('month');
  const days = recentDays(30);
  const range = period === '30' ? { from: days[0], to: days[29] } : periodRange(period);
  const all = useMemo(() => calculateLedger(records, settings), [records, settings]);
  const flow = useMemo(() => calculateLedger(records, undefined, range), [records, range.from, range.to]);
  const chart = useMemo(() => {
    const buckets = new Map<string, { key: string; label: string; income: number; expense: number }>();
    if (period === 'year') {
      for (let month = 1; month <= Number(range.to.slice(5, 7)); month++) {
        const key = range.to.slice(0, 4) + '-' + String(month).padStart(2, '0');
        buckets.set(key, { key, label: `${month}月`, income: 0, expense: 0 });
      }
    } else {
      const start = new Date(range.from + 'T00:00:00Z');
      for (let time = start.getTime(); time <= Date.parse(range.to + 'T00:00:00Z'); time += 86400000) {
        const key = new Date(time).toISOString().slice(0, 10);
        buckets.set(key, { key, label: key.slice(5).replace('-', '/'), income: 0, expense: 0 });
      }
    }
    for (const day of flow.days.values()) {
      const key = period === 'year' ? day.date.slice(0, 7) : day.date;
      const bucket = buckets.get(key);
      if (bucket) { bucket.income += day.income; bucket.expense += day.expense; }
    }
    return [...buckets.values()];
  }, [flow, period, range.from, range.to]);
  const maximum = Math.max(1, ...chart.map(day => Math.max(day.income, day.expense)));
  const cashExpenses = flow.expense - flow.creditSpending;
  const count = flow.records.filter(record => { const day = taipeiDay(record.created_at); return day >= range.from && day <= range.to; }).length;
  return <div className="overview-page">
    <section className="balance-panel"><div><p className="eyebrow">CASH POSITION</p><h2>{all.cashBalance === null ? '現金累積變動' : '現金餘額'}</h2><strong className="hero-number">{formatCurrency(all.cashBalance ?? all.cashMovement)}</strong><p className="balance-caption">{all.cashBalance === null ? '期初現金尚未確認，此數字是紀錄的淨變動，不代表你目前持有的現金。' : `依${settings.openingAt ? settings.openingAt + ' 起' : '全部歷史'}的現金紀錄與期初設定計算。`}</p></div><button className="balance-settings" onClick={onSettings}><Info size={17}/>{all.cashBalance === null ? '設定期初資料' : '檢視財務設定'}</button></section>
    <section className="flow-section"><div className="section-heading"><div><p className="eyebrow">INCOME & SPENDING</p><h2>收支，一眼看清</h2></div><select aria-label="統計期間" className="period-select" value={period} onChange={event => setPeriod(event.target.value as typeof period)}><option value="month">本月</option><option value="week">本週</option><option value="30">最近 30 天</option><option value="year">今年</option></select></div>
      <div className="flow-totals"><div><span><ArrowDownLeft size={17}/>收入</span><strong className="income-text">{formatCurrency(flow.income)}</strong></div><div><span><ArrowUpRight size={17}/>支出</span><strong>{formatCurrency(flow.expense)}</strong></div><div><span>淨收支</span><strong>{formatCurrency(flow.netFlow)}</strong></div></div>
      <div className="chart-heading"><span>{period === 'year' ? '每月' : '每日'}收支</span><div className="chart-legend"><span className="legend-income">收入</span><span className="legend-expense">支出</span></div></div>
      <div className="bar-chart" role="group" aria-label="收支趨勢"><div className="chart-grid" aria-hidden="true"/><div className="chart-bars">{chart.map((day, index) => <div className="chart-column" key={day.key} tabIndex={0} aria-label={`${day.key}：收入 ${day.income}，支出 ${day.expense}`}><div className="bar-pair"><span className="bar-income" style={{ height: `${day.income / maximum * 100}%` }}/><span className="bar-expense" style={{ height: `${day.expense / maximum * 100}%` }}/></div><span className="bar-label">{chart.length <= 12 || index === 0 || index === chart.length - 1 || index % 7 === 0 ? day.label : ''}</span><span className="bar-tooltip">{day.label}<br/>收入 {formatCurrency(day.income)}<br/>支出 {formatCurrency(day.expense)}</span></div>)}</div></div>
      <p className="field-note">{range.from} — {range.to} · {count} 筆 · 繳款、退款與調整另列</p>
      {!count && <p className="notice">這段期間還沒有紀錄。你可以先記下一筆今天的收支。</p>}
    </section>
    <div className="overview-bottom"><section className="payment-summary"><div className="section-heading"><h2>支出去了哪裡</h2><span>依付款方式</span></div><div className="payment-breakdown"><div><span>現金支出</span><strong>{formatCurrency(cashExpenses)}</strong></div><div><span>信用卡消費</span><strong>{formatCurrency(flow.creditSpending)}</strong></div></div><div className="spending-track" aria-label={`現金支出 ${cashExpenses}，信用卡消費 ${flow.creditSpending}`}><span style={{ width: `${flow.expense ? cashExpenses / flow.expense * 100 : 0}%` }}/></div></section>
      <section className="credit-summary"><div className="section-heading"><h2><CreditCard size={19}/>信用卡</h2><span>全部紀錄</span></div><div className="credit-position"><span>目前負債</span><strong>{all.liabilities === null ? '期初未確認' : formatCurrency(all.liabilities)}</strong></div><p className="field-note">{all.availableCredit === null ? '期初負債與額度完整設定後，才會顯示可用額度。' : `可用額度 ${formatCurrency(all.availableCredit)}`}</p></section></div>
    <details className="calculation-detail"><summary>查看期間計算明細</summary><dl><div><dt>現金淨變動</dt><dd>{formatCurrency(flow.cashMovement)}</dd></div><div><dt>信用卡退款</dt><dd>{formatCurrency(flow.cardRefunds)}</dd></div><div><dt>卡費繳款</dt><dd>{formatCurrency(flow.repayments)}</dd></div><div><dt>現金帳務調整</dt><dd>{formatCurrency(flow.adjustmentCash)}</dd></div></dl><p className="field-note">以臺北時區分日。歷史「校正」仍依原分類計算，不會自動排除或補入平衡金額。</p><details><summary>圖表數據</summary><table><thead><tr><th>日期</th><th>收入</th><th>支出</th></tr></thead><tbody>{chart.map(day => <tr key={day.key}><td>{day.key}</td><td>{formatCurrency(day.income)}</td><td>{formatCurrency(day.expense)}</td></tr>)}</tbody></table></details></details>
  </div>;
}
