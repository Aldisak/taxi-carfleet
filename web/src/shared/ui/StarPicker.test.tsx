import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/renderWithProviders'
import { axe } from '../test/axe'
import { StarPicker } from './StarPicker'

const starLabel = (n: number): string => `${n} hvězdiček`

describe('StarPicker', () => {
  it('renders five stars with accessible names from starLabel', () => {
    const { getAllByRole, getByRole } = renderWithProviders(
      <StarPicker value={0} onChange={() => {}} legend="Hodnocení" starLabel={starLabel} />,
    )
    expect(getAllByRole('radio')).toHaveLength(5)
    expect(getByRole('radio', { name: '4 hvězdiček' })).toBeInTheDocument()
  })

  it('sets the value to 4 when the fourth star is clicked', async () => {
    const onChange = vi.fn()
    const { getByRole } = renderWithProviders(
      <StarPicker value={0} onChange={onChange} legend="Hodnocení" starLabel={starLabel} />,
    )
    await userEvent.click(getByRole('radio', { name: '4 hvězdiček' }))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('reflects the current value as filled stars', () => {
    const { getByRole } = renderWithProviders(
      <StarPicker value={3} onChange={() => {}} legend="Hodnocení" starLabel={starLabel} />,
    )
    // The selected star carries radio semantics; stars up to value are visually filled.
    expect(getByRole('radio', { name: '3 hvězdiček' })).toHaveAttribute('aria-checked', 'true')
    const svgs = document.querySelectorAll('svg')
    const filled = Array.from(svgs).filter((s) => s.getAttribute('fill') === '#E6A700')
    expect(filled).toHaveLength(3)
  })

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(
      <StarPicker value={2} onChange={() => {}} legend="Hodnocení" starLabel={starLabel} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
