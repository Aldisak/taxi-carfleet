import { describe, it, expect } from 'vitest'
import { isOrderEditable } from './isOrderEditable'

describe('isOrderEditable — editable only in New and Assigned', () => {
  it('New order is editable', () => {
    expect(isOrderEditable('New')).toBe(true)
  })

  it('Assigned order is editable', () => {
    expect(isOrderEditable('Assigned')).toBe(true)
  })

  it('Accepted order is NOT editable', () => {
    expect(isOrderEditable('Accepted')).toBe(false)
  })

  it('Arrived order is NOT editable', () => {
    expect(isOrderEditable('Arrived')).toBe(false)
  })

  it('InProgress order is NOT editable', () => {
    expect(isOrderEditable('InProgress')).toBe(false)
  })

  it('Completed order is NOT editable', () => {
    expect(isOrderEditable('Completed')).toBe(false)
  })

  it('Cancelled order is NOT editable', () => {
    expect(isOrderEditable('Cancelled')).toBe(false)
  })
})
