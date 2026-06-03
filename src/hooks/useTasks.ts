import { useCallback, useEffect, useState } from 'react'
import { supabase, type Task, type Dep } from '../lib/supabase'

// ── Date helpers ──────────────────────────────────────────────────────────────

export const todayStr = () => new Date().toISOString().slice(0, 10)

export function daysFromToday(d: string): number {
  return Math.ceil(
    (new Date(d).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86_400_000
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTasks(categoryId?: string) {
  const [tasks,   setTasks]   = useState<Task[]>([])
  const [deps,    setDeps]    = useState<Dep[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  // Transient toast for write failures (offline / network). Auto-clears.
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      let q = supabase
        .from('tasks')
        .select('*')
        .is('deleted_at', null)
        .order('manual_order')
        .order('created_at')

      if (categoryId) q = q.eq('category_id', categoryId)

      const [{ data: taskData, error: tErr }, { data: depData }] = await Promise.all([
        q,
        supabase.from('task_dependencies').select('task_id, depends_on_id'),
      ])

      if (tErr) throw tErr
      setTasks(taskData ?? [])
      setDeps(depData ?? [])
    } catch (e: any) {
      setError(e.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [categoryId])

  useEffect(() => { load() }, [load])

  // Auto-dismiss the write-failure toast after a few seconds.
  useEffect(() => {
    if (!actionError) return
    const t = setTimeout(() => setActionError(null), 3500)
    return () => clearTimeout(t)
  }, [actionError])

  // ── Mutations ─────────────────────────────────────────────────────────────

  // Toggle a task's completion. Optimistic, but rolls the row back to its
  // previous state and surfaces a toast if the write fails (offline / network).
  // Returns true on success, false on failure — callers may use this to keep
  // their own local state in sync without duplicating rollback logic.
  const toggleComplete = async (task: Task): Promise<boolean> => {
    const now       = new Date().toISOString()
    const prev      = task.completed
    const completed = prev === 1 ? 0 : 1
    // Optimistic update
    setTasks(p => p.map(t => t.id === task.id ? { ...t, completed } : t))
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ completed, updated_at: now })
        .eq('id', task.id)
      if (error) throw error
      return true
    } catch {
      // Roll back to the pre-toggle value and tell the user honestly.
      setTasks(p => p.map(t => t.id === task.id ? { ...t, completed: prev } : t))
      setActionError('目前似乎離線，暫時無法更新，請稍後再試')
      return false
    }
  }

  const createTask = async (title: string, catId: string | null, dueDate?: string | null) => {
    // Require a valid session before writing, so we never fake success offline
    // or when logged out.
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('NOT_AUTHENTICATED')
    const user = session.user

    const now  = new Date().toISOString()
    const id   = crypto.randomUUID()
    const newTask: Partial<Task> = {
      id, title: title.trim(),
      category_id: catId, parent_id: null,
      detail: null, due_date: dueDate ?? null,
      completed: 0, starred: 0, manual_order: 9999,
      recurrence_rule: null, recurrence_end: null, missed_count: 0,
      created_at: now, updated_at: now, deleted_at: null,
      user_id: user.id,
    }

    // Optimistic add
    setTasks(prev => [newTask as Task, ...prev])
    const { error } = await supabase.from('tasks').insert(newTask)
    if (error) {
      // Rollback
      setTasks(prev => prev.filter(t => t.id !== id))
      throw error
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const taskMap = new Map(tasks.map(t => [t.id, t]))

  const blockedIds = new Set<string>()
  const depMap = new Map<string, Set<string>>()
  for (const d of deps) {
    if (!depMap.has(d.task_id)) depMap.set(d.task_id, new Set())
    depMap.get(d.task_id)!.add(d.depends_on_id)
  }
  for (const [tid, prereqs] of depMap) {
    for (const pid of prereqs) {
      if (taskMap.get(pid) && !taskMap.get(pid)!.completed) { blockedIds.add(tid); break }
    }
  }

  const td = todayStr()
  const rootTasks = tasks.filter(t => !t.parent_id && !t.deleted_at)
  const pending   = rootTasks.filter(t => !t.completed)

  const overdue  = pending.filter(t => t.due_date && daysFromToday(t.due_date) < 0)
  const dueToday = pending.filter(t => t.due_date === td)
  const upcoming = pending.filter(t => t.due_date && daysFromToday(t.due_date) > 0 && daysFromToday(t.due_date) <= 7)

  return {
    tasks, rootTasks, pending, loading, error,
    blockedIds, depMap, taskMap,
    overdue, dueToday, upcoming,
    toggleComplete, createTask,
    actionError,
    reload: load,
  }
}
