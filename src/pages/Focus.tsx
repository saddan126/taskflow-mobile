import { useTasks, useUndoTask, setUndoTask, daysFromToday } from '../hooks/useTasks'
import { useLongPress } from '../hooks/useLongPress'
import { usePullToRefresh, PullIndicator } from '../hooks/usePullToRefresh'
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
  star:'#f59e0b',
}

function dueBadge(d: string): { text: string; bg: string; fg: string } {
  const n = daysFromToday(d)
  if (n < 0)   return { text:`逾期 ${Math.abs(n)} 天`, bg:C.redL, fg:C.red }
  if (n === 0) return { text:'今天到期',              bg:C.ornL, fg:C.orn }
  if (n === 1) return { text:'明天',                  bg:C.ambL, fg:C.amb }
  if (n <= 7)  return { text:`${n} 天後`,             bg:'#eff6ff', fg:'#2563eb' }
  return { text:d, bg:C.b1, fg:C.t3 }
}

function TaskRow({ task, onToggle, onTap, onToggleStar, onDelete, isBlocked, categoryColor }: {
  task: Task
  onToggle: (t: Task) => void
  onTap:    (id: string) => void
  onToggleStar: (t: Task) => void
  onDelete: (t: Task) => void
  isBlocked: boolean
  categoryColor?: string
}) {
  const done = task.completed === 1
  const due  = task.due_date && !done ? dueBadge(task.due_date) : null
  const lp   = useLongPress(() => onDelete(task))   // long-press the row to delete

  return (
    <div
      onClick={() => onTap(task.id)}
      {...lp}
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
        onPointerDown={e => e.stopPropagation()}
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
          {task.task_type === 'maintenance' && <span style={{ fontSize:13 }}>🌿</span>}
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

      <button
        onClick={e => { e.stopPropagation(); onToggleStar(task) }}
        onPointerDown={e => e.stopPropagation()}
        style={{ flexShrink:0, background:'none', border:'none',
                 cursor:'pointer', padding:2, lineHeight:0 }}
        aria-label={task.starred === 1 ? '取消加星' : '加星'}
      >
        <StarIcon filled={task.starred === 1} />
      </button>

      <svg width="7" height="12" viewBox="0 0 7 12" fill="none" style={{ flexShrink:0 }}>
        <path d="M1 1l5 5-5 5" stroke="#c8c8c8" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24"
      fill={filled ? C.star : 'none'}
      stroke={filled ? C.star : '#c8c8c8'} strokeWidth="1.8">
      <path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.6l5.8-.8L12 3.5z"
            strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

function Section({ label, accent, tasks, onToggle, onTap, onToggleStar, onDelete, blockedIds, catMap, dimmed }: {
  label:string; accent:string; tasks:Task[]
  onToggle:(t:Task)=>void; onTap:(id:string)=>void
  onToggleStar:(t:Task)=>void; onDelete:(t:Task)=>void
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
          onToggleStar={onToggleStar} onDelete={onDelete}
          isBlocked={blockedIds.has(t.id)}
          categoryColor={catMap.get(t.category_id ?? '')?.color}
        />
      ))}
    </div>
  )
}

export default function Focus() {
  const nav = useNavigate()
  const { overdue, dueToday, upcoming, pending, blockedIds, toggleComplete, toggleStar, softDelete, restoreTask, loading, actionError, actionNotice, refresh } = useTasks()
  const { categories } = useCategories()
  const catMap = new Map(categories.map(c => [c.id, c]))
  const undo = useUndoTask()
  const { scrollRef, pull, refreshing } = usePullToRefresh(refresh)

  const blocked = pending.filter(t => blockedIds.has(t.id))
  const total   = overdue.length + dueToday.length + upcoming.length

  if (loading) return <LoadingScreen />

  return (
    <div ref={scrollRef} style={{ height:'100%', overflowY:'auto', overscrollBehaviorY:'contain', position:'relative', background:C.b1 }}>
      <PullIndicator pull={pull} refreshing={refreshing} />
      <div style={{ transform:`translateY(${refreshing ? 44 : pull}px)`, transition: pull > 0 ? 'none' : 'transform .2s ease' }}>
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
          onToggleStar={toggleStar} onDelete={softDelete}
          blockedIds={blockedIds} catMap={catMap} />
        <Section label="今天到期"   accent={C.orn} tasks={dueToday}
          onToggle={toggleComplete} onTap={id=>nav(`/task/${id}`)}
          onToggleStar={toggleStar} onDelete={softDelete}
          blockedIds={blockedIds} catMap={catMap} />
        <Section label="未來 7 天"  accent={C.amb} tasks={upcoming}
          onToggle={toggleComplete} onTap={id=>nav(`/task/${id}`)}
          onToggleStar={toggleStar} onDelete={softDelete}
          blockedIds={blockedIds} catMap={catMap} />
        <Section label="等待中（被阻擋）" accent={C.t3} dimmed tasks={blocked}
          onToggle={toggleComplete} onTap={id=>nav(`/task/${id}`)}
          onToggleStar={toggleStar} onDelete={softDelete}
          blockedIds={blockedIds} catMap={catMap} />
      </div>
      </div>

      {undo && (
        <UndoToast onUndo={() => { const t = undo; setUndoTask(null); void restoreTask(t) }} />
      )}
      {actionError ? <Toast text={actionError} kind="error" />
        : actionNotice ? <Toast text={actionNotice} kind="notice" /> : null}
    </div>
  )
}

// Neutral snackbar after a soft-delete, with an undo action. Auto-clears via useTasks.
function UndoToast({ onUndo }: { onUndo: () => void }) {
  return (
    <div style={{
      position:'fixed', left:16, right:16,
      bottom:'calc(72px + env(safe-area-inset-bottom))',
      padding:'12px 16px', borderRadius:14,
      background:C.t1, color:'#fff',
      fontSize:14, fontWeight:500,
      display:'flex', alignItems:'center', justifyContent:'space-between',
      boxShadow:'0 4px 20px rgba(0,0,0,.2)', zIndex:50,
    }}>
      <span>已刪除</span>
      <button onClick={onUndo}
        style={{ background:'none', border:'none', color:'#9db2ff',
                 fontSize:14, fontWeight:700, cursor:'pointer',
                 display:'flex', alignItems:'center', gap:6, padding:'2px 4px' }}>
        ⟲ 復原
      </button>
    </div>
  )
}

// Transient toast, floats above the bottom nav. Auto-clears via useTasks.
// 'error' = red write-failure (unchanged); 'notice' = neutral/positive, for
// non-failure messages (B-4b, e.g. a maintenance task completed successfully).
function Toast({ text, kind = 'error' }: { text: string; kind?: 'error' | 'notice' }) {
  const palette = kind === 'error'
    ? { bg:'#fef2f2', border:'1px solid #fecaca', fg:'#dc2626' }
    : { bg:'#f0fdf4', border:'1px solid #bbf7d0', fg:'#15803d' }
  return (
    <div style={{
      position:'fixed', left:16, right:16,
      bottom:'calc(72px + env(safe-area-inset-bottom))',
      padding:'12px 16px', borderRadius:14,
      background:palette.bg, border:palette.border,
      color:palette.fg, fontSize:14, fontWeight:500, textAlign:'center',
      boxShadow:'0 4px 20px rgba(0,0,0,.12)', zIndex:50,
    }}>
      {text}
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
