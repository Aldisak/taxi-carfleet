import type { ListOrdersRequest } from '../../shared/api/client'

/** The UI filter state managed by SearchFilters. */
export interface OrderFilterState {
  /** Status multi-select. Empty array or undefined = all statuses. */
  status?: string[]
  /** Driver ID filter. Empty string or undefined = no filter. */
  driverId?: string
  /** Free text (code / phone / name). Empty or undefined = no filter. */
  search?: string
  /** Local date string YYYY-MM-DD for the from bound. Defaults to today. */
  from?: string
  /** Local date string YYYY-MM-DD for the to bound. Defaults to today. */
  to?: string
  /** 1-based page number. Defaults to 1. */
  page?: number
  /** Items per page. Defaults to 50. */
  pageSize?: number
}

/** Returns YYYY-MM-DD for the local calendar date of the given Date (or today). */
function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Converts a local date string to start-of-day ISO timestamp. */
function toFromTimestamp(localDate: string): string {
  // Parse the YYYY-MM-DD into local components
  const [y, m, d] = localDate.split('-').map(Number)
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0)
  return dt.toISOString()
}

/** Converts a local date string to end-of-day ISO timestamp (start of next local day exclusive). */
function toToTimestamp(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number)
  // End of day = start of next day (exclusive upper bound)
  const dt = new Date(y, m - 1, d + 1, 0, 0, 0, 0)
  return dt.toISOString()
}

/**
 * Converts the UI filter state into the GET /orders query parameters.
 * The default date range is today (local day).
 */
export function buildOrdersParams(state: OrderFilterState): ListOrdersRequest {
  const today = localDateString()

  const fromDate = state.from ?? today
  const toDate = state.to ?? today

  const params: ListOrdersRequest = {
    from: toFromTimestamp(fromDate),
    to: toToTimestamp(toDate),
    page: state.page ?? 1,
    pageSize: state.pageSize ?? 50,
  }

  if (state.status && state.status.length > 0) {
    params.status = state.status
  }

  if (state.driverId && state.driverId.length > 0) {
    params.driverId = state.driverId
  }

  if (state.search && state.search.length > 0) {
    params.search = state.search
  }

  return params
}
