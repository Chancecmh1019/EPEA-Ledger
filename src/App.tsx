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
import { RouteScroll, useNativeViewport, rememberRouteScroll } from './lib/viewport';
class Boundary extends Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <main className="card"><h1>無法安全顯示帳務</h1><p role="alert">{this.state.error}</p><p>原始資料仍保留。請先匯出瀏覽器儲存資料再重新載入。</p><button onClick={() => download('browser-recovery.json', { ...localStorage })}>匯出本機資料</button><button onClick={() => window.location.reload()}>重新載入</button></main> : this.props.children; }
}
function Identity({ onLogin }: { onLogin: (token: string) => void }) {
  const [loginError, setLoginError] = useState('');
  const [buttonWidth, setButtonWidth] = useState(() => Math.min(320, Math.max(200, window.innerWidth - 96)));
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  useEffect(() => {
    const resize = () => setButtonWidth(Math.min(320, Math.max(200, window.innerWidth - 96)));
    window.addEventListener('resize', resize, { passive: true });
    return () => window.removeEventListener('resize', resize);
  }, []);
  return <main className="login">
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-mark" aria-hidden="true"><Leaf size={44} strokeWidth={1.15}/></div>
      <p className="login-eyebrow">EPHEMERA LEDGER</p>
      <h1 id="login-title">浮生誌</h1>
      <p className="login-tagline">把日常，慢慢記下。</p>
      <p className="login-description">每一筆收支，都有生活的痕跡。<br/>回到你的帳本，接續今天的故事。</p>
      <div className="login-divider" aria-hidden="true"><span/></div>
      {clientId ? <GoogleOAuthProvider clientId={clientId} locale="zh-TW" onScriptLoadError={() => setLoginError('Google 登入服務未能載入，請確認網路連線後重新整理。')}>
        <div className="login-google"><GoogleLogin
          use_fedcm_for_button={true} theme="filled_black" shape="pill" size="large" text="continue_with" width={buttonWidth} logo_alignment="left"
          click_listener={() => setLoginError('')}
          onSuccess={r => { if (r.credential) { setLoginError(''); onLogin(r.credential); } }}
          onError={() => setLoginError('未完成 Google 登入。請確認瀏覽器允許此網站的登入視窗，再重新嘗試。')}
        /></div>
      </GoogleOAuthProvider> : <p role="alert">Google 登入尚未設定。</p>}
      <p className="login-continuity">使用原本的 Google 帳號，回到同一本帳。</p>
      {loginError && <p className="login-error" role="alert">{loginError}</p>}
      <details className="login-help"><summary>登入遇到問題？</summary><p>若登入視窗未開啟，請在瀏覽器網址列允許此網站的彈出式視窗，再按一次登入。也可暫停阻擋登入視窗的擴充套件後重試。</p></details>
    </section>
    <p className="login-footer">EPEA Ledger <span aria-hidden="true">·</span> 歲月留痕，收支有據。</p>
  </main>;
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
