export interface Task {
  id: string
  title: string
  completed: number
  starred: number
  due_date: string | null
  category_id: string | null
  parent_id: string | null
  detail: string | null
  manual_order: number
  recurrence_rule: string | null
  recurrence_end: string | null
  missed_count: number
  created_at: string
  updated_at: string
  deleted_at: string | null
  user_id?: string
}

export interface Category {
  id: string
  name: string
  color: string
  sort_order: number
}

export interface DepRow {
  task_id: string
  depends_on_id: string
}
