import { Component, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { Leaf, Plus, ChartNoAxesCombined, Clock } from 'lucide-react';
import type { FinancialSettings, User } from './types';
import { defaultSettings } from './types';
import { calculateLedger, correctionCandidate } from './domain/ledger';
import { SyncLedger } from './lib/sync';
import { download } from './lib/export';
import { WaterTank } from './components/WaterTank';
import { FluidSlider } from './components/FluidSlider';
import { RecordList } from './components/RecordList';
import { BalanceRings } from './components/BalanceRings';
import { ActivityGrid } from './components/ActivityGrid';
import { LedgerChart } from './components/LedgerChart';
import { Preferences } from './components/Preferences';
import { ArchivePreview } from './components/ArchivePreview';
import { RouteScroll, useNativeViewport, rememberRouteScroll } from './lib/viewport';
class Boundary extends Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <main className="card"><h1>無法安全顯示帳務</h1><p role="alert">{this.state.error}</p><p>原始資料仍保留。請先匯出瀏覽器儲存資料再重新載入。</p><button onClick={() => download('browser-recovery.json', { ...localStorage })}>匯出本機資料</button><button onClick={() => window.location.reload()}>重新載入</button></main> : this.props.children; }
}
function Identity({ onLogin }: { onLogin: (token: string) => void }) {
  const [preview, setPreview] = useState(false);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (preview) return <main className="app-shell"><header><h1>浮生誌 · EPEA Ledger</h1><button onClick={() => setPreview(false)}>返回登入</button></header><ArchivePreview/></main>;
  return <main className="login"><Leaf size={56} strokeWidth={1}/><h1>浮生誌</h1><p>Ephemera Ledger · EPEA Ledger</p><p>歲月留痕，讓每筆生活都有依據。</p>{clientId ? <GoogleOAuthProvider clientId={clientId}><GoogleLogin onSuccess={r => { if (r.credential) onLogin(r.credential); }} onError={() => {}} /></GoogleOAuthProvider> : <p role="status">Google 登入尚未設定。請設定公開 Client ID 與伺服器驗證設定。</p>}<button onClick={() => setPreview(true)}>開啟 CSV 唯讀檢視</button></main>;
}
function Ledger({ user, token, logout }: { user: User; token: string; logout: () => void }) {
  const ledger = useMemo(() => new SyncLedger(user.id, () => token, localStorage), [user.id, token]);
  const state = useSyncExternalStore(ledger.subscribe, ledger.snapshot);
  const location = useLocation();
  const key = 'epea:settings:' + user.id;
  const [settings, setSettings] = useState<FinancialSettings>(() => { try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? defaultSettings; } catch { return defaultSettings; } });
  const f = useMemo(() => calculateLedger(state.records, settings), [state.records,settings]);
  useEffect(() => {
    void ledger.refresh();
    const refresh = () => { if (document.visibilityState === 'visible') void ledger.refresh(); };
    window.addEventListener('online', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [ledger]);
  return <main className="app-shell"><RouteScroll/><header><div><h1><Leaf size={22}/>浮生誌</h1><p>Ephemera Ledger · EPEA Ledger</p></div><div><span>{user.name}</span><button onClick={logout}>登出</button></div></header>
    <section className="sync-status" aria-live="polite"><p>{state.busy ? '同步中…' : state.message} · {state.records.length} 筆</p>{state.stale && <strong>快取尚未驗證，金額不能視為目前餘額</strong>}<button disabled={state.busy} onClick={() => void ledger.refresh()}>重新同步</button><button onClick={() => download('ledger-recovery.json', { confirmed: state.records, pending: state.pending, settings, legacy: localStorage.getItem('epea:legacy-backup:' + user.id) })}>匯出備份</button></section>
    {!!state.pending.length && <section className="card"><h2>待處理操作（不計入已確認金額）</h2>{state.pending.map(p => <article key={p.id}><p>{p.record.description} · {p.method} · {p.status === 'pending' ? '已儲存本機／待同步' : p.status === 'conflict' ? '衝突需審查' : '失敗'} {p.error}</p><button disabled={state.busy} onClick={() => { if (window.confirm('保留復原副本後，取消這筆待處理操作？')) ledger.discard(p.id); }}>取消待處理操作</button></article>)}</section>}
    {!!f.issues.length && <section className="card warning" role="alert"><h2>資料需核對，以下金額不完整</h2>{f.issues.map((issue,i) => <p key={i}>{issue.id}：{issue.reason}</p>)}</section>}
    <Routes><Route path="/" element={<div className="dashboard"><FluidSlider owner={user.id} onSave={async r => ledger.enqueue('POST',r)}/><WaterTank financials={f} isRefreshing={state.busy}/></div>}/>
      <Route path="/dashboard" element={<div className="dashboard"><div><BalanceRings financials={f}/><ActivityGrid financials={f}/><Preferences settings={settings} onSave={s => { localStorage.setItem(key, JSON.stringify(s)); setSettings(s); }}/></div><LedgerChart records={state.records}/></div>}/>
      <Route path="/history" element={<RecordList owner={user.id} records={f.records} pendingIds={state.pending.map(p=>p.record.id)} onUpdate={async r=>ledger.enqueue('PUT',r)} onDelete={async r=>ledger.enqueue('DELETE',r)} history={id=>ledger.api('/api/records/' + encodeURIComponent(id) + '/history')}/>}/>
      <Route path="*" element={<p>頁面不存在，請使用下方導覽。</p>}/></Routes>
    <details className="card"><summary>校正候選模擬（不修改資料）</summary><p>文字僅表示候選；無法單憑「校正」推定原意。期初未確認時以下是現金變動。</p><p>含全部候選：{f.cashMovement.toLocaleString()}；假設排除全部候選：{calculateLedger(state.records.filter(r=>!correctionCandidate(r)),settings).cashMovement.toLocaleString()}</p>{f.records.filter(correctionCandidate).map(r=><p key={r.id}>{r.description} · {r.id} · {r.payment_method} · {r.type} · {r.amount} · 原意待審查</p>)}</details>
    <nav className="floating-nav" aria-label="主要導覽">{[{to:'/',label:'盲記',Icon:Plus},{to:'/dashboard',label:'圖表',Icon:ChartNoAxesCombined},{to:'/history',label:'時光',Icon:Clock}].map(({to,label,Icon})=><Link key={to} to={to} onClick={() => rememberRouteScroll(location.pathname)} aria-current={location.pathname===to?'page':undefined}><Icon size={20}/>{label}</Link>)}</nav>
  </main>;
}
function Session() {
  const [token, setToken] = useState(() => sessionStorage.getItem('epea:id-token') ?? '');
  const [user, setUser] = useState<User | null>(null), [error, setError] = useState('');
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    fetch('/api/auth/me',{headers:{Authorization:'Bearer '+token},signal:controller.signal}).then(async res=>{if(!res.ok) throw new Error('登入驗證失敗，請重新登入'); return res.json();}).then(setUser).catch(err=>{if(!controller.signal.aborted){setError(err.message);setToken('');sessionStorage.removeItem('epea:id-token');}});
    return ()=>controller.abort();
  },[token]);
  if (!user || !token) return <><Identity onLogin={value=>{sessionStorage.setItem('epea:id-token',value);setToken(value);setError('');}}/>{error && <p role="alert">{error}</p>}</>;
  return <Ledger key={user.id} user={user} token={token} logout={()=>{sessionStorage.removeItem('epea:id-token');setToken('');setUser(null);}}/>;
}
export default function App() { useNativeViewport(); return <Boundary><BrowserRouter><Session/></BrowserRouter></Boundary>; }
