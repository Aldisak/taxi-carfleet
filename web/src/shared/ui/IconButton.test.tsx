import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/renderWithProviders'
import { axe } from '../test/axe'
import { IconButton } from './IconButton'

describe('IconButton', () => {
  it('exposes its accessible name from the label prop', () => {
    renderWithProviders(<IconButton icon={<svg aria-hidden="true" />} label="Zavolat" />)
    expect(screen.getByRole('button', { name: 'Zavolat' })).toBeInTheDocument()
  })

  it('fires onClick when clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    renderWithProviders(
      <IconButton icon={<svg aria-hidden="true" />} label="Zavolat" onClick={onClick} />,
    )

    await user.click(screen.getByRole('button', { name: 'Zavolat' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(
      <IconButton icon={<svg aria-hidden="true" />} label="Zavolat" />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
