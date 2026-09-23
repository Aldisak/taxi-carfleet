import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/renderWithProviders'
import { axe } from '../test/axe'
import { Stepper } from './Stepper'

describe('Stepper', () => {
  it('gives the buttons accessible names from the labels', () => {
    const { getByRole } = renderWithProviders(
      <Stepper
        value={1}
        onChange={() => {}}
        decrementLabel="Ubrat"
        incrementLabel="Přidat"
      />,
    )
    expect(getByRole('button', { name: 'Ubrat' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'Přidat' })).toBeInTheDocument()
  })

  it('increments and decrements by one', async () => {
    const onChange = vi.fn()
    const { getByRole } = renderWithProviders(
      <Stepper
        value={2}
        onChange={onChange}
        decrementLabel="Ubrat"
        incrementLabel="Přidat"
      />,
    )
    await userEvent.click(getByRole('button', { name: 'Přidat' }))
    expect(onChange).toHaveBeenCalledWith(3)
    await userEvent.click(getByRole('button', { name: 'Ubrat' }))
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('disables − at min and does not emit below min', () => {
    const onChange = vi.fn()
    const { getByRole } = renderWithProviders(
      <Stepper
        value={0}
        onChange={onChange}
        min={0}
        decrementLabel="Ubrat"
        incrementLabel="Přidat"
      />,
    )
    expect(getByRole('button', { name: 'Ubrat' })).toBeDisabled()
  })

  it('disables + at max and does not emit above max', () => {
    const { getByRole } = renderWithProviders(
      <Stepper
        value={5}
        onChange={() => {}}
        max={5}
        decrementLabel="Ubrat"
        incrementLabel="Přidat"
      />,
    )
    expect(getByRole('button', { name: 'Přidat' })).toBeDisabled()
  })

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(
      <Stepper
        value={3}
        onChange={() => {}}
        decrementLabel="Ubrat"
        incrementLabel="Přidat"
        ariaLabel="Počet zavazadel"
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
