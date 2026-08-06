import { useCallback, useEffect, useState } from 'react'
import { supabase, type MaintenanceItem } from '../lib/supabase'
import { hasValidSession, getDailyDateKey, PLAIN_DATE_RE } from './useTasks'

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
  // Read-only (B-4b): `${maintenance_item_id}|${due_date}` for every open
  // (not completed, not deleted) maintenance task. Lets the page show "等待
  // 桌面產生任務" for an item whose current round has no matching task yet.
  const [openTaskKeys, setOpenTaskKeys] = useState<Set<string>>(new Set())
  // B-4b-1: whether the query above is known-good. If it failed, an empty
  // Set is indistinguishable from "no open tasks" — so isWaitingForTask must
  // suppress the badge entirely rather than reporting a false "waiting".
  const [openTaskKeysKnown, setOpenTaskKeysKnown] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  // Transient toasts for the B-4c fallback-completion write (mirrors the
  // actionError/actionNotice split already used by useTasks). Separate from
  // `error` above, which represents the item LIST failing to load.
  const [actionError, setActionError]   = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ data, error: err }, taskRes] = await Promise.all([
        supabase
          .from('maintenance_items')
          .select('*')
          .is('deleted_at', null)
          .eq('is_active', 1)
          .order('next_due_at'),
        supabase
          .from('tasks')
          .select('maintenance_item_id, due_date')
          .eq('task_type', 'maintenance')
          .eq('completed', 0)
          .is('deleted_at', null),
      ])
      if (err) throw err
      setItems((data ?? []) as MaintenanceItem[])
      // A failure here never blocks the item list itself (same "supplementary
      // query" convention as useTasks' deps) — but unlike that convention, we
      // must NOT default to an empty Set on failure: that would read as "no
      // open tasks" and falsely flag every item as waiting. Only update the
      // keys (and mark them known-good) when this query actually succeeded;
      // on failure, mark them unknown so isWaitingForTask suppresses the badge.
      if (taskRes.error) {
        setOpenTaskKeysKnown(false)
      } else {
        const keys = new Set<string>()
        for (const t of taskRes.data ?? []) {
          if (t.maintenance_item_id && t.due_date) keys.add(`${t.maintenance_item_id}|${t.due_date}`)
        }
        setOpenTaskKeys(keys)
        setOpenTaskKeysKnown(true)
      }
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

  // Auto-dismiss the two write-flow toasts after a few seconds each.
  useEffect(() => {
    if (!actionError) return
    const t = setTimeout(() => setActionError(null), 3500)
    return () => clearTimeout(t)
  }, [actionError])
  useEffect(() => {
    if (!actionNotice) return
    const t = setTimeout(() => setActionNotice(null), 3500)
    return () => clearTimeout(t)
  }, [actionNotice])

  // Whether this item's current round (next_due_at) has no matching open task
  // yet — i.e. desktop hasn't generated it. Null next_due_at has no "round" to
  // wait for, so it's never flagged; neither is any item while the open-task
  // query itself is in an unknown (failed) state (B-4b-1) — unknown is not
  // the same as "no tasks", so we suppress rather than guess.
  const isWaitingForTask = (item: MaintenanceItem): boolean =>
    openTaskKeysKnown && !!item.next_due_at && !openTaskKeys.has(`${item.id}|${item.next_due_at}`)

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

  // Fallback: manually record a completion for an item that has no matching
  // open task yet (Phase 1.5-B, B-4c). This is the ONLY entry point that lets
  // mobile advance a maintenance_items row without a task driving it — it
  // never touches `tasks` at all (no read, no write), unlike the normal
  // toggleComplete-driven flow in useTasks. Steps run in order; any failure
  // before (c) aborts with nothing written. (d) logging the event is the one
  // step whose failure is reported but NOT rolled back — (c) already committed.
  const recordFallbackCompletion = async (itemId: string): Promise<boolean> => {
    // a) Re-read the row fresh — never trust the on-screen copy.
    const { data: item, error: itemErr } = await supabase
      .from('maintenance_items')
      .select('*')
      .eq('id', itemId)
      .is('deleted_at', null)
      .maybeSingle()

    if (itemErr || !item) {
      setActionError('找不到對應的更替項目，未寫入任何資料')
      return false
    }

    // b) Compute the advance, and refuse to write anything malformed.
    const today        = getDailyDateKey()
    const newNextDueAt = calcNextDueAt(today, item.cycle_value, item.cycle_unit)
    if (!PLAIN_DATE_RE.test(today) || !PLAIN_DATE_RE.test(newNextDueAt)) {
      setActionError('日期格式錯誤，未寫入任何資料')
      return false
    }

    // c) Advance the maintenance item. This is the flow's only write until
    // this point succeeds — nothing to roll back if it fails.
    const prevLastHandledAt = item.last_handled_at
    const prevNextDueAt     = item.next_due_at
    const { error: itemUpdErr } = await supabase
      .from('maintenance_items')
      .update({ last_handled_at: today, next_due_at: newNextDueAt, updated_at: new Date().toISOString() })
      .eq('id', item.id)

    if (itemUpdErr) {
      setActionError('推進更替週期失敗，未寫入任何資料')
      return false
    }

    // d) Log the event. (c) already committed, so a failure here is reported,
    // not rolled back — the item stays advanced either way.
    const { data: { session } } = await supabase.auth.getSession()
    const eventNow = new Date().toISOString()
    const { error: eventErr } = await supabase.from('maintenance_events').insert({
      id: crypto.randomUUID(),
      user_id: session?.user.id,
      maintenance_item_id: item.id,
      task_id: null,
      event_type: 'complete',
      event_date: today,
      previous_last_handled_at: prevLastHandledAt,
      previous_next_due_at: prevNextDueAt,
      generated_next_task_id: null,
      reverted_at: null,
      created_at: eventNow,
      updated_at: eventNow,
      deleted_at: null,
    })

    if (eventErr) {
      setActionError('已推進週期，但紀錄寫入失敗')
    } else {
      setActionNotice('已推進週期，下一輪任務會在桌面同步後產生')
    }

    // The item itself advanced regardless of (d) — reload so the new
    // next_due_at and the "等待桌面產生任務" flag reflect it immediately.
    await load()
    return true
  }

  return {
    items, loading, error, reload: load,
    createMaintenanceItem, isWaitingForTask, recordFallbackCompletion,
    actionError, actionNotice,
  }
}
