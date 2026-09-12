import { describe, expect, it } from 'vitest'
import { buildOrdersParams, type OrderFilterState } from './orderFilters'

describe('buildOrdersParams', () => {
  // Fixed reference date: 2026-09-12 (local time)
  // We'll use vi.setSystemTime in the local-today test

  it('builds params with no filters (empty object yields defaults)', () => {
    const state: OrderFilterState = {}
    const params = buildOrdersParams(state)
    // no status, no driverId, no search, defaults page 1 / pageSize 50
    expect(params.status).toBeUndefined()
    expect(params.driverId).toBeUndefined()
    expect(params.search).toBeUndefined()
    expect(params.page).toBe(1)
    expect(params.pageSize).toBe(50)
  })

  it('maps single status to status array', () => {
    const state: OrderFilterState = { status: ['New'] }
    const params = buildOrdersParams(state)
    expect(params.status).toEqual(['New'])
  })

  it('maps multiple statuses to repeated status array', () => {
    const state: OrderFilterState = { status: ['New', 'Assigned', 'InProgress'] }
    const params = buildOrdersParams(state)
    expect(params.status).toEqual(['New', 'Assigned', 'InProgress'])
  })

  it('maps driverId filter', () => {
    const state: OrderFilterState = { driverId: 'abc-123' }
    const params = buildOrdersParams(state)
    expect(params.driverId).toBe('abc-123')
  })

  it('maps free-text search', () => {
    const state: OrderFilterState = { search: 'Novák' }
    const params = buildOrdersParams(state)
    expect(params.search).toBe('Novák')
  })

  it('maps date range: from/to represent start/end of specified local day', () => {
    // The important invariant: from timestamp < to timestamp, and from is the start of the day
    const state: OrderFilterState = { from: '2026-09-12', to: '2026-09-12' }
    const params = buildOrdersParams(state)
    // from should be parseable as an ISO timestamp
    const fromDate = new Date(params.from!)
    const toDate = new Date(params.to!)
    // from is start of local day 2026-09-12
    expect(fromDate.getFullYear()).toBe(2026)
    expect(fromDate.getMonth()).toBe(8) // September = 8
    expect(fromDate.getDate()).toBe(12)
    expect(fromDate.getHours()).toBe(0)
    expect(fromDate.getMinutes()).toBe(0)
    // to is start of next local day (exclusive upper bound)
    expect(toDate.getFullYear()).toBe(2026)
    expect(toDate.getMonth()).toBe(8)
    expect(toDate.getDate()).toBe(13) // day after
    expect(toDate.getHours()).toBe(0)
    expect(toDate.getMinutes()).toBe(0)
  })

  it('uses today as default date range when no dates provided (local day)', () => {
    const state: OrderFilterState = {}
    const params = buildOrdersParams(state)

    // Should include from/to set to today
    expect(params.from).toBeDefined()
    expect(params.to).toBeDefined()

    // from should be today's local midnight
    const fromDate = new Date(params.from!)
    const today = new Date()
    expect(fromDate.getFullYear()).toBe(today.getFullYear())
    expect(fromDate.getMonth()).toBe(today.getMonth())
    expect(fromDate.getDate()).toBe(today.getDate())
    expect(fromDate.getHours()).toBe(0)

    // to should be start of next local day
    const toDate = new Date(params.to!)
    expect(toDate > fromDate).toBe(true)
  })

  it('maps page and pageSize', () => {
    const state: OrderFilterState = { page: 3, pageSize: 25 }
    const params = buildOrdersParams(state)
    expect(params.page).toBe(3)
    expect(params.pageSize).toBe(25)
  })

  it('omits undefined/empty filters from params', () => {
    const state: OrderFilterState = { status: [], driverId: '', search: '' }
    const params = buildOrdersParams(state)
    expect(params.status).toBeUndefined()
    expect(params.driverId).toBeUndefined()
    expect(params.search).toBeUndefined()
  })
})
