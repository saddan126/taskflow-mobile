import { useRef } from 'react'

// Long-press for list rows. Fires `onLongPress` after `ms` of holding without
// moving; a pointer move beyond a small threshold (i.e. a scroll) cancels it.
// Spread the returned handlers on the row element. Because a long-press is
// followed by a click, `onClickCapture` swallows that click so the row's normal
// tap action (e.g. navigation) does not also fire.
export function useLongPress(onLongPress: () => void, ms = 500) {
  const timer    = useRef<number | undefined>(undefined)
  const startPos = useRef<{ x: number; y: number } | null>(null)
  const fired    = useRef(false)

  const clear = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = undefined }
    startPos.current = null
  }

  const onPointerDown = (e: React.PointerEvent) => {
    fired.current = false
    startPos.current = { x: e.clientX, y: e.clientY }
    timer.current = window.setTimeout(() => {
      fired.current = true
      clear()
      onLongPress()
    }, ms)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!startPos.current) return
    const dx = Math.abs(e.clientX - startPos.current.x)
    const dy = Math.abs(e.clientY - startPos.current.y)
    if (dx > 10 || dy > 10) clear()   // moved → treat as scroll, cancel
  }

  const onPointerUp     = () => clear()
  const onPointerLeave  = () => clear()
  const onPointerCancel = () => clear()

  const onClickCapture = (e: React.MouseEvent) => {
    if (fired.current) {
      e.preventDefault()
      e.stopPropagation()
      fired.current = false
    }
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onPointerCancel, onClickCapture }
}
