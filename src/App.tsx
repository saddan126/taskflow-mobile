import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { supabase, signIn, signOut } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import Capture    from './pages/Capture'
import Focus      from './pages/Focus'
import Tasks      from './pages/Tasks'
import TaskDetail from './pages/TaskDetail'

// ── Colours ───────────────────────────────────────────────────────────────────

const C = {
  acc:'#4f6ef7', t1:'#111', t2:'#555', t3:'#999',
  b1:'#f0f0f2', b2:'#e0e0e2',
}

// ── Bottom nav ────────────────────────────────────────────────────────────────

function BottomNav() {
  const loc = useLocation()
  const nav  = useNavigate()

  const tabs = [
    { path:'/',       label:'記錄', icon: <CaptureIcon /> },
    { path:'/focus',  label:'焦點', icon: <FocusIcon /> },
    { path:'/tasks',  label:'任務', icon: <TasksIcon /> },
  ]

  const active = (path: string) => {
    if (path === '/') return loc.pathname === '/'
    return loc.pathname.startsWith(path)
  }

  return (
    <nav style={{
      display:'flex', background:'#fff',
      borderTop:`1px solid ${C.b1}`,
      paddingBottom:'env(safe-area-inset-bottom)',
    }}>
      {tabs.map(tab => {
        const isActive = active(tab.path)
        return (
          <button key={tab.path} onClick={() => nav(tab.path)}
            style={{
              flex:1, display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center',
              gap:3, padding:'10px 0',
              background:'none', border:'none', cursor:'pointer',
              color: isActive ? C.acc : C.t3,
            }}>
            <span style={{ transform: isActive ? 'scale(1.1)' : 'scale(1)',
                           transition:'transform .15s' }}>
              {tab.icon}
            </span>
            <span style={{ fontSize:10, fontWeight: isActive ? 700 : 500 }}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

// ── Main app shell ────────────────────────────────────────────────────────────

function AppShell({ session }: { session: Session }) {
  const loc = useLocation()
  // Hide bottom nav on detail page
  const showNav = !loc.pathname.startsWith('/task/')

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ flex:1, minHeight:0, overflow:'hidden' }}>
        <Routes>
          <Route path="/"          element={<Capture />} />
          <Route path="/focus"     element={<Focus />} />
          <Route path="/tasks"     element={<Tasks />} />
          <Route path="/task/:id"  element={<TaskDetail />} />
        </Routes>
      </div>
      {showNav && <BottomNav />}
    </div>
  )
}

// ── Login screen ──────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (s: Session) => void }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return
    setLoading(true); setError(null)
    const { data, error: err } = await signIn(email.trim(), password.trim())
    setLoading(false)
    if (err) { setError(err.message); return }
    if (data.session) onLogin(data.session)
  }

  const fSt: React.CSSProperties = {
    width:'100%', fontSize:16, padding:'14px 16px', borderRadius:14,
    border:`1.5px solid ${C.b2}`, outline:'none', background:C.b1,
    color:C.t1, fontFamily:'inherit',
  }

  return (
    <div style={{
      height:'100%', display:'flex', flexDirection:'column',
      justifyContent:'center', padding:'32px 24px',
      paddingBottom:'calc(32px + env(safe-area-inset-bottom))',
    }}>
      {/* Logo */}
      <div style={{ textAlign:'center', marginBottom:40 }}>
        <div style={{
          width:64, height:64, borderRadius:18, background:C.acc,
          display:'flex', alignItems:'center', justifyContent:'center',
          margin:'0 auto 16px',
        }}>
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
            <path d="M4 12l5 6 11-10" stroke="#fff" strokeWidth="3"
                  strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 style={{ fontSize:28, fontWeight:800, color:C.t1, letterSpacing:'-0.03em' }}>
          TaskFlow
        </h1>
        <p style={{ fontSize:14, color:C.t3, marginTop:6 }}>登入以同步你的任務</p>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="電子郵件" style={fSt}
          onFocus={e => { e.currentTarget.style.borderColor=C.acc; e.currentTarget.style.background='#fff' }}
          onBlur={e  => { e.currentTarget.style.borderColor=C.b2;  e.currentTarget.style.background=C.b1 }}
        />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="密碼" style={fSt}
          onKeyDown={e => { if (e.key==='Enter') handleLogin() }}
          onFocus={e => { e.currentTarget.style.borderColor=C.acc; e.currentTarget.style.background='#fff' }}
          onBlur={e  => { e.currentTarget.style.borderColor=C.b2;  e.currentTarget.style.background=C.b1 }}
        />

        {error && (
          <div style={{ padding:'12px', borderRadius:12, background:'#fef2f2',
                        color:'#dc2626', fontSize:14 }}>
            ⚠ {error}
          </div>
        )}

        <button onClick={handleLogin} disabled={loading}
          style={{
            padding:'16px', borderRadius:14, background: loading ? C.b2 : C.acc,
            color:'#fff', border:'none', fontSize:16, fontWeight:700,
            cursor: loading ? 'not-allowed' : 'pointer', marginTop:4,
          }}>
          {loading ? '登入中...' : '登入'}
        </button>
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check existing session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}>
      <div style={{ width:32, height:32, border:'3px solid #4f6ef7',
                    borderTopColor:'transparent', borderRadius:'50%',
                    animation:'spin 0.7s linear infinite' }} />
    </div>
  )

  if (!session) return (
    <BrowserRouter>
      <LoginScreen onLogin={setSession} />
    </BrowserRouter>
  )

  return (
    <BrowserRouter>
      <AppShell session={session} />
    </BrowserRouter>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function CaptureIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}
function FocusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M16.9 16.9l2.1 2.1M4.9 19.1l2.1-2.1M16.9 7.1l2.1-2.1"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}
function TasksIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M8 6h13M8 12h13M8 18h13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M3 6l1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
