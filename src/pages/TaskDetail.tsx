import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, type Task } from '../lib/supabase'
import { daysFromToday, useTasks } from '../hooks/useTasks'
import { useCategories } from '../hooks/useCategories'

const C = {
  acc:'#4f6ef7', accL:'#eef1fe', accB:'#c7d0fb',
  t1:'#111', t2:'#555', t3:'#999',
  b1:'#f0f0f2', b2:'#e0e0e2',
  grn:'#16a34a', grnL:'#f0fdf4', grnB:'#bbf7d0',
  red:'#dc2626', redL:'#fef2f2', redB:'#fecaca',
  orn:'#ea580c', ornL:'#fff7ed',
  amb:'#d97706', ambL:'#fffbeb',
  star:'#f59e0b',
}

function dueBadge(d: string) {
  const n = daysFromToday(d)
  if (n < 0)   return { text:`逾期 ${Math.abs(n)} 天`, bg:C.redL, fg:C.red }
  if (n === 0) return { text:'今天到期', bg:C.ornL, fg:C.orn }
  if (n === 1) return { text:'明天', bg:C.ambL, fg:C.amb }
  if (n <= 7)  return { text:`${n} 天後`, bg:'#eff6ff', fg:'#2563eb' }
  return { text:d, bg:C.b1, fg:C.t3 }
}

