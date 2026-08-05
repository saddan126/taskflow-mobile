import { useCallback, useEffect, useState } from 'react'
import { supabase, type MaintenanceItem } from '../lib/supabase'
import { hasValidSession } from './useTasks'

// calcNextDueAt 由純日期字串推算下一次到期日，刻意逐字元鏡射桌面版
// electron/db/maintenance.ts 的 calcNextDueAt（day/week/month + toISOString().slice(0,10)）。
// 這裡刻意使用 toISOString——輸入 lastHandledAt 與輸出皆為純日期字串（非帶時區的
// 時間點），為了與桌面產生完全相同的結果。不要因為「一般規則不可用 toISOString
// 取今天日期」而誤改這裡；也不要加月底夾斷或任何校正，桌面沒有這些，兩端必須一致。
export function calcNextDueAt(lastHandledAt: string, cycleValue: number, cycleUnit: string): string {
  const d = new Date(lastHandledAt)
  if (cycleUnit === 'day') d.setDate(d.getDate() + cycleValue)
  else if (cycleUnit === 'week') d.setDate(d.getDate() + cycleValue * 7)
  else if (cycleUnit === 'month') d.setMonth(d.getMonth() + cycleValue)
  return d.toISOString().slice(0, 10)
}

// Phase 1.5-B, B-2: 新增更替項目（僅寫 maintenance_items，不動 tasks / maintenance_events）。
// 讀取仍為唯讀（見下方 load）；write 只有這一個 insert 入口。
export function useMaintenanceItems() {
  const [items, setItems]     = useState<MaintenanceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('maintenance_items')
        .select('*')
        .is('deleted_at', null)
        .eq('is_active', 1)
        .order('next_due_at')
      if (err) throw err
      setItems((data ?? []) as MaintenanceItem[])
    } catch (e: any) {
      setError(
        (await hasValidSession())
          ? '暫時無法載入，請稍後再試'
          : '登入狀態已失效，請重新登入後再試'
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Create a maintenance item. Requires a valid session (never fakes success
  // offline / logged-out), optimistic-inserts into the sorted list, and rolls
  // back + classifies the failure (WRITE_FAILED vs SESSION_EXPIRED) on error —
  // same shape as useTasks.createTask. Only inserts into maintenance_items.
  const createMaintenanceItem = async (
    name: string,
    cycleValue: number,
    cycleUnit: string,
    lastHandledAt: string,
    notes: string,
  ) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('NOT_AUTHENTICATED')

    const now = new Date().toISOString()
    const id  = crypto.randomUUID()
    const trimmedNotes = notes.trim()
    const newItem: MaintenanceItem = {
      id,
      user_id: session.user.id,
      name: name.trim(),
      category_id: null,
      location: null,
      notes: trimmedNotes === '' ? null : trimmedNotes,
      maintenance_type: 'replacement',
      cycle_value: cycleValue,
      cycle_unit: cycleUnit,
      schedule_anchor: 'completion_date',
      last_handled_at: lastHandledAt,
      next_due_at: calcNextDueAt(lastHandledAt, cycleValue, cycleUnit),
      remind_days_before: 7,
      current_task_id: null,
      is_active: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }

    // Optimistic add, kept sorted by next_due_at (matches the load() query order).
    setItems(prev => {
      const next = [...prev, newItem]
      next.sort((a, b) => (a.next_due_at ?? '￿').localeCompare(b.next_due_at ?? '￿'))
      return next
    })
    const { error } = await supabase.from('maintenance_items').insert(newItem)
    if (error) {
      setItems(prev => prev.filter(i => i.id !== id))
      throw new Error((await hasValidSession()) ? 'WRITE_FAILED' : 'SESSION_EXPIRED')
    }
  }

  return { items, loading, error, reload: load, createMaintenanceItem }
}
