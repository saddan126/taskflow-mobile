import { supabase } from './supabase'
import type { Task, Category, DepRow } from './types'

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { session: data.session, error: error?.message }
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function fetchAllData(): Promise<{
  tasks: Task[]
  categories: Category[]
  deps: DepRow[]
}> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { tasks: [], categories: [], deps: [] }

  const [t, c, d] = await Promise.all([
    supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('manual_order', { ascending: true }),
    supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
    supabase
      .from('task_dependencies')
      .select('task_id, depends_on_id')
      .eq('user_id', user.id),
  ])

  return {
    tasks:      (t.data ?? []) as Task[],
    categories: (c.data ?? []) as Category[],
    deps:       (d.data ?? []) as DepRow[],
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function createTask(title: string, categoryId: string | null = null): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'Not logged in'

  const now = new Date().toISOString()
  const id  = crypto.randomUUID()

  const { error } = await supabase.from('tasks').insert({
    id,
    user_id:      user.id,
    title:        title.trim(),
    category_id:  categoryId,
    completed:    0,
    starred:      0,
    manual_order: Date.now(),   // use timestamp as order — simple, always unique
    missed_count: 0,
    created_at:   now,
    updated_at:   now,
  })

  return error?.message ?? null
}

export async function toggleComplete(task: Task): Promise<string | null> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('tasks')
    .update({ completed: task.completed ? 0 : 1, updated_at: now })
    .eq('id', task.id)
  return error?.message ?? null
}

// ── Date helpers ──────────────────────────────────────────────────────────────

export const todayStr = () => new Date().toISOString().slice(0, 10)

export function daysFromToday(d: string): number {
  return Math.ceil(
    (new Date(d).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86_400_000
  )
}

// ── Blocking helpers ──────────────────────────────────────────────────────────

export function computeBlockedIds(tasks: Task[], deps: DepRow[]): Set<string> {
  const taskMap = new Map(tasks.map(t => [t.id, t]))
  const blocked = new Set<string>()
  for (const dep of deps) {
    const prereq = taskMap.get(dep.depends_on_id)
    if (prereq && !prereq.completed) blocked.add(dep.task_id)
  }
  return blocked
}