// Auto-size a textarea to its content so the title/notes grow naturally.
function grow(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

export default function TaskDetail() {
  const { id }  = useParams<{ id: string }>()
  const nav     = useNavigate()
  const { toggleComplete, updateTaskFields, softDelete, toggleStar, actionError } = useTasks()
  const { categories } = useCategories()

  const [task, setTask]           = useState<Task | null>(null)
  const [children, setChildren]   = useState<Task[]>([])
  const [prereqs, setPrereqs]     = useState<Task[]>([])
  const [isBlocked, setIsBlocked] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [toggling, setToggling]   = useState(false)

  // Editable fields (auto-saved).
  const [title, setTitle]         = useState('')
  const [detail, setDetail]       = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [dueDate, setDueDate]     = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  // Refs for debounce + flush-on-leave (so we never lose the last keystroke).
  const saveTimer  = useRef<number | undefined>(undefined)
  const flashTimer = useRef<number | undefined>(undefined)
  const editIdRef  = useRef('')                                   // id currently being edited
  const savedRef   = useRef<{ title: string; detail: string | null }>({ title:'', detail:null })
  const titleRef   = useRef('')
  const detailRef  = useRef('')
  const flushRef   = useRef<() => void>(() => {})
  const dateRef    = useRef<HTMLInputElement>(null)
  const titleArea  = useRef<HTMLTextAreaElement>(null)
  const detailArea = useRef<HTMLTextAreaElement>(null)

  // Keep refs in sync with the latest text every render (used by the flush path).
  titleRef.current  = title
  detailRef.current = detail

  const selectedCat = categories.find(c => c.id === categoryId) ?? null

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return
    let cancelled = false

    async function load() {
      const { data: t } = await supabase
        .from('tasks').select('*').eq('id', id).single()
      if (!t || cancelled) return

      const { data: ch } = await supabase
        .from('tasks').select('*')
        .eq('parent_id', id).is('deleted_at', null)

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
        setPrereqs(prereqTasks)
        setIsBlocked(blocked)
        // Seed the editable fields + the "last saved" snapshot.
        setTitle(t.title ?? '')
        setDetail(t.detail ?? '')
        setCategoryId(t.category_id)
        setDueDate(t.due_date)
        savedRef.current = { title: t.title ?? '', detail: t.detail ?? null }
        editIdRef.current = t.id
        setLoading(false)
      }
    }

    load()
    // On unmount OR before switching to another task id, flush any pending text
    // edit for the OUTGOING task so it is never lost.
    return () => { cancelled = true; flushRef.current() }
  }, [id])

  // Auto-grow the textareas as content/loading changes.
  useEffect(() => { grow(titleArea.current); grow(detailArea.current) }, [loading, title, detail])

  // ── Auto-save ───────────────────────────────────────────────────────────────

  const flashSaved = () => {
    setSavedFlash(true)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setSavedFlash(false), 1600)
  }

  // Commit debounced text edits (title / detail). `silent` skips local UI updates
  // for the flush-on-leave path (component may be unmounting).
  const commitText = async (silent = false) => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = undefined }
    const eid = editIdRef.current
    if (!eid) return

    const tnorm = titleRef.current.trim()
    const dnorm = detailRef.current.trim() ? detailRef.current : null
    // Never wipe the title with an empty value — keep the last good title.
    const titleChanged  = !!tnorm && tnorm !== savedRef.current.title
    const detailChanged = dnorm !== savedRef.current.detail
    if (!titleChanged && !detailChanged) return

    const payload: Partial<Task> = {}
    if (titleChanged)  payload.title  = tnorm
    if (detailChanged) payload.detail = dnorm

    const before = savedRef.current
    // Optimistically mark saved so an overlapping flush won't double-send.
    savedRef.current = { title: titleChanged ? tnorm : before.title, detail: dnorm }

    const ok = await updateTaskFields(eid, payload)
    if (!ok) { savedRef.current = before; return }   // error toast shown by the hook
    if (!silent) {
      setTask(t => t ? { ...t, ...payload } : t)
      flashSaved()
    }
  }
  // Always flush the latest commitText closure (reads refs, so values are current).
  flushRef.current = () => { void commitText(true) }

  const scheduleSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => { void commitText() }, 900)
  }

  // If the title is left empty, quietly restore the last saved title so the UI
  // matches the DB (we never persist an empty title). Detail may stay empty.
  const onTitleBlur = () => {
    if (!title.trim()) { setTitle(savedRef.current.title); return }
    void commitText()
  }

  // Selection fields (category / due date) save immediately.
  const saveImmediate = async (patch: Partial<Task>) => {
    const eid = editIdRef.current
    if (!eid) return
    const ok = await updateTaskFields(eid, patch)
    if (ok) {
      setTask(t => t ? { ...t, ...patch } : t)
      flashSaved()
    } else {
      // Revert the control to the last known value (error toast shown by the hook).
      if ('category_id' in patch) setCategoryId(task?.category_id ?? null)
      if ('due_date'    in patch) setDueDate(task?.due_date ?? null)
    }
  }

  const onPickCategory = (cid: string | null) => { setCategoryId(cid); void saveImmediate({ category_id: cid }) }
  const onPickDue      = (d: string | null)   => { setDueDate(d);      void saveImmediate({ due_date: d }) }

  const handleToggle = async () => {
    if (!task || toggling) return
    setToggling(true)
    // Commit to local state only after the shared write succeeds; on failure
    // the shared toggleComplete handles the toast and we leave the row as-is.
    const ok = await toggleComplete(task)
    if (ok) setTask(t => t ? { ...t, completed: t.completed === 1 ? 0 : 1 } : t)
    setToggling(false)
  }

  const handleDelete = async () => {
    if (!task) return
    // softDelete arms the undo prompt (shown on the list we return to) on success.
    const ok = await softDelete(task)
    if (ok) nav(-1)
    // On failure the shared softDelete shows the toast and the task stays.
  }

  const handleStar = async () => {
    if (!task) return
    // Commit locally only after the shared write succeeds (failure → toast).
    const ok = await toggleStar(task)
    if (ok) setTask(t => t ? { ...t, starred: t.starred === 1 ? 0 : 1 } : t)
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
  const due  = dueDate ? dueBadge(dueDate) : null

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

        <div style={{ flex:1 }} />

        {/* Low-key auto-save indicator */}
        <span style={{
          fontSize:13, fontWeight:600, color:C.t3,
          display:'flex', alignItems:'center', gap:4,
          opacity: savedFlash ? 1 : 0, transition:'opacity .3s',
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-6" stroke={C.grn} strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          已儲存
        </span>
      </div>

      <div style={{ padding:'8px 16px 40px' }}>

        {/* Main card */}
        <div style={{ background:'#fff', borderRadius:20,
                      padding:'20px', marginBottom:12,
                      boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>

          {/* Done + editable title row */}
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

            <textarea
              ref={titleArea}
              value={title}
              onChange={e => { setTitle(e.target.value); grow(e.currentTarget); scheduleSave() }}
              onBlur={onTitleBlur}
              placeholder="任務名稱"
              rows={1}
              style={{
                flex:1, minWidth:0, fontSize:22, fontWeight:700,
                color: done ? C.t3 : C.t1, lineHeight:1.3, letterSpacing:'-0.02em',
                border:'none', outline:'none', background:'transparent',
                resize:'none', overflow:'hidden', fontFamily:'inherit', padding:0,
              }}
            />

            <button onClick={handleStar}
              style={{ flexShrink:0, marginTop:2, background:'none', border:'none',
                       cursor:'pointer', padding:2, lineHeight:0 }}
              aria-label={task.starred === 1 ? '取消加星' : '加星'}>
              <StarIcon filled={task.starred === 1} />
            </button>
          </div>

          {/* Status badges (read-only; recurrence shown but never edited) */}
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

          {/* Editable detail / notes */}
          <textarea
            ref={detailArea}
            value={detail}
            onChange={e => { setDetail(e.target.value); grow(e.currentTarget); scheduleSave() }}
            onBlur={() => commitText()}
            placeholder="新增備註…"
            rows={2}
            style={{
              marginTop:14, width:'100%', boxSizing:'border-box',
              background:C.b1, borderRadius:12, padding:'12px',
              fontSize:14, color:C.t2, lineHeight:1.6,
              border:'none', outline:'none', resize:'none', overflow:'hidden',
              fontFamily:'inherit',
            }}
          />
        </div>

        {/* Editable fields: category + due date */}
        <div style={{ background:'#fff', borderRadius:20, overflow:'hidden',
                      boxShadow:'0 1px 4px rgba(0,0,0,.06)', marginBottom:12 }}>

          {/* Category */}
          <div style={{ padding:'14px 16px', borderBottom:`1px solid ${C.b1}` }}>
            <p style={labelStyle}>🏷 分類</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:10 }}>
              <Chip label="無分類" color={C.acc} active={!categoryId}
                    onClick={() => onPickCategory(null)} />
              {categories.map(cat => (
                <Chip key={cat.id} label={cat.name} color={cat.color} dot
                      active={categoryId === cat.id}
                      onClick={() => onPickCategory(cat.id)} />
              ))}
            </div>
          </div>

          {/* Due date */}
          <div style={{ padding:'14px 16px' }}>
            <p style={labelStyle}>📅 到期日</p>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10 }}>
              <input
                ref={dateRef}
                type="date"
                value={dueDate ?? ''}
                onChange={e => onPickDue(e.target.value || null)}
                style={{ position:'absolute', width:1, height:1, opacity:0, pointerEvents:'none' }}
              />
              <button
                onClick={() => { try { (dateRef.current as any)?.showPicker() } catch { dateRef.current?.click() } }}
                style={{
                  display:'flex', alignItems:'center', gap:6,
                  padding:'8px 14px', borderRadius:99,
                  border:`1.5px solid ${dueDate ? '#ea580c66' : C.b2}`,
                  background: dueDate ? C.ornL : '#fff',
                  color: dueDate ? C.orn : C.t3,
                  fontSize:14, fontWeight:600, cursor:'pointer',
                }}>
                {dueDate
                  ? `${dueDate}${due ? '　·　' + due.text : ''}`
                  : '＋ 設定日期'}
              </button>
              {dueDate && (
                <button onClick={() => onPickDue(null)}
                  style={{ background:'none', border:'none', cursor:'pointer',
                           color:C.t3, fontSize:16, padding:'0 4px', lineHeight:1 }}>
                  ✕
                </button>
              )}
            </div>
          </div>
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
                display:'flex', alignItems:'flex-start', gap:10,
                padding:'12px 16px',
                borderTop: i > 0 ? `1px solid ${C.b1}` : 'none',
              }}>
                <div style={{
                  width:18, height:18, borderRadius:'50%', flexShrink:0, marginTop:2,
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
                <div style={{ flex:1, minWidth:0 }}>
                  <span style={{ fontSize:14, color: ch.completed ? C.t3 : C.t1,
                                 textDecoration: ch.completed ? 'line-through' : 'none' }}>
                    {ch.title}
                  </span>
                  {ch.detail && (
                    <div style={{
                      marginTop:4, fontSize:12, color:C.t3,
                      lineHeight:1.5, whiteSpace:'pre-wrap',
                    }}>
                      {ch.detail}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete */}
        <button
          onClick={handleDelete}
          style={{
            marginTop:20, width:'100%', padding:'14px',
            borderRadius:14, background:'#fff',
            border:`1px solid ${C.redB}`, color:C.red,
            fontSize:15, fontWeight:600, cursor:'pointer',
          }}>
          刪除任務
        </button>
      </div>

      {actionError && <Toast text={actionError} />}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize:11, fontWeight:700, textTransform:'uppercase',
  letterSpacing:'0.06em', color:'#999',
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24"
      fill={filled ? C.star : 'none'}
      stroke={filled ? C.star : '#c8c8c8'} strokeWidth="1.8">
      <path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.6l5.8-.8L12 3.5z"
            strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

function Chip({ label, color, dot, active, onClick }: {
  label:string; color:string; dot?:boolean; active:boolean; onClick:()=>void
}) {
  return (
    <button onClick={onClick}
      style={{
        display:'flex', alignItems:'center', gap:6,
        padding:'7px 14px', borderRadius:99, fontSize:13, fontWeight:600,
        border:`1.5px solid ${active ? color : C.b2}`,
        background: active ? color+'18' : 'transparent',
        color: active ? color : C.t2, cursor:'pointer', whiteSpace:'nowrap',
      }}>
      {dot && <span style={{ width:7, height:7, borderRadius:'50%', background:color }} />}
      {label}
    </button>
  )
}

// Transient write-failure toast. Auto-clears via useTasks.
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

const backBtnStyle: React.CSSProperties = {
  padding:'10px 24px', borderRadius:12,
  background:'#4f6ef7', color:'#fff',
  border:'none', fontSize:15, fontWeight:600, cursor:'pointer',
}
