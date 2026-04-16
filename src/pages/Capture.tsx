import { useRef, useState } from 'react'
import { useCategories } from '../hooks/useCategories'
import { useTasks } from '../hooks/useTasks'

const C = {
  acc: '#4f6ef7', accL: '#eef1fe',
  t1: '#111', t2: '#555', t3: '#999',
  b1: '#f0f0f2', b2: '#e0e0e2',
}

export default function Capture() {
  const [input, setInput]       = useState('')
  const [catId, setCatId]       = useState<string>('')
  const [showCats, setShowCats] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState<string | null>(null)  // last saved title
  const [error, setError]       = useState<string | null>(null)
  const inputRef                = useRef<HTMLTextAreaElement>(null)

  const { categories } = useCategories()
  const { createTask }  = useTasks()

  const selectedCat = categories.find(c => c.id === catId)

  const handleSave = async () => {
    if (!input.trim() || saving) return
    setSaving(true); setError(null)
    try {
      await createTask(input.trim(), catId || null)
      setSaved(input.trim())
      setInput('')
      setTimeout(() => setSaved(null), 2500)
      inputRef.current?.focus()
    } catch (e: any) {
      setError('儲存失敗，請確認網路連線')
    } finally {
      setSaving(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave() }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#fff' }}>

      {/* ── Header ── */}
      <div style={{ padding:'20px 20px 0', paddingTop:'calc(20px + env(safe-area-inset-top))' }}>
        <h1 style={{ fontSize:28, fontWeight:800, color: C.t1, letterSpacing:'-0.03em' }}>
          快速記錄
        </h1>
        <p style={{ fontSize:14, color: C.t3, marginTop:4 }}>想到什麼就記下來</p>
      </div>

      {/* ── Input area ── */}
      <div style={{ padding:'20px', flex:1, display:'flex', flexDirection:'column', gap:12 }}>

        {/* Main textarea */}
        <div style={{
          background: C.b1, borderRadius:20,
          border: `2px solid ${input.trim() ? C.acc : 'transparent'}`,
          transition: 'border-color .15s',
          padding:'16px',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="輸入任務名稱..."
            autoFocus
            rows={3}
            style={{
              width:'100%', background:'transparent', border:'none', outline:'none',
              fontSize:18, fontWeight:500, color: C.t1, resize:'none',
              lineHeight:1.5, fontFamily:'inherit',
            }}
          />

          {/* Category + Save row */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10 }}>

            {/* Category pill */}
            <button
              onClick={() => setShowCats(v => !v)}
              style={{
                display:'flex', alignItems:'center', gap:6,
                padding:'6px 12px', borderRadius:99,
                border:`1.5px solid ${selectedCat ? selectedCat.color+'66' : C.b2}`,
                background: selectedCat ? selectedCat.color+'15' : '#fff',
                color: selectedCat ? selectedCat.color : C.t3,
                fontSize:13, fontWeight:600, cursor:'pointer',
              }}
            >
              {selectedCat
                ? <><span style={{ width:7, height:7, borderRadius:'50%', background:selectedCat.color }} />{selectedCat.name}</>
                : <><span style={{ fontSize:15 }}>＋</span>分類</>
              }
            </button>

            <div style={{ flex:1 }} />

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={!input.trim() || saving}
              style={{
                padding:'8px 22px', borderRadius:99,
                background: input.trim() ? C.acc : C.b2,
                color: input.trim() ? '#fff' : C.t3,
                border:'none', fontSize:15, fontWeight:700,
                cursor: input.trim() ? 'pointer' : 'not-allowed',
                transition:'all .15s',
              }}
            >
              {saving ? '儲存中' : '記下'}
            </button>
          </div>
        </div>

        {/* Category picker */}
        {showCats && (
          <div style={{
            background:'#fff', borderRadius:16, border:`1px solid ${C.b2}`,
            padding:'12px', boxShadow:'0 4px 20px rgba(0,0,0,.1)',
            display:'flex', flexWrap:'wrap', gap:8,
          }}>
            <button
              onClick={() => { setCatId(''); setShowCats(false) }}
              style={{
                padding:'7px 14px', borderRadius:99, fontSize:13, fontWeight:600,
                border:`1.5px solid ${!catId ? C.acc : C.b2}`,
                background: !catId ? C.accL : 'transparent',
                color: !catId ? C.acc : C.t2, cursor:'pointer',
              }}
            >無分類</button>

            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => { setCatId(cat.id); setShowCats(false) }}
                style={{
                  display:'flex', alignItems:'center', gap:6,
                  padding:'7px 14px', borderRadius:99, fontSize:13, fontWeight:600,
                  border:`1.5px solid ${catId===cat.id ? cat.color : C.b2}`,
                  background: catId===cat.id ? cat.color+'18' : 'transparent',
                  color: catId===cat.id ? cat.color : C.t2, cursor:'pointer',
                }}
              >
                <span style={{ width:7, height:7, borderRadius:'50%', background:cat.color }} />
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Success toast */}
        {saved && (
          <div style={{
            padding:'12px 16px', borderRadius:14,
            background:'#f0fdf4', border:'1px solid #bbf7d0',
            fontSize:14, color:'#15803d', fontWeight:500,
            display:'flex', alignItems:'center', gap:8,
          }}>
            <span>✓</span>
            <span>已記錄「{saved.length > 20 ? saved.slice(0,20)+'…' : saved}」</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding:'12px 16px', borderRadius:14,
            background:'#fef2f2', border:'1px solid #fecaca',
            fontSize:14, color:'#dc2626', fontWeight:500,
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Hint */}
        <p style={{ fontSize:12, color: C.t3, textAlign:'center', marginTop:'auto', paddingBottom:8 }}>
          Enter 快速儲存 · 任何欄位都可以之後再填
        </p>
      </div>
    </div>
  )
}
