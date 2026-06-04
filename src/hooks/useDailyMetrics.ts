import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getDailyDateKey, hasValidSession } from './useTasks'

// daily_metrics is read-only on mobile (definitions are managed on desktop).
export interface DailyMetric {
  id:         string
  user_id:    string
  name:       string
  unit:       string | null
  type:       'number' | 'text'
  sort_order: number
  is_active:  number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface DailyMetricLog {
  id:           string
  user_id:      string
  metric_id:    string
  date:         string          // 'YYYY-MM-DD' (getDailyDateKey)
  value_number: number | null
  value_text:   string | null
  created_at:   string
  updated_at:   string
}

export function useDailyMetrics() {
  // "Today" must use the shared key (local time + 4am reset) to align with desktop.
  const today = getDailyDateKey()

  const [metrics, setMetrics] = useState<DailyMetric[]>([])
  const [logs,    setLogs]    = useState<Record<string, DailyMetricLog>>({})  // metric_id → today's log
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: m, error: mErr }, { data: l, error: lErr }] = await Promise.all([
        supabase.from('daily_metrics').select('*')
          .eq('is_active', 1).is('deleted_at', null).order('sort_order'),
        supabase.from('daily_metric_logs').select('*').eq('date', today),
      ])
      if (mErr) throw mErr
      if (lErr) throw lErr
      setMetrics((m ?? []) as DailyMetric[])
      const map: Record<string, DailyMetricLog> = {}
      for (const row of (l ?? []) as DailyMetricLog[]) map[row.metric_id] = row
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

  // Auto-dismiss the toast.
  useEffect(() => {
    if (!actionError) return
    const t = setTimeout(() => setActionError(null), 3500)
    return () => clearTimeout(t)
  }, [actionError])

  // Write today's value for a metric. Keyed on (metric_id, date) so we OVERWRITE
  // any existing row for today — including one the desktop wrote — rather than
  // creating a second row. We look the row up first to preserve its id/created_at
  // (sync matches by id, so the PK must not change). Number type → value_number;
  // text type → value_text; the other column stays null.
  const saveValue = useCallback(async (metric: DailyMetric, raw: string): Promise<boolean> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setActionError('登入狀態已失效，請重新登入後再試'); return false }

    const isNum   = metric.type === 'number'
    const trimmed = raw.trim()
    let value_number: number | null = null
    let value_text:   string | null = null
    if (isNum) {
      if (trimmed !== '') {
        const n = Number(trimmed)
        if (Number.isNaN(n)) { setActionError('請輸入有效的數字'); return false }
        value_number = n
      }
    } else {
      value_text = trimmed === '' ? null : raw
    }

    const now = new Date().toISOString()
    try {
      // Preserve id/created_at of an existing (metric_id, date) row if present.
      const { data: rows, error: selErr } = await supabase
        .from('daily_metric_logs').select('id, created_at')
        .eq('metric_id', metric.id).eq('date', today).limit(1)
      if (selErr) throw selErr
      const existing = rows?.[0] as { id: string; created_at: string } | undefined

      const row = {
        id:           existing?.id ?? crypto.randomUUID(),
        user_id:      session.user.id,
        metric_id:    metric.id,
        date:         today,
        value_number,
        value_text,
        created_at:   existing?.created_at ?? now,
        updated_at:   now,
      }

      const { error } = await supabase
        .from('daily_metric_logs')
        .upsert(row, { onConflict: 'metric_id,date' })
      if (error) throw error

      setLogs(prev => ({ ...prev, [metric.id]: row as DailyMetricLog }))
      return true
    } catch {
      setActionError(
        (await hasValidSession())
          ? '暫時無法儲存，請稍後再試'
          : '登入狀態已失效，請重新登入後再試'
      )
      return false
    }
  }, [today])

  return { metrics, logs, today, loading, actionError, saveValue, reload: load }
}
