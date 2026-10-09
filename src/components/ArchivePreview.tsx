import { useState } from 'react';
import type { RecordData, FinancialSettings } from '../types';
import { defaultSettings } from '../types';
import { parseCsv, normalizeExportDate } from '../domain/csv';
import { calculateLedger, correctionCandidate } from '../domain/ledger';
import { WaterTank } from './WaterTank';
import { BalanceRings } from './BalanceRings';
import { LedgerChart } from './LedgerChart';
import { Preferences } from './Preferences';
import { formatCurrency } from '../lib/utils';
import { download } from '../lib/export';
export function ArchivePreview() {
  const [raw,setRaw]=useState<RecordData[]>([]),[owner,setOwner]=useState(''),[error,setError]=useState(''),[search,setSearch]=useState('');
  const [settings,setSettings]=useState<FinancialSettings>(defaultSettings);
  const owners=[...new Set(raw.map(r=>r.user_id))];
  const rows=raw.filter(r=>r.user_id===owner), f=calculateLedger(rows,settings);
  return <section className="card archive"><h2>CSV 歷史帳本 · 唯讀檢視</h2><p>檔案只在此瀏覽器記憶體中處理，不上傳、不修改原檔，也不代表即時 Supabase。</p>
    <label>開啟帳務 CSV<input type="file" accept=".csv,text/csv" onChange={async e=>{try{const file=e.target.files?.[0];if(!file)return;const text=await file.text();const parsed=parseCsv(text).map(r=>({...r,created_at:normalizeExportDate(r.created_at),is_urgent:r.is_urgent==='true'})) as unknown as RecordData[];setRaw(parsed);const unique=[...new Set(parsed.map(r=>r.user_id))];setOwner(unique.length===1?unique[0]:'');setError('');}catch(err){setError((err as Error).message);}}}/></label>
    {owners.length>1 && <label>選擇帳戶<select value={owner} onChange={e=>setOwner(e.target.value)}><option value="">請選擇</option>{owners.map(o=><option key={o}>{o}</option>)}</select></label>}
    {error && <p role="alert">{error}</p>}{!!f.issues.length && <p role="alert">有 {f.issues.length} 筆格式問題，統計不完整：{f.issues.map(i=>i.id+' '+i.reason).join('；')}</p>}
    {!!rows.length && <><div className="dashboard"><WaterTank financials={f}/><BalanceRings financials={f}/></div><Preferences settings={settings} onSave={setSettings}/><LedgerChart records={f.records}/>
    <button onClick={()=>download('archive-simulation.json',{owner,settings,allCashMovement:f.cashMovement,withoutCorrectionCandidates:calculateLedger(rows.filter(r=>!correctionCandidate(r)),settings).cashMovement,issues:f.issues,records:raw,productionWrites:false})}>匯出唯讀模擬</button><label>搜尋歷史<input type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label>{f.records.filter(r=>(r.description+' '+r.note).includes(search)).slice(0,100).map(r=><article className="record" key={r.id}><h3>{r.description} · {formatCurrency(r.amount)}</h3><p>{r.created_at} · {r.type} · {r.payment_method}</p>{correctionCandidate(r)&&<p className="warning">校正候選，維持原始分類</p>}</article>)}<p>此唯讀預覽最多顯示前 100 筆搜尋結果；所有有效紀錄均參與統計。</p></>}
  </section>;
}
