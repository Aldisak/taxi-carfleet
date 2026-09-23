import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/renderWithProviders'
import { axe } from '../test/axe'
import { Chip } from './Chip'

describe('Chip', () => {
  it('reflects selection through aria-pressed', () => {
    const { rerender } = renderWithProviders(<Chip selected={false}>Hotově</Chip>)
    expect(screen.getByRole('button', { name: 'Hotově' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    rerender(<Chip selected>Hotově</Chip>)
    expect(screen.getByRole('button', { name: 'Hotově' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('fires onClick when clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    renderWithProviders(<Chip onClick={onClick}>Hotově</Chip>)

    await user.click(screen.getByRole('button', { name: 'Hotově' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<Chip selected>Hotově</Chip>)
    expect(await axe(container)).toHaveNoViolations()
  })
})
