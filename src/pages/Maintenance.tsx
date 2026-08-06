import { useState } from 'react'
import { useMaintenanceItems } from '../hooks/useMaintenanceItems'
import { daysFromToday, getDailyDateKey } from '../hooks/useTasks'
import type { MaintenanceItem } from '../lib/supabase'

const C = {
  acc:'#4f6ef7', accL:'#eef1fe', t1:'#111', t2:'#555', t3:'#999',
  b1:'#f0f0f2', b2:'#e0e0e2',
  red:'#dc2626', redL:'#fef2f2', redB:'#fecaca',
  orn:'#ea580c', ornL:'#fff7ed', ornB:'#fed7aa',
  grn:'#15803d', grnL:'#f0fdf4', grnB:'#bbf7d0',
}

const CYCLE_UNITS: { value: string; label: string }[] = [
  { value: 'day',   label: '天' },
  { value: 'week',  label: '週' },
  { value: 'month', label: '月' },
]

type DueState = 'overdue' | 'soon' | 'normal' | 'none'

function dueInfo(item: MaintenanceItem): { text: string; state: DueState } {
  if (!item.next_due_at) return { text: '未排定到期日', state: 'none' }
  const n = daysFromToday(item.next_due_at)
  if (n < 0) return { text: `已逾期 ${Math.abs(n)} 天`, state: 'overdue' }
  if (n <= item.remind_days_before) return { text: n === 0 ? '今天到期' : `${n} 天後到期`, state: 'soon' }
  return { text: `${n} 天後到期`, state: 'normal' }
}

function ItemRow({ item, waiting }: { item: MaintenanceItem; waiting: boolean }) {
  const due = dueInfo(item)
  const badge =
    due.state === 'overdue' ? { bg: C.redL, fg: C.red } :
    due.state === 'soon'    ? { bg: C.ornL, fg: C.orn } :
    { bg: C.b1, fg: C.t3 }

  return (
    <div style={{
      display:'flex', alignItems:'center', gap:12,
      padding:'14px 16px', background:'#fff', borderRadius:14,
      boxShadow:'0 1px 3px rgba(0,0,0,.06)', marginBottom:8,
      border: due.state === 'overdue' ? `1.5px solid ${C.redB}` : '1.5px solid transparent',
    }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{
          fontSize:16, fontWeight:500, color:C.t1,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        }}>
          {item.name}
        </div>
        <div style={{ fontSize:13, color:C.t3, marginTop:2 }}>
          {item.next_due_at ?? '尚未排定'}
        </div>
        {waiting && (
          <div style={{ fontSize:12, color:C.t3, marginTop:4 }}>
            ⏳ 等待桌面產生任務
          </div>
        )}
      </div>
      <span style={{
        flexShrink:0, fontSize:12, fontWeight:700, padding:'4px 10px', borderRadius:99,
        background:badge.bg, color:badge.fg,
      }}>
        {due.text}
      </span>
    </div>
  )
}

