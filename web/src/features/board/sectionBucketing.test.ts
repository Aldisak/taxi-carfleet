import { describe, it, expect } from 'vitest'
import { bucketOrder, OrderSection } from './sectionBucketing'
import type { OrderSummaryDto } from '../../shared/api/client'

// ---------------------------------------------------------------------------
// TZ-safe fixture construction
//
// All reference times are constructed via `new Date(year, month, day, hour)`
// so that year/month/day are LOCAL calendar components — the test passes in any
// runner timezone.  Avoid UTC ISO strings like '2026-09-11T10:00:00.000Z' for
// the `now` argument because their local-date interpretation varies by TZ offset.
//
// For `scheduledAt` / `createdAt` (stored as ISO strings from the server), we
// construct via local components and call `.toISOString()` — that way the value
// is unambiguous when `new Date(order.scheduledAt)` is later parsed inside the
// bucketing logic (also local-component based).
// ---------------------------------------------------------------------------

// Reference "now": local 2026-09-11 10:00 (any TZ)
const REF_NOW = new Date(2026, 8, 11, 10, 0, 0)  // month is 0-indexed

// Scheduled at local 14:00 on the SAME day
const TODAY_SCHEDULED   = new Date(2026, 8, 11, 14, 0, 0).toISOString()
// Scheduled at local 09:00 on the NEXT day
const TOMORROW_SCHEDULED = new Date(2026, 8, 12,  9, 0, 0).toISOString()
// Scheduled at local 08:00 SAME day but already past
const PAST_TODAY        = new Date(2026, 8, 11,  8, 0, 0).toISOString()
// Scheduled at local 09:00 TWO days after REF_NOW
const DAY_AFTER         = new Date(2026, 8, 13,  9, 0, 0).toISOString()
// Created yesterday (local)
const YESTERDAY         = new Date(2026, 8, 10, 20, 0, 0).toISOString()

function makeOrder(overrides: Partial<OrderSummaryDto> & { status: string }): OrderSummaryDto {
  return {
    id: 'order-id-1',
    publicCode: 'ABC123',
    source: 'Phone',
    customerPhone: '+420777123456',
    customerName: null,
    pickupAddress: 'Nádraží Kolín',
    dropoffAddress: null,
    scheduledAt: null,
    passengers: 1,
    priceType: 'Meter',
    estimatedPriceCzk: null,
    fixedPriceCzk: null,
    driverId: null,
    createdAt: new Date(2026, 8, 11, 9, 0, 0).toISOString(),
    ...overrides,
  }
}

