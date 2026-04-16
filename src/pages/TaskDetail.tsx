import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, type Task, type Category } from '../lib/supabase'
import { daysFromToday } from '../hooks/useTasks'

const C = {
  acc:'#4f6ef7', accL:'#eef1fe', accB:'#c7d0fb',
  t1:'#111', t2:'#555', t3:'#999',
  b1:'#f0f0f2', b2:'#e0e0e2',
  grn:'#16a34a', grnL:'#f0fdf4', grnB:'#bbf7d0',
  red:'#dc2626', redL:'#fef2f2', redB:'#fecaca',
  orn:'#ea580c', ornL:'#fff7ed',
  amb:'#d97706', ambL:'#fffbeb',
}

function dueBadge(d: string) {
  const n = daysFromToday(d)
  if (n < 0)   return { text:`逾期 ${Math.abs(n)} 天`, bg:C.redL, fg:C.red }
  if (n === 0) return { text:'今天到期', bg:C.ornL, fg:C.orn }
  if (n === 1) return { text:'明天', bg:C.ambL, fg:C.amb }
  if (n <= 7)  return { text:`${n} 天後`, bg:'#eff6ff', fg:'#2563eb' }
  return { text:d, bg:C.b1, fg:C.t3 }
}

export default function TaskDetail() {
  const { id }  = useParams<{ id: string }>()
  const nav     = useNavigate()
  const [task, setTask]           = useState<Task | null>(null)
  const [children, setChildren]   = useState<Task[]>([])
  const [category, setCategory]   = useState<Category | null>(null)
  const [prereqs, setPrereqs]     = useState<Task[]>([])
  const [isBlocked, setIsBlocked] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [toggling, setToggling]   = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false

    async function load() {
      // Load task
      const { data: t } = await supabase
        .from('tasks').select('*').eq('id', id).single()
      if (!t || cancelled) return

      // Load children
      const { data: ch } = await supabase
        .from('tasks').select('*')
        .eq('parent_id', id).is('deleted_at', null)

      // Load category
      let cat: Category | null = null
      if (t.category_id) {
        const { data: c } = await supabase
          .from('categories').select('*').eq('id', t.category_id).single()
        cat = c
      }

      // Load prerequisites
      const { data: depRows } = await supabase
        .from('task_dependencies')
        .select('depends_on_id').eq('task_id', id)

      let prereqTasks: Task[] = []
      if (depRows && depRows.length > 0) {
        const ids = depRows.map((d: any) => d.depends_on_id)
        const { data: pTasks } = await supabase
          .from('tasks').select('*').in('id', ids)
        prereqTasks = pTasks ?? []
      }

      const blocked = prereqTasks.some(p => !p.completed)

      if (!cancelled) {
        setTask(t)
        setChildren(ch ?? [])
        setCategory(cat)
        setPrereqs(prereqTasks)
        setIsBlocked(blocked)
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [id])

  const handleToggle = async () => {
    if (!task || toggling) return
    setToggling(true)
    const completed = task.completed === 1 ? 0 : 1
    setTask(t => t ? { ...t, completed } : t)
    await supabase.from('tasks')
      .update({ completed, updated_at: new Date().toISOString() })
      .eq('id', task.id)
    setToggling(false)
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}>
      <div style={{ width:28, height:28, border:'3px solid #4f6ef7',
                    borderTopColor:'transparent', borderRadius:'50%',
                    animation:'spin 0.7s linear infinite' }} />
    </div>
  )

  if (!task) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
                  justifyContent:'center', height:'100%', gap:12 }}>
      <p style={{ fontSize:16, color:'#555' }}>找不到這個任務</p>
      <button onClick={() => nav(-1)} style={backBtnStyle}>返回</button>
    </div>
  )

  const done = task.completed === 1
  const due  = task.due_date ? dueBadge(task.due_date) : null

  return (
    <div style={{ height:'100%', overflowY:'auto', background:C.b1 }}>

      {/* Back button header */}
      <div style={{
        position:'sticky', top:0, zIndex:10,
        padding:'12px 16px', paddingTop:'calc(12px + env(safe-area-inset-top))',
        background:'rgba(240,240,242,0.92)', backdropFilter:'blur(12px)',
        display:'flex', alignItems:'center', gap:8,
      }}>
        <button onClick={() => nav(-1)}
          style={{ display:'flex', alignItems:'center', gap:4,
                   background:'none', border:'none', cursor:'pointer',
                   fontSize:16, color:C.acc, fontWeight:600 }}>
          <svg width="9" height="15" viewBox="0 0 9 15" fill="none">
            <path d="M8 1L2 7.5 8 14" stroke={C.acc} strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          返回
        </button>
      </div>

      <div style={{ padding:'8px 16px 40px' }}>

        {/* Main card */}
        <div style={{ background:'#fff', borderRadius:20,
                      padding:'20px', marginBottom:12,
                      boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>

          {/* Done + Title row */}
          <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
            <button onClick={handleToggle}
              style={{
                flexShrink:0, width:28, height:28, borderRadius:'50%', marginTop:2,
                border:`2.5px solid ${done ? C.grn : C.b2}`,
                background: done ? C.grn : 'transparent',
                display:'flex', alignItems:'center', justifyContent:'center',
                cursor:'pointer', padding:0,
              }}>
              {done && (
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>

            <h2 style={{
              flex:1, fontSize:22, fontWeight:700, color: done ? C.t3 : C.t1,
              textDecoration: done ? 'line-through' : 'none',
              lineHeight:1.3, letterSpacing:'-0.02em',
            }}>
              {task.title}
            </h2>
          </div>

          {/* Status badges */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:14 }}>
            {done && (
              <span style={{ fontSize:12, fontWeight:700, padding:'4px 12px', borderRadius:99,
                             background:C.grnL, color:C.grn, border:`1px solid ${C.grnB}` }}>
                ✓ 已完成
              </span>
            )}
            {isBlocked && !done && (
              <span style={{ fontSize:12, fontWeight:700, padding:'4px 12px', borderRadius:99,
                             background:C.redL, color:C.red, border:`1px solid ${C.redB}` }}>
                🔒 等待前置任務
              </span>
            )}
            {!isBlocked && !done && (
              <span style={{ fontSize:12, fontWeight:700, padding:'4px 12px', borderRadius:99,
                             background:C.accL, color:C.acc, border:`1px solid ${C.accB}` }}>
                ✦ 可執行
              </span>
            )}
            {task.recurrence_rule && (
              <span style={{ fontSize:12, fontWeight:700, padding:'4px 12px', borderRadius:99,
                             background:'#f0f4ff', color:C.acc, border:`1px solid ${C.accB}` }}>
                🔁 重複任務
              </span>
            )}
          </div>
        </div>

        {/* Info fields */}
        <div style={{ background:'#fff', borderRadius:20, overflow:'hidden',
                      boxShadow:'0 1px 4px rgba(0,0,0,.06)', marginBottom:12 }}>

          {category && (
            <InfoRow icon="🏷" label="分類">
              <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:category.color }} />
                <span style={{ fontSize:15, fontWeight:500, color:C.t1 }}>{category.name}</span>
              </span>
            </InfoRow>
          )}

          {task.due_date && due && (
            <InfoRow icon="📅" label="到期日">
              <span style={{ fontSize:13, fontWeight:700, padding:'3px 10px', borderRadius:99,
                             background:due.bg, color:due.fg }}>
                {task.due_date} &nbsp;·&nbsp; {due.text}
              </span>
            </InfoRow>
          )}

          {task.detail && (
            <InfoRow icon="📝" label="備註" last>
              <p style={{ fontSize:15, color:C.t2, lineHeight:1.6, whiteSpace:'pre-wrap' }}>
                {task.detail}
              </p>
            </InfoRow>
          )}
        </div>

        {/* Prerequisites */}
        {prereqs.length > 0 && (
          <div style={{ background:'#fff', borderRadius:20,
                        boxShadow:'0 1px 4px rgba(0,0,0,.06)', marginBottom:12 }}>
            <div style={{ padding:'14px 16px 4px' }}>
              <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase',
                          letterSpacing:'0.07em', color:C.t3 }}>
                前置任務
              </p>
            </div>
            {prereqs.map((p, i) => (
              <div key={p.id} style={{
                display:'flex', alignItems:'center', gap:10,
                padding:'12px 16px',
                borderTop: i > 0 ? `1px solid ${C.b1}` : 'none',
              }}>
                <span style={{
                  width:18, height:18, borderRadius:'50%', flexShrink:0,
                  background: p.completed ? C.grn : C.b2,
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  {p.completed === 1 && (
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                <span style={{ fontSize:14, color: p.completed ? C.t3 : C.t1,
                               textDecoration: p.completed ? 'line-through' : 'none' }}>
                  {p.title}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Subtasks */}
        {children.length > 0 && (
          <div style={{ background:'#fff', borderRadius:20,
                        boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
            <div style={{ padding:'14px 16px 4px' }}>
              <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase',
                          letterSpacing:'0.07em', color:C.t3 }}>
                子任務 ({children.length})
              </p>
            </div>
            {children.map((ch, i) => (
              <div key={ch.id} style={{
                display:'flex', alignItems:'center', gap:10,
                padding:'12px 16px',
                borderTop: i > 0 ? `1px solid ${C.b1}` : 'none',
              }}>
                <div style={{
                  width:18, height:18, borderRadius:'50%', flexShrink:0,
                  border:`2px solid ${ch.completed ? C.grn : C.b2}`,
                  background: ch.completed ? C.grn : 'transparent',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  {ch.completed === 1 && (
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span style={{ fontSize:14, color: ch.completed ? C.t3 : C.t1,
                               textDecoration: ch.completed ? 'line-through' : 'none' }}>
                  {ch.title}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ icon, label, children, last }: {
  icon:string; label:string; children:React.ReactNode; last?:boolean
}) {
  return (
    <div style={{
      display:'flex', gap:14, padding:'14px 16px',
      borderBottom: last ? 'none' : '1px solid #f0f0f2',
      alignItems:'flex-start',
    }}>
      <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>{icon}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase',
                    letterSpacing:'0.06em', color:'#999', marginBottom:4 }}>{label}</p>
        {children}
      </div>
    </div>
  )
}

const backBtnStyle: React.CSSProperties = {
  padding:'10px 24px', borderRadius:12,
  background:'#4f6ef7', color:'#fff',
  border:'none', fontSize:15, fontWeight:600, cursor:'pointer',
}
