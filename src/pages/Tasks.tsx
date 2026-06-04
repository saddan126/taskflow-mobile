import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTasks, useUndoTask, setUndoTask } from '../hooks/useTasks'
import { useLongPress } from '../hooks/useLongPress'
import { useCategories } from '../hooks/useCategories'
import type { Task } from '../lib/supabase'

const C = {
  acc:'#4f6ef7', accL:'#eef1fe',
  t1:'#111', t2:'#555', t3:'#999',
  b1:'#f0f0f2', b2:'#e0e0e2',
  grn:'#16a34a', grnL:'#f0fdf4', grnB:'#bbf7d0',
  red:'#dc2626', star:'#f59e0b',
}

export default function Tasks() {
  const nav = useNavigate()
  const [activeCat, setActiveCat] = useState<string>('')
  const [query, setQuery]         = useState('')
  const { rootTasks, blockedIds, toggleComplete, toggleStar, softDelete, restoreTask, loading, actionError } = useTasks(activeCat || undefined)
  const { categories } = useCategories()
  const undo = useUndoTask()

  // Title search, stacked on top of the (server-side) category filter. Front-end
  // only: case-insensitive substring match on the title, never the detail.
  const q = query.trim().toLowerCase()
  const filtered  = q ? rootTasks.filter(t => (t.title ?? '').toLowerCase().includes(q)) : rootTasks
  const pending   = filtered.filter(t => !t.completed)
  const completed = filtered.filter(t => t.completed)
  const catMap    = new Map(categories.map(c => [c.id, c]))

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:'#fff' }}>

      {/* Header */}
      <div style={{ padding:'20px 16px 12px', paddingTop:'calc(20px + env(safe-area-inset-top))',
                    borderBottom:`1px solid ${C.b1}`, background:'#fff', flexShrink:0 }}>
        <h1 style={{ fontSize:28, fontWeight:800, color:C.t1, letterSpacing:'-0.03em', marginBottom:12 }}>
          全部任務
        </h1>

        {/* Search */}
        <div style={{ position:'relative', marginBottom:12 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜尋任務標題…"
            style={{
              width:'100%', boxSizing:'border-box',
              padding:'10px 36px 10px 14px', borderRadius:12,
              border:`1.5px solid ${C.b2}`, background:C.b1,
              fontSize:15, color:C.t1, outline:'none', fontFamily:'inherit',
            }}
          />
          {query && (
            <button onClick={() => setQuery('')}
              aria-label="清除搜尋"
              style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
                       background:'none', border:'none', cursor:'pointer', color:C.t3,
                       fontSize:16, padding:'4px 6px', lineHeight:1 }}>
              ✕
            </button>
          )}
        </div>

        {/* Category filter */}
        <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:4 }}>
          <CatChip label="全部" active={!activeCat} color={C.acc} onClick={() => setActiveCat('')} />
          {categories.map(cat => (
            <CatChip key={cat.id} label={cat.name} color={cat.color}
              active={activeCat===cat.id} onClick={() => setActiveCat(cat.id)} />
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Spinner />
        </div>
      ) : (
        <div style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>
          {pending.length === 0 && completed.length === 0 && (
            q ? <SearchEmpty /> : <Empty />
          )}

          {/* Pending */}
          {pending.map(t => (
            <TaskRow key={t.id} task={t} isBlocked={blockedIds.has(t.id)}
              category={catMap.get(t.category_id ?? '')}
              onToggle={() => toggleComplete(t)}
              onToggleStar={() => toggleStar(t)}
              onDelete={() => softDelete(t)}
              onTap={() => nav(`/task/${t.id}`)} />
          ))}

          {/* Completed divider */}
          {completed.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:10, margin:'20px 0 12px' }}>
              <div style={{ flex:1, height:1, background:C.b1 }} />
              <span style={{ fontSize:12, color:C.t3, fontWeight:500 }}>
                已完成 {completed.length} 項
              </span>
              <div style={{ flex:1, height:1, background:C.b1 }} />
            </div>
          )}
          <div style={{ opacity:.4 }}>
            {completed.map(t => (
              <TaskRow key={t.id} task={t} isBlocked={false}
                category={catMap.get(t.category_id ?? '')}
                onToggle={() => toggleComplete(t)}
                onToggleStar={() => toggleStar(t)}
                onDelete={() => softDelete(t)}
                onTap={() => nav(`/task/${t.id}`)} />
            ))}
          </div>

          <div style={{ height:24 }} />
        </div>
      )}

      {undo && (
        <UndoToast onUndo={() => { const t = undo; setUndoTask(null); void restoreTask(t) }} />
      )}
      {actionError && <Toast text={actionError} />}
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

