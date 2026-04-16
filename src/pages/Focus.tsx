import { useTasks, daysFromToday } from '../hooks/useTasks'
import { useCategories } from '../hooks/useCategories'
import type { Task } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const C = {
  acc:'#4f6ef7', t1:'#111', t2:'#555', t3:'#999',
  b1:'#f0f0f2', b2:'#e0e0e2',
  red:'#dc2626', redL:'#fef2f2', redB:'#fecaca',
  orn:'#ea580c', ornL:'#fff7ed', ornB:'#fed7aa',
  amb:'#d97706', ambL:'#fffbeb', ambB:'#fde68a',
  grn:'#16a34a', grnL:'#f0fdf4', grnB:'#bbf7d0',
}

function dueBadge(d: string): { text: string; bg: string; fg: string } {
  const n = daysFromToday(d)
  if (n < 0)   return { text:`逾期 ${Math.abs(n)} 天`, bg:C.redL, fg:C.red }
  if (n === 0) return { text:'今天到期',              bg:C.ornL, fg:C.orn }
  if (n === 1) return { text:'明天',                  bg:C.ambL, fg:C.amb }
  if (n <= 7)  return { text:`${n} 天後`,             bg:'#eff6ff', fg:'#2563eb' }
  return { text:d, bg:C.b1, fg:C.t3 }
}

function TaskRow({ task, onToggle, onTap, isBlocked, categoryColor }: {
  task: Task
  onToggle: (t: Task) => void
  onTap:    (id: string) => void
  isBlocked: boolean
  categoryColor?: string
}) {
  const done = task.completed === 1
  const due  = task.due_date && !done ? dueBadge(task.due_date) : null

  return (
    <div
      onClick={() => onTap(task.id)}
      style={{
        display:'flex', alignItems:'center', gap:12,
        padding:'14px 16px',
        background:'#fff',
        borderRadius:14,
        boxShadow:'0 1px 3px rgba(0,0,0,.06)',
        marginBottom:8,
        opacity: done ? .45 : 1,
      }}
    >
      {/* Checkbox */}
      <button
        onClick={e => { e.stopPropagation(); onToggle(task) }}
        style={{
          flexShrink:0, width:24, height:24, borderRadius:'50%',
          border:`2px solid ${done ? C.grn : isBlocked ? C.b2 : C.b2}`,
          background: done ? C.grn : 'transparent',
          display:'flex', alignItems:'center', justifyContent:'center',
          cursor:'pointer', padding:0,
        }}
      >
        {done && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {/* Content */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{
          fontSize:16, fontWeight:500, color: done ? C.t3 : isBlocked ? C.t3 : C.t1,
          textDecoration: done ? 'line-through' : 'none',
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
          display:'flex', alignItems:'center', gap:6,
        }}>
          {categoryColor && (
            <span style={{ width:7, height:7, borderRadius:'50%', background:categoryColor, flexShrink:0 }} />
          )}
          {isBlocked && !done && <span style={{ fontSize:13 }}>🔒</span>}
          {task.title}
        </div>
        {due && (
          <span style={{
            marginTop:4, display:'inline-block',
            fontSize:12, fontWeight:600, padding:'2px 8px',
            borderRadius:99, background:due.bg, color:due.fg,
          }}>
            {due.text}
          </span>
        )}
      </div>

      <svg width="7" height="12" viewBox="0 0 7 12" fill="none" style={{ flexShrink:0 }}>
        <path d="M1 1l5 5-5 5" stroke="#c8c8c8" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

function Section({ label, accent, tasks, onToggle, onTap, blockedIds, catMap, dimmed }: {
  label:string; accent:string; tasks:Task[]
  onToggle:(t:Task)=>void; onTap:(id:string)=>void
  blockedIds:Set<string>; catMap:Map<string,any>; dimmed?:boolean
}) {
  if (tasks.length === 0) return null
  return (
    <div style={{ marginBottom:24, opacity: dimmed ? .55 : 1 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
        <span style={{ width:8, height:8, borderRadius:'50%', background:accent }} />
        <span style={{ fontSize:13, fontWeight:700, color:C.t2,
                       textTransform:'uppercase', letterSpacing:'0.07em' }}>
          {label}
        </span>
        <span style={{
          fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:99,
          background:accent+'22', color:accent,
        }}>{tasks.length}</span>
      </div>
      {tasks.map(t => (
        <TaskRow key={t.id} task={t}
          onToggle={onToggle} onTap={onTap}
          isBlocked={blockedIds.has(t.id)}
          categoryColor={catMap.get(t.category_id ?? '')?.color}
        />
      ))}
    </div>
  )
}

export default function Focus() {
  const nav = useNavigate()
  const { overdue, dueToday, upcoming, pending, blockedIds, toggleComplete, loading } = useTasks()
  const { categories } = useCategories()
  const catMap = new Map(categories.map(c => [c.id, c]))

  const blocked = pending.filter(t => blockedIds.has(t.id))
  const total   = overdue.length + dueToday.length + upcoming.length

  if (loading) return <LoadingScreen />

  return (
    <div style={{ height:'100%', overflowY:'auto', background:C.b1 }}>
      <div style={{ padding:'20px 16px 24px', paddingTop:'calc(20px + env(safe-area-inset-top))' }}>
        <h1 style={{ fontSize:28, fontWeight:800, color:C.t1, letterSpacing:'-0.03em', marginBottom:4 }}>
          今日焦點
        </h1>
        <p style={{ fontSize:14, color:C.t3, marginBottom:20 }}>
          {total === 0 ? '今天一切清空 ✓' : `${total} 項需要關注`}
        </p>

        {total === 0 && blocked.length === 0 && (
          <div style={{
            textAlign:'center', paddingTop:60,
            display:'flex', flexDirection:'column', alignItems:'center', gap:12,
          }}>
            <div style={{ fontSize:48 }}>✅</div>
            <p style={{ fontSize:16, fontWeight:600, color:C.t2 }}>今天都清完了！</p>
            <p style={{ fontSize:14, color:C.t3 }}>休息一下，或記錄新任務</p>
          </div>
        )}

        <Section label="逾期"       accent={C.red} tasks={overdue}
          onToggle={toggleComplete} onTap={id=>nav(`/task/${id}`)}
          blockedIds={blockedIds} catMap={catMap} />
        <Section label="今天到期"   accent={C.orn} tasks={dueToday}
          onToggle={toggleComplete} onTap={id=>nav(`/task/${id}`)}
          blockedIds={blockedIds} catMap={catMap} />
        <Section label="未來 7 天"  accent={C.amb} tasks={upcoming}
          onToggle={toggleComplete} onTap={id=>nav(`/task/${id}`)}
          blockedIds={blockedIds} catMap={catMap} />
        <Section label="等待中（被阻擋）" accent={C.t3} dimmed tasks={blocked}
          onToggle={toggleComplete} onTap={id=>nav(`/task/${id}`)}
          blockedIds={blockedIds} catMap={catMap} />
      </div>
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
