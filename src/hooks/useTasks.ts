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
