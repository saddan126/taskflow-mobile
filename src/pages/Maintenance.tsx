import { useMaintenanceItems } from '../hooks/useMaintenanceItems'
import { daysFromToday } from '../hooks/useTasks'
import type { MaintenanceItem } from '../lib/supabase'

const C = {
  acc:'#4f6ef7', t1:'#111', t2:'#555', t3:'#999',
  b1:'#f0f0f2', b2:'#e0e0e2',
  red:'#dc2626', redL:'#fef2f2', redB:'#fecaca',
  orn:'#ea580c', ornL:'#fff7ed', ornB:'#fed7aa',
}

type DueState = 'overdue' | 'soon' | 'normal' | 'none'

function dueInfo(item: MaintenanceItem): { text: string; state: DueState } {
  if (!item.next_due_at) return { text: '未排定到期日', state: 'none' }
  const n = daysFromToday(item.next_due_at)
  if (n < 0) return { text: `已逾期 ${Math.abs(n)} 天`, state: 'overdue' }
  if (n <= item.remind_days_before) return { text: n === 0 ? '今天到期' : `${n} 天後到期`, state: 'soon' }
  return { text: `${n} 天後到期`, state: 'normal' }
}

function ItemRow({ item }: { item: MaintenanceItem }) {
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
  const { items, loading, error } = useMaintenanceItems()

  if (loading) return <LoadingScreen />

  return (
    <div style={{ height:'100%', overflowY:'auto', background:C.b1 }}>
      <div style={{ padding:'20px 16px 24px', paddingTop:'calc(20px + env(safe-area-inset-top))' }}>
        <h1 style={{ fontSize:28, fontWeight:800, color:C.t1, letterSpacing:'-0.03em', marginBottom:4 }}>
          更替
        </h1>
        <p style={{ fontSize:14, color:C.t3, marginBottom:20 }}>
          {items.length === 0 ? '目前沒有項目' : `共 ${items.length} 項`}
        </p>

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

        {items.map(item => <ItemRow key={item.id} item={item} />)}
      </div>

      {error && <Toast text={error} />}
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
