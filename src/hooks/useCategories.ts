import { useEffect, useState } from 'react'
import { supabase, type Category } from '../lib/supabase'

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('categories')
      .select('*')
      .is('deleted_at', null)
      .order('sort_order')
      .then(({ data }) => {
        if (!cancelled && data) setCategories(data)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  return { categories, loading }
}
