import { useState, useEffect } from 'react'

/**
 * Returns a debounced copy of `value` that only updates
 * after `delayMs` milliseconds have elapsed since the last change.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value)

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(value)
    }, delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])

  return debounced
}
