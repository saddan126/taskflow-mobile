import { useCallback, useEffect, useState } from 'react'
import { supabase, type MaintenanceItem } from '../lib/supabase'
import { hasValidSession } from './useTasks'

// Read-only on mobile (Phase 1.5-B): lists active maintenance items due soonest
// first. No insert/update/delete — item management stays on desktop for now.
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

  return { items, loading, error, reload: load }
}
