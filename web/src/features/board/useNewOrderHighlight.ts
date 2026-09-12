import { useEffect } from 'react'
import { useNewOrderHighlightStore } from './useCreateOrder'

const HIGHLIGHT_DURATION_MS = 3000

/**
 * Returns true when the given orderId is the "just created" order
 * and the 3-second highlight window has not yet expired.
 *
 * Automatically clears the highlight store entry after the window expires.
 */
export function useNewOrderHighlight(orderId: string): boolean {
  const highlight = useNewOrderHighlightStore(s => s.highlight)
  const setHighlight = useNewOrderHighlightStore(s => s.setHighlight)

  const isActive = highlight?.orderId === orderId

  useEffect(() => {
    if (!isActive || !highlight) return

    const remaining = HIGHLIGHT_DURATION_MS - (Date.now() - highlight.createdAt)
    if (remaining <= 0) {
      setHighlight(null)
      return
    }

    const timer = setTimeout(() => {
      setHighlight(null)
    }, remaining)

    return () => clearTimeout(timer)
  }, [isActive, highlight, setHighlight])

  return isActive
}
