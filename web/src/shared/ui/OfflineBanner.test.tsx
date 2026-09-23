import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import { axe } from '../test/axe'
import { OfflineBanner } from './OfflineBanner'

describe('OfflineBanner', () => {
  it('renders its message', () => {
    renderWithProviders(<OfflineBanner>Jste offline</OfflineBanner>)
    expect(screen.getByText('Jste offline')).toBeInTheDocument()
  })

  it('has the alert role for assertive announcement', () => {
    renderWithProviders(<OfflineBanner>Bez připojení</OfflineBanner>)
    expect(screen.getByRole('alert')).toHaveTextContent('Bez připojení')
  })

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(
      <OfflineBanner>Připojení ztraceno – zobrazujeme poslední známý stav</OfflineBanner>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