// Transient write-failure toast, floats above the bottom nav. Auto-clears via useTasks.
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

function CatChip({ label, color, active, onClick }: {
  label:string; color:string; active:boolean; onClick:()=>void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink:0, padding:'6px 14px', borderRadius:99, fontSize:13, fontWeight:600,
        border:`1.5px solid ${active ? color : '#e0e0e2'}`,
        background: active ? color+'18' : 'transparent',
        color: active ? color : '#555', cursor:'pointer',
        display:'flex', alignItems:'center', gap:5,
        whiteSpace:'nowrap',
      }}
    >
      {label !== '全部' && (
        <span style={{ width:6, height:6, borderRadius:'50%', background:color }} />
      )}
      {label}
    </button>
  )
}

function TaskRow({ task, isBlocked, category, onToggle, onTap, onToggleStar, onDelete }: {
  task:Task; isBlocked:boolean; category:any
  onToggle:()=>void; onTap:()=>void; onToggleStar:()=>void; onDelete:()=>void
}) {
  const done = task.completed === 1
  const lp   = useLongPress(onDelete)   // long-press the row to delete
  return (
    <div
      onClick={onTap}
      {...lp}
      style={{
        display:'flex', alignItems:'center', gap:12,
        padding:'13px 14px', background:'#fff', borderRadius:14,
        boxShadow:'0 1px 3px rgba(0,0,0,.06)', marginBottom:8,
        cursor:'pointer',
      }}
    >
      <button
        onClick={e => { e.stopPropagation(); onToggle() }}
        onPointerDown={e => e.stopPropagation()}
        style={{
          flexShrink:0, width:22, height:22, borderRadius:'50%',
          border:`2px solid ${done ? C.grn : C.b2}`,
          background: done ? C.grn : 'transparent',
          display:'flex', alignItems:'center', justifyContent:'center',
          cursor:'pointer', padding:0,
        }}
      >
        {done && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      <div style={{ flex:1, minWidth:0 }}>
        <div style={{
          fontSize:16, fontWeight:500,
          color: done ? C.t3 : isBlocked ? C.t3 : C.t1,
          textDecoration: done ? 'line-through' : 'none',
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        }}>
          {isBlocked && !done && <span style={{ marginRight:4, fontSize:12 }}>🔒</span>}
          {task.title}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:3 }}>
          {category && (
            <span style={{ fontSize:11, fontWeight:600, padding:'1px 7px', borderRadius:99,
                           background:category.color+'18', color:category.color }}>
              {category.name}
            </span>
          )}
          {task.due_date && !done && (
            <span style={{ fontSize:11, color:C.t3 }}>{task.due_date}</span>
          )}
        </div>
      </div>

      <button
        onClick={e => { e.stopPropagation(); onToggleStar() }}
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

function Spinner() {
  return (
    <div style={{ width:28, height:28, border:'3px solid #4f6ef7',
                  borderTopColor:'transparent', borderRadius:'50%',
                  animation:'spin 0.7s linear infinite' }} />
  )
}

function Empty() {
  return (
    <div style={{ textAlign:'center', paddingTop:60 }}>
      <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
      <p style={{ fontSize:16, fontWeight:600, color:'#555' }}>沒有任務</p>
      <p style={{ fontSize:14, color:'#999', marginTop:4 }}>去 Capture 頁記錄第一個任務</p>
    </div>
  )
}

function SearchEmpty() {
  return (
    <div style={{ textAlign:'center', paddingTop:60 }}>
      <div style={{ fontSize:40, marginBottom:12 }}>🔍</div>
      <p style={{ fontSize:16, fontWeight:600, color:'#555' }}>沒有符合的任務</p>
      <p style={{ fontSize:14, color:'#999', marginTop:4 }}>換個關鍵字或清除搜尋試試</p>
    </div>
  )
}
