import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/renderWithProviders'
import { axe } from '../test/axe'
import { Segmented } from './Segmented'

const OPTIONS = [
  { value: 'now', label: 'Hned' },
  { value: 'scheduled', label: 'Na čas' },
]

describe('Segmented', () => {
  it('renders every option as a button', () => {
    const { getByRole } = renderWithProviders(
      <Segmented options={OPTIONS} value="now" onChange={() => {}} ariaLabel="Kdy" />,
    )
    expect(getByRole('button', { name: 'Hned' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'Na čas' })).toBeInTheDocument()
  })

  it('marks the selected option with aria-pressed=true', () => {
    const { getByRole } = renderWithProviders(
      <Segmented options={OPTIONS} value="scheduled" onChange={() => {}} ariaLabel="Kdy" />,
    )
    expect(getByRole('button', { name: 'Na čas' })).toHaveAttribute('aria-pressed', 'true')
    expect(getByRole('button', { name: 'Hned' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('fires onChange with the clicked value', async () => {
    const onChange = vi.fn()
    const { getByRole } = renderWithProviders(
      <Segmented options={OPTIONS} value="now" onChange={onChange} ariaLabel="Kdy" />,
    )
    await userEvent.click(getByRole('button', { name: 'Na čas' }))
    expect(onChange).toHaveBeenCalledWith('scheduled')
  })

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(
      <Segmented options={OPTIONS} value="now" onChange={() => {}} ariaLabel="Kdy" />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