export default function Maintenance() {
  const { items, loading, error, createMaintenanceItem, isWaitingForTask } = useMaintenanceItems()
  const [showForm, setShowForm] = useState(false)

  if (loading) return <LoadingScreen />

  return (
    <div style={{ height:'100%', overflowY:'auto', background:C.b1 }}>
      <div style={{ padding:'20px 16px 24px', paddingTop:'calc(20px + env(safe-area-inset-top))' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
          <div>
            <h1 style={{ fontSize:28, fontWeight:800, color:C.t1, letterSpacing:'-0.03em', marginBottom:4 }}>
              更替
            </h1>
            <p style={{ fontSize:14, color:C.t3 }}>
              {items.length === 0 ? '目前沒有項目' : `共 ${items.length} 項`}
            </p>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            style={{
              flexShrink:0, display:'flex', alignItems:'center', gap:6,
              padding:'9px 16px', borderRadius:99, border:'none',
              background: showForm ? C.b2 : C.acc,
              color: showForm ? C.t2 : '#fff',
              fontSize:14, fontWeight:700, cursor:'pointer',
            }}
          >
            {showForm ? '取消' : '＋ 新增'}
          </button>
        </div>

        <div style={{ height:16 }} />

        {showForm && (
          <AddItemForm
            createMaintenanceItem={createMaintenanceItem}
            onDone={() => setShowForm(false)}
          />
        )}

        {items.length === 0 && !error && (
          <div style={{
            textAlign:'center', paddingTop:60,
            display:'flex', flexDirection:'column', alignItems:'center', gap:12,
          }}>
            <div style={{ fontSize:48 }}>🔧</div>
            <p style={{ fontSize:16, fontWeight:600, color:C.t2 }}>目前沒有進行中的項目</p>
            <p style={{ fontSize:14, color:C.t3 }}>可在桌面版新增或管理</p>
          </div>
        )}

        {items.map(item => <ItemRow key={item.id} item={item} waiting={isWaitingForTask(item)} />)}
      </div>

      {error && <Toast text={error} />}
    </div>
  )
}

// New-item form (Phase 1.5-B, B-2). Writes only to maintenance_items via
// createMaintenanceItem — no tasks / maintenance_events involved here.
function AddItemForm({
  createMaintenanceItem,
  onDone,
}: {
  createMaintenanceItem: (name: string, cycleValue: number, cycleUnit: string, lastHandledAt: string, notes: string) => Promise<void>
  onDone: () => void
}) {
  const [name, setName]                 = useState('')
  const [cycleValue, setCycleValue]     = useState('1')
  const [cycleUnit, setCycleUnit]       = useState('day')
  const [lastHandledAt, setLastHandled] = useState(getDailyDateKey())
  const [notes, setNotes]               = useState('')
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [error, setError]               = useState<string | null>(null)

  // Strict positive integer — no silent truncation of "1.5" etc. (B-4b).
  const cycleTrimmed = cycleValue.trim()
  const cycleValid = /^[1-9]\d*$/.test(cycleTrimmed)
  const cycleNum = cycleValid ? Number(cycleTrimmed) : NaN
  const valid = name.trim() !== '' && cycleValid && !!lastHandledAt

  const handleSubmit = async () => {
    if (!valid || saving) return
    setSaving(true); setError(null)
    try {
      await createMaintenanceItem(name.trim(), cycleNum, cycleUnit, lastHandledAt, notes)
      setSaved(true)
      setTimeout(onDone, 1400)
    } catch (e: any) {
      const code = e?.message
      if (code === 'NOT_AUTHENTICATED') setError('尚未登入，無法儲存')
      else if (code === 'SESSION_EXPIRED') setError('登入狀態已失效，請重新登入後再試')
      else setError('暫時無法儲存，請稍後再試')
    } finally {
      setSaving(false)
    }
  }

  const fieldSt: React.CSSProperties = {
    width:'100%', fontSize:16, padding:'12px 14px', borderRadius:12,
    border:`1.5px solid ${C.b2}`, outline:'none', background:C.b1,
    color:C.t1, fontFamily:'inherit', boxSizing:'border-box',
  }
  const labelSt: React.CSSProperties = { fontSize:12, fontWeight:700, color:C.t3, marginBottom:6 }

  if (saved) {
    return (
      <div style={{
        padding:'14px 16px', borderRadius:14, marginBottom:16,
        background:C.grnL, border:`1px solid ${C.grnB}`,
        color:C.grn, fontSize:14, fontWeight:500,
      }}>
        ✓ 已新增，對應的更替任務會在桌面開啟後產生。
      </div>
    )
  }

  return (
    <div style={{
      background:'#fff', borderRadius:16, padding:16, marginBottom:16,
      boxShadow:'0 1px 4px rgba(0,0,0,.06)',
      display:'flex', flexDirection:'column', gap:14,
    }}>
      <div>
        <div style={labelSt}>名稱</div>
        <input
          value={name} onChange={e => setName(e.target.value)}
          placeholder="例如：濾水器濾芯" style={fieldSt}
        />
      </div>

      <div>
        <div style={labelSt}>週期</div>
        <div style={{ display:'flex', gap:8 }}>
          <input
            type="number" min={1} inputMode="numeric"
            value={cycleValue}
            onChange={e => setCycleValue(e.target.value)}
            style={{ ...fieldSt, width:90 }}
          />
          <select
            value={cycleUnit} onChange={e => setCycleUnit(e.target.value)}
            style={{ ...fieldSt, flex:1 }}
          >
            {CYCLE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </div>
        {cycleTrimmed !== '' && !cycleValid && (
          <div style={{ fontSize:12, color:C.red, marginTop:6 }}>
            週期需為正整數（不可為小數或非數字）
          </div>
        )}
      </div>

      <div>
        <div style={labelSt}>上次處理日</div>
        <input
          type="date"
          value={lastHandledAt}
          onChange={e => setLastHandled(e.target.value)}
          style={fieldSt}
        />
      </div>

      <div>
        <div style={labelSt}>備註（選填）</div>
        <textarea
          value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="選填" rows={2}
          style={{ ...fieldSt, resize:'none' }}
        />
      </div>

      {error && (
        <div style={{
          padding:'10px 14px', borderRadius:12,
          background:'#fef2f2', border:'1px solid #fecaca',
          fontSize:13, color:'#dc2626', fontWeight:500,
        }}>
          ⚠ {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!valid || saving}
        style={{
          padding:'13px', borderRadius:12, border:'none',
          background: valid ? C.acc : C.b2,
          color: valid ? '#fff' : C.t3,
          fontSize:15, fontWeight:700,
          cursor: valid ? 'pointer' : 'not-allowed',
        }}
      >
        {saving ? '儲存中...' : '新增項目'}
      </button>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{
          width:32, height:32, margin:'0 auto 12px',
          border:'3px solid #4f6ef7', borderTopColor:'transparent',
          borderRadius:'50%', animation:'spin 0.7s linear infinite',
        }}/>
        <p style={{ fontSize:14, color:'#999' }}>載入中...</p>
      </div>
    </div>
  )
}

// Transient load-failure toast. Not auto-clearing (no polling mutation loop
// here) — it reflects the hook's current error state directly.
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
