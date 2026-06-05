import { useEffect, useRef, useState } from 'react'
import { useDailyMetrics, type DailyMetric } from '../hooks/useDailyMetrics'
import { useDailyRhythm, type DailyRhythmItem } from '../hooks/useDailyRhythm'

const C = {
  acc:'#4f6ef7', t1:'#111', t2:'#555', t3:'#999',
  b1:'#f0f0f2', b2:'#e0e0e2', grn:'#16a34a',
}

export default function Today() {
  const { metrics, logs, loading, actionError, saveValue } = useDailyMetrics()
  const { items: rhythmItems, logs: rhythmLogs, loading: rhythmLoading,
          actionError: rhythmError, setCount } = useDailyRhythm()

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

  // Rhythm dot tap → set today's count (clamped in the hook); flash on success.
  const handleSet = async (item: DailyRhythmItem, n: number) => {
    const ok = await setCount(item, n)
    if (ok) flashSaved()
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

        {/* ── 每日節律 ── */}
        <div style={{ height:20 }} />
        <SectionLabel>每日節律</SectionLabel>
        {rhythmLoading ? (
          <Spinner />
        ) : rhythmItems.length === 0 ? (
          <EmptyRhythm />
        ) : (
          <div style={{ background:'#fff', borderRadius:16, overflow:'hidden',
                        boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
            {rhythmItems.map((it, i) => {
              const log    = rhythmLogs[it.id]
              const target = log ? log.target_count_snapshot : it.target_count
              const count  = log ? log.completed_count : 0
              const done   = target > 0 && count >= target
              return (
                <div key={it.id} style={{
                  display:'flex', alignItems:'center', gap:12,
                  padding:'14px 16px',
                  borderTop: i > 0 ? `1px solid ${C.b1}` : 'none',
                }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:15, fontWeight:600, color: done ? C.grn : C.t1 }}>
                      {it.title}
                    </div>
                    <div style={{ fontSize:12, color: done ? C.grn : C.t3, marginTop:2, fontWeight: done ? 600 : 400 }}>
                      {done ? '✓ 今日完成' : `${count} / ${target} ${it.unit_label ?? ''}`}
                    </div>
                  </div>
                  <Dots target={target} count={count} onSet={n => handleSet(it, n)} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {(actionError || rhythmError) && <Toast text={(actionError || rhythmError) as string} />}
    </div>
  )
}

// Tap dot N → set count to N; tap the current last-filled dot → step back (N-1).
function Dots({ target, count, onSet }: { target:number; count:number; onSet:(n:number)=>void }) {
  if (target <= 0) return null
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'flex-end', maxWidth:184 }}>
      {Array.from({ length: target }, (_, idx) => {
        const j = idx + 1
        const filled = j <= count
        return (
          <button key={j}
            onClick={() => onSet(j === count ? j - 1 : j)}
            aria-label={`設為 ${j === count ? j - 1 : j}`}
            style={{
              width:22, height:22, borderRadius:'50%', padding:0, cursor:'pointer',
              border:`2px solid ${filled ? C.acc : C.b2}`,
              background: filled ? C.acc : 'transparent',
              transition:'background .12s, border-color .12s',
            }} />
        )
      })}
    </div>
  )
}

function EmptyRhythm() {
  return (
    <div style={{ background:'#fff', borderRadius:16, padding:'28px 16px',
                  textAlign:'center', boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
      <div style={{ fontSize:32, marginBottom:8 }}>🌀</div>
      <p style={{ fontSize:14, color:C.t2, fontWeight:600 }}>目前沒有進行中的節律</p>
      <p style={{ fontSize:13, color:C.t3, marginTop:4 }}>可在桌面版新增或管理節律項目</p>
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
