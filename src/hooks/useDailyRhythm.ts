import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getDailyDateKey, hasValidSession } from './useTasks'

// daily_rhythm_items is read-only on mobile (items are managed on desktop).
export interface DailyRhythmItem {
  id:           string
  user_id:      string
  title:        string
  unit_label:   string        // e.g. '次'
  target_count: number
  unit_value:   number
  is_active:    number
  is_paused:    number
  sort_order:   number
  reset_hour:   number         // unused on mobile
  created_at:   string
  updated_at:   string
  deleted_at:   string | null
}

export interface DailyRhythmLog {
  id:                    string
  user_id:               string
  item_id:               string
  date:                  string   // 'YYYY-MM-DD' (getDailyDateKey)
  completed_count:       number
  target_count_snapshot: number   // snapshot taken when the day's first log is created
  unit_value_snapshot:   number
  created_at:            string
  updated_at:            string
}

export function useDailyRhythm() {
  const today = getDailyDateKey()

  const [items, setItems]     = useState<DailyRhythmItem[]>([])
  const [logs, setLogs]       = useState<Record<string, DailyRhythmLog>>({})  // item_id → today's log
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)

  const logsRef = useRef(logs); logsRef.current = logs

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: it, error: iErr }, { data: lg, error: lErr }] = await Promise.all([
        supabase.from('daily_rhythm_items').select('*')
          .eq('is_active', 1).eq('is_paused', 0).is('deleted_at', null).order('sort_order'),
        supabase.from('daily_rhythm_logs').select('*').eq('date', today),
      ])
      if (iErr) throw iErr
      if (lErr) throw lErr
      setItems((it ?? []) as DailyRhythmItem[])
      const map: Record<string, DailyRhythmLog> = {}
      for (const row of (lg ?? []) as DailyRhythmLog[]) map[row.item_id] = row
      setLogs(map)
    } catch {
      setActionError(
        (await hasValidSession())
          ? '暫時無法載入，請稍後再試'
          : '登入狀態已失效，請重新登入後再試'
      )
    } finally {
      setLoading(false)
    }
  }, [today])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!actionError) return
    const t = setTimeout(() => setActionError(null), 3500)
    return () => clearTimeout(t)
  }, [actionError])

  // Set today's completed_count for an item. Optimistic; rolls back + toast on
  // failure. Upserts keyed on (user_id, item_id, date) — the real DB unique key —
  // so we overwrite today's row (incl. one the desktop wrote) rather than
  // duplicating. We look the row up first to preserve its id/created_at AND its
  // existing snapshots: the target/unit snapshots are written ONLY when the day's
  // first log is created, and never overwritten afterwards.
  const setCount = useCallback(async (item: DailyRhythmItem, n: number): Promise<boolean> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setActionError('登入狀態已失效，請重新登入後再試'); return false }

    const prev = logsRef.current[item.id]
    // The day's target is fixed by the snapshot once a log exists.
    const optimisticTarget = prev ? prev.target_count_snapshot : item.target_count
    const optimisticCount  = Math.max(0, Math.min(n, optimisticTarget))
    const now = new Date().toISOString()

    // Optimistic UI.
    const optimistic: DailyRhythmLog = {
      id:                    prev?.id ?? `optimistic-${item.id}`,
      user_id:               session.user.id,
      item_id:               item.id,
      date:                  today,
      completed_count:       optimisticCount,
      target_count_snapshot: prev ? prev.target_count_snapshot : item.target_count,
      unit_value_snapshot:   prev ? prev.unit_value_snapshot   : item.unit_value,
      created_at:            prev?.created_at ?? now,
      updated_at:            now,
    }
    setLogs(p => ({ ...p, [item.id]: optimistic }))

    try {
      // Fresh lookup to preserve id/created_at + existing snapshots (and to catch
      // a row the desktop may have written today).
      const { data: rows, error: selErr } = await supabase
        .from('daily_rhythm_logs')
        .select('id, created_at, target_count_snapshot, unit_value_snapshot')
        .eq('item_id', item.id).eq('date', today).limit(1)
      if (selErr) throw selErr
      const existing = rows?.[0] as
        | { id: string; created_at: string; target_count_snapshot: number; unit_value_snapshot: number }
        | undefined

      const targetForDay = existing ? existing.target_count_snapshot : item.target_count
      const row = {
        id:                    existing?.id ?? crypto.randomUUID(),
        user_id:               session.user.id,
        item_id:               item.id,
        date:                  today,
        completed_count:       Math.max(0, Math.min(n, targetForDay)),
        // Snapshots: only set on first creation; keep existing ones otherwise.
        target_count_snapshot: existing ? existing.target_count_snapshot : item.target_count,
        unit_value_snapshot:   existing ? existing.unit_value_snapshot   : item.unit_value,
        created_at:            existing?.created_at ?? now,
        updated_at:            now,
      }

      const { error } = await supabase
        .from('daily_rhythm_logs')
        .upsert(row, { onConflict: 'user_id,item_id,date' })
      if (error) throw error

      setLogs(p => ({ ...p, [item.id]: row as DailyRhythmLog }))
      return true
    } catch {
      // Roll back to the previous known log (or remove if there was none).
      setLogs(p => {
        const next = { ...p }
        if (prev) next[item.id] = prev
        else delete next[item.id]
        return next
      })
      setActionError(
        (await hasValidSession())
          ? '暫時無法儲存，請稍後再試'
          : '登入狀態已失效，請重新登入後再試'
      )
      return false
    }
  }, [today])

  return { items, logs, today, loading, actionError, setCount, reload: load }
}
