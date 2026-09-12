import { useEffect, useState } from 'react'
import type { OrderDetailDto } from '../../../shared/api/client'
import { useActiveOrderStore } from './useActiveOrderStore'
import { computeNoShow } from './noShowTimer'

/** Combined active-ride view: the order plus the live no-show timer state. */
export interface UseActiveOrderResult {
  order: OrderDetailDto | null
  arrivedAt: string | null
  /** True once >= 5 min have elapsed since arrivedAt (no-show cancel allowed). */
  noShowEnabled: boolean
  /** Seconds remaining until no-show is enabled, or null when arrivedAt is unknown. */
  noShowCountdownSeconds: number | null
}

/**
 * Hook: exposes the active order and a ticking no-show timer.
 * Re-renders once per second while an Arrived order has a known arrivedAt so the
 * countdown and the enablement flag stay current.
 */
export function useActiveOrder(): UseActiveOrderResult {
  const order = useActiveOrderStore(s => s.order)
  const arrivedAt = useActiveOrderStore(s => s.arrivedAt)
  const [, setTick] = useState(0)

  const ticking = !!arrivedAt && order?.status === 'Arrived'

  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [ticking])

  if (!arrivedAt) {
    return { order, arrivedAt, noShowEnabled: false, noShowCountdownSeconds: null }
  }

  const { enabled, remainingSeconds } = computeNoShow(arrivedAt, new Date())
  return {
    order,
    arrivedAt,
    noShowEnabled: enabled,
    noShowCountdownSeconds: remainingSeconds,
  }
}
