import { useCallback, useEffect, useState } from 'react'
import { supabase, type Task, type Dep } from '../lib/supabase'

// ── Date helpers ──────────────────────────────────────────────────────────────
// 全手機版唯一的日期算法：一律用「本地時間」，並套用凌晨 4 點換日，行為與桌面版一致。
// 不要在別處用 toISOString() 取日期或用 new Date('YYYY-MM-DD')（會以 UTC 解讀）。

// 換日時間（小時）：現在時間的小時數 < 此值時，視為前一天。
// NOTE: 目前寫死為 4，與桌面版預設值一致。未來需改為從 Supabase 同步
//       （桌面版的此設定目前存於本機 settings.json，尚未上雲）。
const DAILY_RESET_HOUR = 4

// 取得「今天是哪一天」的日期鍵（本地時間 + 凌晨 4 點換日）。回傳 'YYYY-MM-DD'。
// 等同桌面版的 getDailyDateKey。
export function getDailyDateKey(now: Date = new Date(), resetHour: number = DAILY_RESET_HOUR): string {
  const adjusted = new Date(now)
  if (adjusted.getHours() < resetHour) adjusted.setDate(adjusted.getDate() - 1)
  const y = adjusted.getFullYear()
  const m = String(adjusted.getMonth() + 1).padStart(2, '0')
  const d = String(adjusted.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// 把 'YYYY-MM-DD' 當「本地」日期解析（避免 new Date('YYYY-MM-DD') 以 UTC 午夜解讀）。
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// 今天的日期鍵（本地 + 凌晨 4 點換日）。
export const todayStr = () => getDailyDateKey()

// 目標日期距離「今天」幾天（負數 = 已逾期）。
// 兩端都以本地午夜為基準、四捨五入以避開 DST 造成的 23/25 小時誤差。
export function daysFromToday(d: string): number {
  const today  = parseLocalDate(getDailyDateKey())
  const target = parseLocalDate(d)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

// Whether there is still a usable auth session — used to phrase write failures
// accurately (an expired/missing session reads very differently from a flaky
// network). Offline-but-logged-in returns true (getSession reads local storage).
async function hasValidSession(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return Boolean(session)
  } catch {
    // If we can't even read the session, treat it as "no valid session" so the
    // failure flow finishes cleanly (rather than rejecting and, e.g., leaving
    // TaskDetail's toggle button stuck disabled).
    return false
  }
}

// ── Undo store for soft-deletes ─────────────────────────────────────────────
// A tiny cross-page store so the "已刪除 / 復原" prompt can appear on whichever
// page is visible after a delete — including deleting in TaskDetail and then
// returning to a list. Holds the most recently deleted task for a few seconds.

let undoTask: Task | null = null
let undoTimer: ReturnType<typeof setTimeout> | undefined
const undoListeners = new Set<() => void>()
const UNDO_MS = 5000

function notifyUndo() { undoListeners.forEach(l => l()) }

export function setUndoTask(task: Task | null) {
  if (undoTimer) { clearTimeout(undoTimer); undoTimer = undefined }
  undoTask = task
  if (task) undoTimer = setTimeout(() => { undoTask = null; notifyUndo() }, UNDO_MS)
  notifyUndo()
}

// Subscribe to the undo store; returns the task currently offering undo (or null).
export function useUndoTask(): Task | null {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force(n => n + 1)
    undoListeners.add(l)
    return () => { undoListeners.delete(l) }
  }, [])
  return undoTask
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
      // Roll back to the pre-toggle value and tell the user honestly. Phrase
      // the message by cause: an invalid session needs re-login, anything else
      // (offline / server rejection) stays neutral rather than claiming offline.
      setTasks(p => p.map(t => t.id === task.id ? { ...t, completed: prev } : t))
      setActionError(
        (await hasValidSession())
          ? '暫時無法更新，請稍後再試'
          : '登入狀態已失效，請重新登入後再試'
      )
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
      // Rollback, then classify the failure so Capture can phrase it accurately.
      setTasks(prev => prev.filter(t => t.id !== id))
      throw new Error((await hasValidSession()) ? 'WRITE_FAILED' : 'SESSION_EXPIRED')
    }
  }

  // Patch a subset of a task's fields (used by the detail editor's auto-save).
  // ONLY the provided fields are written, so untouched columns — recurrence_rule,
  // recurrence_end, parent_id, starred, manual_order, completed — are never
  // altered. On failure, surfaces a toast (same wording rules as toggleComplete)
  // and returns false; callers can revert their local state on false.
  const updateTaskFields = async (id: string, fields: Partial<Task>): Promise<boolean> => {
    const now = new Date().toISOString()
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ ...fields, updated_at: now })
        .eq('id', id)
      if (error) throw error
      // Keep the internal list consistent if this row is present.
      setTasks(p => p.map(t => t.id === id ? { ...t, ...fields, updated_at: now } : t))
      return true
    } catch {
      setActionError(
        (await hasValidSession())
          ? '暫時無法儲存，請稍後再試'
          : '登入狀態已失效，請重新登入後再試'
      )
      return false
    }
  }

  // Toggle a task's star. Optimistic; rolls back + toast on failure. Only writes
  // `starred` (+ updated_at) — no other column, and no sorting change.
  const toggleStar = async (task: Task): Promise<boolean> => {
    const now     = new Date().toISOString()
    const prev    = task.starred
    const starred = prev === 1 ? 0 : 1
    setTasks(p => p.map(t => t.id === task.id ? { ...t, starred } : t))
    try {
      const { error } = await supabase
        .from('tasks').update({ starred, updated_at: now }).eq('id', task.id)
      if (error) throw error
      return true
    } catch {
      setTasks(p => p.map(t => t.id === task.id ? { ...t, starred: prev } : t))
      setActionError(
        (await hasValidSession())
          ? '暫時無法更新，請稍後再試'
          : '登入狀態已失效，請重新登入後再試'
      )
      return false
    }
  }

  // Soft-delete: write deleted_at so the row is hidden everywhere (queries filter
  // deleted_at IS NULL) but stays recoverable. Only writes deleted_at (+ updated_at).
  // On success, arms the undo store; on failure, reloads true state and toasts.
  const softDelete = async (task: Task): Promise<boolean> => {
    const now = new Date().toISOString()
    setTasks(p => p.filter(t => t.id !== task.id))   // optimistic remove
    try {
      const { error } = await supabase
        .from('tasks').update({ deleted_at: now, updated_at: now }).eq('id', task.id)
      if (error) throw error
      setUndoTask(task)
      return true
    } catch {
      await load()   // restore the true server state (task reappears in place)
      setActionError(
        (await hasValidSession())
          ? '暫時無法刪除，請稍後再試'
          : '登入狀態已失效，請重新登入後再試'
      )
      return false
    }
  }

  // Restore a soft-deleted task: clear deleted_at (+ updated_at). Reloads so the
  // task reappears in its correct position. Clears the undo store on success.
  const restoreTask = async (task: Task): Promise<boolean> => {
    const now = new Date().toISOString()
    try {
      const { error } = await supabase
        .from('tasks').update({ deleted_at: null, updated_at: now }).eq('id', task.id)
      if (error) throw error
      setUndoTask(null)
      await load()
      return true
    } catch {
      setActionError(
        (await hasValidSession())
          ? '暫時無法復原，請稍後再試'
          : '登入狀態已失效，請重新登入後再試'
      )
      return false
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
    toggleComplete, createTask, updateTaskFields,
    toggleStar, softDelete, restoreTask,
    actionError,
    reload: load,
  }
}
