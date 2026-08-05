import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = 'https://svdtwblpjwdkjpvzsvpt.supabase.co'
const SUPABASE_ANON    = 'sb_publishable_mjROATQdv-6MbpW3Wi8Xow_dY5tH4R1'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

// ── Types (matches desktop schema) ───────────────────────────────────────────

export interface Task {
  id:              string
  title:           string
  category_id:     string | null
  parent_id:       string | null
  detail:          string | null
  due_date:        string | null
  completed:       number
  starred:         number
  manual_order:    number
  recurrence_rule: string | null
  recurrence_end:  string | null
  missed_count:    number
  created_at:      string
  updated_at:      string
  deleted_at:      string | null
  task_type:       string | null
  maintenance_item_id: string | null
  user_id:         string
}

// maintenance_items is read-only on mobile (Phase 1.5-B: display only, no writes).
export interface MaintenanceItem {
  id:                  string
  user_id:             string
  name:                string
  category_id:         string | null
  location:            string | null
  notes:               string | null
  maintenance_type:    string
  cycle_value:         number
  cycle_unit:          string   // 'day' | 'week' | 'month'
  schedule_anchor:     string | null
  last_handled_at:     string | null
  next_due_at:         string | null
  remind_days_before:  number
  current_task_id:     string | null
  is_active:           number
  created_at:          string
  updated_at:          string
  deleted_at:          string | null
}

export interface Category {
  id:         string
  name:       string
  color:      string
  sort_order: number
  user_id:    string
}

export interface Dep {
  task_id:       string
  depends_on_id: string
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  return supabase.auth.signOut()
}