describe('bucketOrder — section assignment by status', () => {
  it('New ASAP order → Nové section', () => {
    const order = makeOrder({ status: 'New', scheduledAt: null })
    expect(bucketOrder(order, REF_NOW)).toBe(OrderSection.Nove)
  })

  it('New order with scheduledAt today → Naplánované section', () => {
    const order = makeOrder({ status: 'New', scheduledAt: TODAY_SCHEDULED })
    expect(bucketOrder(order, REF_NOW)).toBe(OrderSection.Naplanovane)
  })

  it('New order with scheduledAt tomorrow → Naplánované section', () => {
    const order = makeOrder({ status: 'New', scheduledAt: TOMORROW_SCHEDULED })
    expect(bucketOrder(order, REF_NOW)).toBe(OrderSection.Naplanovane)
  })

  it('New order with scheduledAt day after tomorrow → null (not shown)', () => {
    const order = makeOrder({ status: 'New', scheduledAt: DAY_AFTER })
    expect(bucketOrder(order, REF_NOW)).toBeNull()
  })

  it('Assigned ASAP order → Přiřazené section', () => {
    const order = makeOrder({ status: 'Assigned', scheduledAt: null })
    expect(bucketOrder(order, REF_NOW)).toBe(OrderSection.Prirazene)
  })

  it('Assigned order with scheduledAt today → Naplánované section', () => {
    const order = makeOrder({ status: 'Assigned', scheduledAt: TODAY_SCHEDULED })
    expect(bucketOrder(order, REF_NOW)).toBe(OrderSection.Naplanovane)
  })

  it('Accepted order → Probíhající section', () => {
    const order = makeOrder({ status: 'Accepted' })
    expect(bucketOrder(order, REF_NOW)).toBe(OrderSection.Probihajici)
  })

  it('Arrived order → Probíhající section', () => {
    const order = makeOrder({ status: 'Arrived' })
    expect(bucketOrder(order, REF_NOW)).toBe(OrderSection.Probihajici)
  })

  it('InProgress order → Probíhající section', () => {
    const order = makeOrder({ status: 'InProgress' })
    expect(bucketOrder(order, REF_NOW)).toBe(OrderSection.Probihajici)
  })

  it('Completed order created today → Dokončené dnes section', () => {
    const order = makeOrder({ status: 'Completed', createdAt: PAST_TODAY })
    expect(bucketOrder(order, REF_NOW)).toBe(OrderSection.DokonceneDnes)
  })

  it('Completed order created yesterday → null (not shown)', () => {
    const order = makeOrder({ status: 'Completed', createdAt: YESTERDAY })
    expect(bucketOrder(order, REF_NOW)).toBeNull()
  })

  it('Cancelled order → null (not shown on board)', () => {
    const order = makeOrder({ status: 'Cancelled' })
    expect(bucketOrder(order, REF_NOW)).toBeNull()
  })

  it('Scheduled today: Assigned order with past scheduledAt but today → Naplánované', () => {
    // scheduledAt was in the past but still same calendar day
    const order = makeOrder({ status: 'Assigned', scheduledAt: PAST_TODAY })
    expect(bucketOrder(order, REF_NOW)).toBe(OrderSection.Naplanovane)
  })
})

describe('bucketOrder — local-midnight boundary (F5)', () => {
  // now = local 23:30 on Sep 11; scheduledAt = local 00:30 on Sep 12
  // In UTC+2 (Europe/Prague summer): now = 21:30Z Sep 11, scheduled = 22:30Z Sep 11
  // → UTC date of both is Sep 11, so UTC-based code would bucket scheduledAt as TODAY.
  // Local date of `now` = Sep 11, local date of scheduledAt = Sep 12 = TOMORROW.
  // The correct answer is Naplánované (tomorrow is still within the 2-day window).
  // This test verifies the local-calendar implementation returns Naplánované regardless of TZ.
  it('order scheduled just after local midnight (tomorrow) → Naplánované', () => {
    const nowLocalLate = new Date(2026, 8, 11, 23, 30, 0)       // Sep 11 23:30 local
    const scheduledTomorrow = new Date(2026, 8, 12, 0, 30, 0).toISOString() // Sep 12 00:30 local
    const order = makeOrder({ status: 'New', scheduledAt: scheduledTomorrow })
    expect(bucketOrder(order, nowLocalLate)).toBe(OrderSection.Naplanovane)
  })

  // now = local 00:10 Sep 12; scheduledAt = local Sep 11 23:50 (yesterday local)
  // In UTC+2: now = 22:10Z Sep 11, scheduled = 21:50Z Sep 11
  // → UTC-based: both are Sep 11 → scheduledAt is "today". Local: sep 11 < sep 12 → yesterday.
  // Correct (local) result: scheduled date < today → null (beyond today/tomorrow window).
  it('order scheduled local midnight cross: was yesterday local → null', () => {
    const nowLocalEarly = new Date(2026, 8, 12, 0, 10, 0)      // Sep 12 00:10 local
    const scheduledYesterday = new Date(2026, 8, 11, 23, 50, 0).toISOString() // Sep 11 23:50 local
    const order = makeOrder({ status: 'New', scheduledAt: scheduledYesterday })
    // Sep 11 < today (Sep 12) and !== tomorrow (Sep 13) → null
    expect(bucketOrder(order, nowLocalEarly)).toBeNull()
  })
})
