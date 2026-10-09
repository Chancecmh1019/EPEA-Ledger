import { useState } from 'react';
import { money, validDate } from '../domain/ledger';
import type { FinancialSettings } from '../types';
export function Preferences({ settings, onSave }: { settings: FinancialSettings; onSave: (s: FinancialSettings) => void }) {
  const [error, setError] = useState('');
  return <details className="card"><summary>財務設定（僅此瀏覽器，需依真實帳戶確認）</summary><p>期初日期為當日 00:00 臺北時間，僅計入該日之後的交易。空白代表未知。</p>
    <form onSubmit={e => { e.preventDefault(); try { const data = new FormData(e.currentTarget); const num = (k: string) => data.get(k) === '' ? null : money(data.get(k)); const date = String(data.get('openingAt') ?? ''); if (date) validDate(date); onSave({ openingCash: num('cash'), openingLiability: num('liability'), creditLimit: num('limit'), openingAt: date || null }); setError('設定已儲存於此瀏覽器'); } catch(err) { setError((err as Error).message); } }}>
      <label>期初現金（NT$）<input name="cash" inputMode="numeric" defaultValue={settings.openingCash ?? ''}/></label><label>期初信用卡負債（NT$）<input name="liability" inputMode="numeric" defaultValue={settings.openingLiability ?? ''}/></label><label>信用卡額度（NT$）<input name="limit" inputMode="numeric" defaultValue={settings.creditLimit ?? ''}/></label><label>期初日期（選填；空白含全部歷史）<input type="date" name="openingAt" defaultValue={settings.openingAt ?? ''}/></label><button className="primary">儲存設定</button>{error && <p role="status">{error}</p>}
    </form></details>;
}
