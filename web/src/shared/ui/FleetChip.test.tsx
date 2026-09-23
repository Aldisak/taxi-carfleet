import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/renderWithProviders'
import { axe } from '../test/axe'
import { FleetChip } from './FleetChip'

describe('FleetChip', () => {
  it('renders the fleet name', () => {
    renderWithProviders(<FleetChip name="Taxi Kutná Hora" />)
    expect(screen.getByText('Taxi Kutná Hora')).toBeInTheDocument()
  })

  it('shows derived initials when no logo is given', () => {
    renderWithProviders(<FleetChip name="Taxi Praha" />)
    expect(screen.getByText('TP')).toBeInTheDocument()
  })

  it('shows explicit initials over the derived ones', () => {
    renderWithProviders(<FleetChip name="Taxi Praha" initials="XY" />)
    expect(screen.getByText('XY')).toBeInTheDocument()
    expect(screen.queryByText('TP')).not.toBeInTheDocument()
  })

  it('shows a decorative logo image when logoUrl is set', () => {
    renderWithProviders(<FleetChip name="Taxi Praha" logoUrl="/logo.png" />)
    const img = document.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', '/logo.png')
    expect(img).toHaveAttribute('alt', '')
    expect(screen.queryByText('TP')).not.toBeInTheDocument()
  })

  it('renders as a button with the name as accessible name and fires onClick', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    renderWithProviders(<FleetChip name="Taxi Praha" onClick={onClick} />)

    const button = screen.getByRole('button', { name: 'Taxi Praha' })
    await user.click(button)

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('has no axe violations in the clickable variant', async () => {
    const { container } = renderWithProviders(<FleetChip name="Taxi Praha" onClick={() => {}} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
