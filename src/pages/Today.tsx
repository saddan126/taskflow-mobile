import { useEffect, useRef, useState } from 'react'
import { useDailyMetrics, type DailyMetric } from '../hooks/useDailyMetrics'

const C = {
  acc:'#4f6ef7', t1:'#111', t2:'#555', t3:'#999',
  b1:'#f0f0f2', b2:'#e0e0e2', grn:'#16a34a',
}

export default function Today() {
  const { metrics, logs, loading, actionError, saveValue } = useDailyMetrics()

  const [values, setValues]       = useState<Record<string, string>>({})  // metric_id → input text
  const [savedFlash, setSavedFlash] = useState(false)

  const seeded     = useRef(false)
  const timers     = useRef<Record<string, number>>({})   // metric_id → debounce timer (pending save)
  const flashTimer = useRef<number | undefined>(undefined)
  const valuesRef  = useRef(values);   valuesRef.current = values
  const metricsRef = useRef(metrics);  metricsRef.current = metrics
  const saveRef    = useRef(saveValue); saveRef.current = saveValue

  // Seed the inputs once from today's logs after the first load.
  useEffect(() => {
    if (loading || seeded.current) return
    const seed: Record<string, string> = {}
    for (const m of metrics) {
      const log = logs[m.id]
      seed[m.id] = log
        ? (m.type === 'number'
            ? (log.value_number != null ? String(log.value_number) : '')
            : (log.value_text ?? ''))
        : ''
    }
    setValues(seed)
    seeded.current = true
  }, [loading, metrics, logs])

  // Flush any pending debounced saves when leaving the page (e.g. switching tabs).
  useEffect(() => {
    return () => {
      for (const id of Object.keys(timers.current)) {
        clearTimeout(timers.current[id])
        const m = metricsRef.current.find(x => x.id === id)
        if (m) void saveRef.current(m, valuesRef.current[id] ?? '')   // fire-and-forget
      }
    }
  }, [])

  const flashSaved = () => {
    setSavedFlash(true)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setSavedFlash(false), 1600)
  }

  const commit = async (m: DailyMetric, v: string) => {
    delete timers.current[m.id]
    const ok = await saveValue(m, v)
    if (ok) flashSaved()
  }

  const onChange = (m: DailyMetric, v: string) => {
    setValues(prev => ({ ...prev, [m.id]: v }))
    if (timers.current[m.id]) clearTimeout(timers.current[m.id])
    timers.current[m.id] = window.setTimeout(() => { void commit(m, v) }, 900)
  }

  const onBlur = (m: DailyMetric) => {
    if (timers.current[m.id]) { clearTimeout(timers.current[m.id]); delete timers.current[m.id] }
    void commit(m, valuesRef.current[m.id] ?? '')
  }

  return (
    <div style={{ height:'100%', overflowY:'auto', background:C.b1 }}>

      {/* Header */}
      <div style={{ padding:'20px 16px 8px', paddingTop:'calc(20px + env(safe-area-inset-top))',
                    display:'flex', alignItems:'center', gap:8 }}>
        <h1 style={{ fontSize:28, fontWeight:800, color:C.t1, letterSpacing:'-0.03em' }}>今日狀態</h1>
        <div style={{ flex:1 }} />
        {/* Low-key auto-save indicator */}
        <span style={{ fontSize:13, fontWeight:600, color:C.t3,
                       display:'flex', alignItems:'center', gap:4,
                       opacity: savedFlash ? 1 : 0, transition:'opacity .3s' }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-6" stroke={C.grn} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          已儲存
        </span>
      </div>

      <div style={{ padding:'8px 16px 32px' }}>

        {/* ── 每日指標 ── */}
        <SectionLabel>每日指標</SectionLabel>
        {loading ? (
          <Spinner />
        ) : metrics.length === 0 ? (
          <EmptyMetrics />
        ) : (
          <div style={{ background:'#fff', borderRadius:16, overflow:'hidden',
                        boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
            {metrics.map((m, i) => (
              <div key={m.id} style={{
                display:'flex', alignItems:'center', gap:12,
                padding:'14px 16px',
                borderTop: i > 0 ? `1px solid ${C.b1}` : 'none',
              }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:15, fontWeight:600, color:C.t1 }}>{m.name}</div>
                  {m.unit && <div style={{ fontSize:12, color:C.t3, marginTop:2 }}>{m.unit}</div>}
                </div>
                <input
                  value={values[m.id] ?? ''}
                  onChange={e => onChange(m, e.target.value)}
                  onBlur={() => onBlur(m)}
                  type={m.type === 'number' ? 'number' : 'text'}
                  inputMode={m.type === 'number' ? 'decimal' : undefined}
                  placeholder={m.type === 'number' ? '—' : '輸入…'}
                  style={{
                    width: m.type === 'number' ? 100 : 168,
                    textAlign: m.type === 'number' ? 'right' : 'left',
                    fontSize:16, fontWeight:600, color:C.t1,
                    padding:'8px 12px', borderRadius:10,
                    border:`1.5px solid ${C.b2}`, background:C.b1,
                    outline:'none', fontFamily:'inherit', boxSizing:'border-box',
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* ── 每日節律 ── 階段 5-B 預留位置，這次不實作 */}
      </div>

      {actionError && <Toast text={actionError} />}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize:12, fontWeight:700, color:C.t3,
                textTransform:'uppercase', letterSpacing:'0.07em',
                margin:'4px 4px 10px' }}>
      {children}
    </p>
  )
}

function Spinner() {
  return (
    <div style={{ display:'flex', justifyContent:'center', padding:40 }}>
      <div style={{ width:28, height:28, border:'3px solid #4f6ef7',
                    borderTopColor:'transparent', borderRadius:'50%',
                    animation:'spin 0.7s linear infinite' }} />
    </div>
  )
}

function EmptyMetrics() {
  return (
    <div style={{ background:'#fff', borderRadius:16, padding:'28px 16px',
                  textAlign:'center', boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
      <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
      <p style={{ fontSize:14, color:C.t2, fontWeight:600 }}>目前沒有啟用中的指標</p>
      <p style={{ fontSize:13, color:C.t3, marginTop:4 }}>可在桌面版新增或管理指標</p>
    </div>
  )
}

// Transient write-failure toast. Auto-clears via useDailyMetrics.
function Toast({ text }: { text: string }) {
  return (
    <div style={{
      position:'fixed', left:16, right:16,
      bottom:'calc(72px + env(safe-area-inset-bottom))',
      padding:'12px 16px', borderRadius:14,
      background:'#fef2f2', border:'1px solid #fecaca',
      color:'#dc2626', fontSize:14, fontWeight:500, textAlign:'center',
      boxShadow:'0 4px 20px rgba(0,0,0,.12)', zIndex:50,
    }}>
      {text}
    </div>
  )
}
