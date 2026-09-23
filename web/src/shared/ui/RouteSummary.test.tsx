import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import { RouteSummary } from './RouteSummary'

describe('RouteSummary', () => {
  it('renders the pickup, dropoff and meta', () => {
    renderWithProviders(
      <RouteSummary
        pickup="Nádražní 1, Kutná Hora"
        dropoff="Centrum Kutná Hora"
        meta="Hned · 1 cestující · 100 Kč"
      />,
    )
    expect(screen.getByText('Nádražní 1, Kutná Hora')).toBeInTheDocument()
    expect(screen.getByText('Centrum Kutná Hora')).toBeInTheDocument()
    expect(screen.getByText('Hned · 1 cestující · 100 Kč')).toBeInTheDocument()
  })

  it('renders the action slot', () => {
    renderWithProviders(
      <RouteSummary
        pickup="Nádražní 1"
        dropoff="Centrum"
        action={<button type="button">Upravit</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Upravit' })).toBeInTheDocument()
  })

  it('marks the pickup/dropoff markers as decorative (aria-hidden)', () => {
    const { container } = renderWithProviders(
      <RouteSummary pickup="Nádražní 1" dropoff="Centrum" />,
    )
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })
})
