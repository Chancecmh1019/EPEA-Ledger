import { Component, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, ChevronRight, Cloud, CloudOff, LayoutDashboard, List, Plus, RefreshCw, UserRound } from 'lucide-react';
import type { FinancialSettings, User } from './types';
import { defaultSettings } from './types';
import { calculateLedger, periodRange, taipeiDay } from './domain/ledger';
import { SyncLedger } from './lib/sync';
import { download } from './lib/export';
import { formatCurrency } from './lib/utils';
import { TransactionForm } from './components/TransactionForm';
import { TransactionHistory } from './components/TransactionHistory';
import { Overview } from './components/Overview';
import { Account } from './components/Account';
import { RouteScroll, rememberRouteScroll, useNativeViewport } from './lib/viewport';

class Boundary extends Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <main className="recovery-page"><div className="brand-symbol">e.</div><h1>先保護你的紀錄</h1><p role="alert">{this.state.error}</p><p>目前無法安全顯示帳本。你可以先匯出本機資料，再重新整理。</p><button className="button primary" onClick={() => download('browser-recovery.json', { ...localStorage })}>匯出本機資料</button><button className="button secondary" onClick={() => window.location.reload()}>重新整理</button></main> : this.props.children; }
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
  return <main className="login-page"><div className="login-brand"><div className="brand-symbol">e.</div><span>EPHEMERA LEDGER</span></div>
    <section className="login-layout"><div className="login-story"><p className="eyebrow">THE EVERYDAY, ACCOUNTED FOR.</p><h1>生活往前。<br/>收支，記得。</h1><p>忙碌的日子，也能留下一本清楚的帳。</p><div className="login-editorial" aria-hidden="true"><span>收入</span><div><span>日常支出</span><strong>每一筆，都有去向。</strong></div><span>明天繼續。</span></div></div>
    <div className="login-panel"><p className="eyebrow">浮生誌 · EPEA LEDGER</p><h2>回到你的帳本</h2><p className="muted">記下一筆，然後繼續生活。</p>
      {clientId ? <GoogleOAuthProvider clientId={clientId} locale="zh-TW" onScriptLoadError={() => setLoginError('Google 登入服務未能載入，請確認網路連線後重新整理。')}><div className="login-google"><GoogleLogin use_fedcm_for_button={true} theme="filled_black" shape="pill" size="large" text="continue_with" width={buttonWidth} logo_alignment="left" click_listener={() => setLoginError('')} onSuccess={response => { if (response.credential) { setLoginError(''); onLogin(response.credential); } }} onError={() => setLoginError('未完成 Google 登入。請確認瀏覽器允許此網站的登入視窗，再重新嘗試。')}/></div></GoogleOAuthProvider> : <p role="alert">Google 登入尚未設定。</p>}
      <p className="login-assurance"><Check size={15}/>原本的帳號，同一本帳。</p>{loginError && <p className="notice error" role="alert">{loginError}</p>}<details className="login-help"><summary>登入遇到問題？</summary><p>若登入視窗未開啟，請允許此網站的彈出式視窗，再重新嘗試。</p></details>
    </div></section><footer className="login-footer">Ephemera Ledger / 浮生誌 <span>YOUR DAYS, IN BALANCE.</span></footer></main>;
}
const navigation = [{ to: '/', label: '記一筆', Icon: Plus }, { to: '/history', label: '紀錄', Icon: List }, { to: '/dashboard', label: '總覽', Icon: LayoutDashboard }, { to: '/account', label: '帳戶', Icon: UserRound }];
function Ledger({ user, token, logout }: { user: User; token: string; logout: () => void }) {
  const ledger = useMemo(() => new SyncLedger(user.id, () => token, localStorage), [user.id, token]);
  const state = useSyncExternalStore(ledger.subscribe, ledger.snapshot);
  const location = useLocation();
  const navigate = useNavigate();
  const key = 'epea:settings:' + user.id;
  const [settings, setSettings] = useState<FinancialSettings>(() => { try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem(key) ?? 'null') }; } catch { return defaultSettings; } });
  const financials = useMemo(() => calculateLedger(state.records, settings), [state.records, settings]);
  const today = useMemo(() => calculateLedger(state.records, undefined, periodRange('day')), [state.records]);
  const pendingIds = state.pending.map(operation => operation.record.id);
  useEffect(() => {
    void ledger.refresh();
    const refresh = () => { if (document.visibilityState === 'visible') void ledger.refresh(); };
    const storage = (event: StorageEvent) => { if (event.key === 'epea:v1:' + user.id) ledger.reloadCache(); };
    window.addEventListener('storage', storage);
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('offline', refresh); window.addEventListener('focus', refresh); window.addEventListener('online', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('storage', storage); window.clearInterval(timer); window.removeEventListener('offline', refresh); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [ledger, user.id]);
  const listProps = { owner: user.id, records: financials.records, pendingIds, onUpdate: async (record: Parameters<typeof ledger.enqueue>[1]) => ledger.enqueue('PUT', record), onDelete: async (record: Parameters<typeof ledger.enqueue>[1]) => ledger.enqueue('DELETE', record), history: (id: string) => ledger.api('/api/records/' + encodeURIComponent(id) + '/history') };
  const pageTitle = navigation.find(item => item.to === location.pathname)?.label ?? '浮生誌';
  return <div className="workspace"><RouteScroll/>
    <aside className="sidebar"><Link className="brand" to="/" onClick={() => rememberRouteScroll(location.pathname)}><span className="brand-symbol">e.</span><span><strong>浮生誌</strong><small>EPEA LEDGER</small></span></Link><nav className="desktop-nav" aria-label="主要導覽">{navigation.map(({ to, label, Icon }) => <Link key={to} to={to} onClick={() => rememberRouteScroll(location.pathname)} aria-current={location.pathname === to ? 'page' : undefined}><Icon size={21}/>{label}{to === '/' && <span className="nav-short-label" aria-hidden="true">NEW</span>}</Link>)}</nav><p className="sidebar-note">生活的細節，<br/>一本一本記得。</p><button className="sidebar-account" onClick={() => { rememberRouteScroll(location.pathname); navigate('/account'); }}><span>{user.name.slice(0, 1)}</span><strong>{user.name}</strong><ChevronRight size={17}/></button></aside>
    <main className="main-content"><header className="app-header"><Link className="mobile-brand" to="/" onClick={() => rememberRouteScroll(location.pathname)}><span className="brand-symbol">e.</span><strong>浮生誌</strong></Link><span className="desktop-breadcrumb">EPEA Ledger <span>/</span> {pageTitle}</span><button className={`sync-indicator ${state.stale || state.pending.length ? 'needs-attention' : ''}`} disabled={state.busy} onClick={() => void ledger.refresh()} aria-label="重新同步">{state.busy ? <RefreshCw size={15}/> : state.stale ? <CloudOff size={15}/> : <Cloud size={15}/>}<span>{state.busy ? '同步中' : state.pending.length ? `${state.pending.length} 筆待確認` : state.stale ? '離線快照' : '已同步'}</span></button></header>
      {(state.stale || state.pending.length > 0) && <div className="sync-notice" role="status"><span>{state.stale ? '目前顯示上次快照，金額尚未確認。' : '有操作尚未確認，暫不計入統計。'}</span><Link to="/account" onClick={() => rememberRouteScroll(location.pathname)}>查看狀態<ArrowRight size={14}/></Link></div>}
      {!!financials.issues.length && <div className="notice error" role="alert">有 {financials.issues.length} 筆資料需核對，統計可能不完整。<details><summary>查看原因</summary>{financials.issues.map((issue, index) => <p key={index}>{issue.id}：{issue.reason}</p>)}</details></div>}
      <div className="page-heading"><div><p className="eyebrow">{location.pathname === '/' ? taipeiDay(new Date()).replaceAll('-', ' / ') : location.pathname === '/history' ? 'YOUR TRANSACTIONS' : location.pathname === '/dashboard' ? 'THE BIGGER PICTURE' : 'YOUR LEDGER'}</p><h1>{location.pathname === '/' ? '記一筆，繼續今天。' : location.pathname === '/history' ? '每一筆，都在這裡。' : location.pathname === '/dashboard' ? '看清你的收支。' : '你的帳本與設定。'}</h1></div>{location.pathname === '/history' && <Link className="button primary heading-add" to="/" onClick={() => rememberRouteScroll(location.pathname)}><Plus size={18}/>記一筆</Link>}</div>
      <Routes><Route path="/" element={<div className="entry-layout"><section className="entry-surface"><TransactionForm owner={user.id} pendingIds={pendingIds} confirmedRecords={state.records} onSave={async record => ledger.enqueue('POST', record)}/></section><section className="entry-context"><div className="today-summary"><span>今天已記支出</span><strong>{formatCurrency(today.expense)}</strong><Link to="/dashboard" onClick={() => rememberRouteScroll(location.pathname)}>查看總覽<ArrowRight size={15}/></Link></div><div className="section-heading recent-heading"><h2>最近記下的</h2><Link to="/history" onClick={() => rememberRouteScroll(location.pathname)}>全部紀錄<ChevronRight size={16}/></Link></div><TransactionHistory {...listProps} recent/></section></div>}/><Route path="/history" element={<TransactionHistory {...listProps}/>}/><Route path="/dashboard" element={<Overview records={state.records} settings={settings} onSettings={() => { rememberRouteScroll(location.pathname); navigate('/account?settings=1'); }}/>}/><Route path="/account" element={<Account user={user} state={state} ledger={ledger} settings={settings} onSettings={value => { localStorage.setItem(key, JSON.stringify(value)); setSettings(value); }} logout={logout} initialSettings={new URLSearchParams(location.search).has('settings')}/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>
      <footer className="app-footer"><span>浮生誌 · Ephemera Ledger</span><span>每天一點，清楚一點。</span></footer>
    </main>
    <nav className="mobile-nav" aria-label="手機主要導覽">{navigation.map(({ to, label, Icon }) => <Link key={to} to={to} onClick={() => rememberRouteScroll(location.pathname)} aria-current={location.pathname === to ? 'page' : undefined}><Icon size={21}/><span>{label}</span></Link>)}</nav>
  </div>;
}
const identityKey = 'epea:session-user';
function cachedUser(): User | null {
  try {
    const value = JSON.parse(localStorage.getItem(identityKey) ?? 'null');
    return /^google-[0-9]+$/.test(value?.id) && typeof value.name === 'string' ? value : null;
  } catch { return null; }
}
function Session() {
  // This is a display cache only. Every cloud request is authorized by the server cookie.
  const [user, setUser] = useState<User | null>(cachedUser);
  const [checking, setChecking] = useState(true), [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false), [showLogin, setShowLogin] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    let active = true, running = false;
    const check = async () => {
      if (running) return;
      running = true;
      const current = generation.current;
      try {
        const legacy = sessionStorage.getItem('epea:id-token');
        const response = await fetch('/api/auth/me', { credentials: 'same-origin', headers: legacy ? { Authorization: 'Bearer ' + legacy } : {}, signal: AbortSignal.timeout(15000) });
        if (!active || current !== generation.current) return;
        if (response.status === 401) {
          sessionStorage.removeItem('epea:id-token');
          setNeedsLogin(true);
          return;
        }
        if (!response.ok) throw new Error('暫時無法確認連線；紀錄會先保存在此裝置。');
        const identity: User = await response.json();
        if (!active || current !== generation.current) return;
        localStorage.setItem(identityKey, JSON.stringify(identity));
        sessionStorage.removeItem('epea:id-token');
        setUser(identity); setNeedsLogin(false); setError('');
      } catch (failure) {
        if (active && current === generation.current) setError(['TypeError', 'TimeoutError', 'AbortError'].includes((failure as Error).name) ? '目前無法連線；紀錄會先保存在此裝置。' : (failure as Error).message);
      } finally { running = false; if (active) setChecking(false); }
    };
    const resume = () => { if (document.visibilityState === 'visible') void check(); };
    const required = () => setNeedsLogin(true);
    const storage = (event: StorageEvent) => {
      if (event.key !== identityKey) return;
      generation.current++;
      setUser(cachedUser()); setShowLogin(false); setNeedsLogin(false);
      void check();
    };
    void check();
    const timer = window.setInterval(resume, 60000);
    window.addEventListener('focus', resume); window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume); window.addEventListener('epea:auth-required', required);
    window.addEventListener('storage', storage);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', resume); window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume); window.removeEventListener('epea:auth-required', required); window.removeEventListener('storage', storage); };
  }, []);
  const login = async (credential: string) => {
    generation.current++;
    setChecking(true); setError('');
    try {
      const response = await fetch('/api/auth/session', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? '暫時無法完成登入，請再試一次。');
      localStorage.setItem(identityKey, JSON.stringify(result));
      sessionStorage.removeItem('epea:id-token');
      setUser(result); setNeedsLogin(false); setShowLogin(false);
      window.dispatchEvent(new Event('online'));
    } catch (failure) { setError((failure as Error).message); }
    finally { setChecking(false); }
  };
  const logout = async () => {
    generation.current++;
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error();
      localStorage.removeItem(identityKey); sessionStorage.removeItem('epea:id-token');
      setUser(null); setNeedsLogin(true); setShowLogin(false); setError('');
    } catch { setError('目前無法完成登出，請恢復連線後再試。'); }
  };
  if (!user) return <>{checking ? <main className="recovery-page"><div className="brand-symbol">e.</div><p role="status">正在開啟你的帳本…</p></main> : <Identity onLogin={login}/>} {error && <p className="notice error" role="alert">{error}</p>}</>;
  return <>{needsLogin && <div className="notice warning" role="status">登入需要重新確認。你仍可記帳，紀錄會先保存在此裝置，登入後自動同步。 <button className="text-button" onClick={() => setShowLogin(true)}>確認 Google 登入</button></div>}{error && <p className="notice warning" role="status">{error}</p>}{showLogin && <><button className="button secondary" onClick={() => setShowLogin(false)}>返回記帳</button><Identity onLogin={login}/></>}<div hidden={showLogin}><Ledger key={user.id} user={user} token="" logout={logout}/></div></>;
}
export default function App() { useNativeViewport(); return <Boundary><BrowserRouter><Session/></BrowserRouter></Boundary>; }
