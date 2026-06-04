import { useCallback, useRef, useState } from 'react'

// Lightweight pull-to-refresh (no library). Attach the returned `scrollRef`
// (a callback ref, so it works even when the scroll container mounts only after
// loading) to the scrollable element, and render <PullIndicator> at its top.
//
// Design choices that keep it from clashing with existing gestures:
// - Only arms when the container is at the very top (scrollTop <= 0) and the
//   finger moves DOWN; otherwise native scrolling is untouched.
// - Uses touch events; long-press uses pointer events and is cancelled by the
//   finger movement, so the two never both fire.
// - preventDefault is called only while actively pulling at the top, so taps,
//   star/checkbox presses, and normal scrolling are unaffected.
// - Pair with `overscrollBehaviorY: 'contain'` on the container to suppress the
//   browser's own pull-to-refresh.
const THRESHOLD = 70   // px (after damping) needed to trigger a refresh

export function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const [pull, setPull]             = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const startY        = useRef<number | null>(null)
  const active        = useRef(false)
  const pullRef       = useRef(0)
  const refreshingRef = useRef(false)
  const onRefreshRef  = useRef(onRefresh)
  onRefreshRef.current = onRefresh
  const cleanupRef    = useRef<(() => void) | undefined>(undefined)

  const setPullBoth = (v: number) => { pullRef.current = v; setPull(v) }

  const scrollRef = useCallback((el: HTMLDivElement | null) => {
    cleanupRef.current?.()
    cleanupRef.current = undefined
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return
      if (el.scrollTop <= 0 && e.touches.length === 1) {
        startY.current = e.touches[0].clientY
        active.current = false
      } else {
        startY.current = null
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null || refreshingRef.current) return
      const dy = e.touches[0].clientY - startY.current
      // Moving up, or no longer at the top → let native scroll take over.
      if (dy <= 0 || el.scrollTop > 0) {
        if (active.current) { active.current = false; setPullBoth(0) }
        return
      }
      active.current = true
      e.preventDefault()                                   // take over the pull
      setPullBoth(Math.min(dy * 0.5, THRESHOLD * 1.5))     // damped
    }

    const onTouchEnd = async () => {
      if (startY.current === null) { return }
      startY.current = null
      if (!active.current) { setPullBoth(0); return }
      active.current = false
      if (pullRef.current >= THRESHOLD) {
        refreshingRef.current = true
        setRefreshing(true)
        setPullBoth(0)
        try { await onRefreshRef.current() }
        finally { refreshingRef.current = false; setRefreshing(false) }
      } else {
        setPullBoth(0)
      }
    }

    el.addEventListener('touchstart',  onTouchStart, { passive: true })
    el.addEventListener('touchmove',   onTouchMove,  { passive: false })
    el.addEventListener('touchend',    onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    cleanupRef.current = () => {
      el.removeEventListener('touchstart',  onTouchStart)
      el.removeEventListener('touchmove',   onTouchMove)
      el.removeEventListener('touchend',    onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  return { scrollRef, pull, refreshing }
}

// Spinner that lives in the gap revealed by the pull. Translate the page content
// down by the same amount (`refreshing ? 44 : pull`) so the spinner shows above it.
export function PullIndicator({ pull, refreshing }: { pull: number; refreshing: boolean }) {
  const h = refreshing ? 44 : pull
  if (h <= 0) return null
  const progress = Math.min(pull / THRESHOLD, 1)
  return (
    <div style={{
      position:'absolute', top:0, left:0, right:0, height:h,
      display:'flex', alignItems:'center', justifyContent:'center',
      pointerEvents:'none', zIndex:5,
      transition: pull > 0 ? 'none' : 'height .2s ease',
    }}>
      <div style={{
        width:24, height:24, borderRadius:'50%',
        border:'3px solid #4f6ef7', borderTopColor:'transparent',
        opacity: refreshing ? 1 : 0.4 + progress * 0.6,
        transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
        animation: refreshing ? 'spin 0.7s linear infinite' : undefined,
      }} />
    </div>
  )
}
