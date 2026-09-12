import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'

vi.mock('../settings/driverSettings', () => ({
  getNavAppPreference: vi.fn(() => 'google'),
}))

import { getNavAppPreference } from '../settings/driverSettings'
import { NavHandoff } from './NavHandoff'

const mockPref = vi.mocked(getNavAppPreference)

function renderHandoff(props: { lat: number; lng: number; label?: string }) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider theme={theme}>
        <NavHandoff {...props} labelKey="driver.ride.navigate" />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

describe('NavHandoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPref.mockReturnValue('google')
  })

  it('renders a link to the preferred nav app with destination coords', () => {
    renderHandoff({ lat: 50.0755, lng: 14.4378, label: 'Praha' })
    const link = screen.getByRole('link', { name: 'Navigovat' })
    expect(link).toHaveAttribute('href', expect.stringContaining('google.com/maps'))
    expect(link.getAttribute('href')).toContain('50.0755,14.4378')
  })

  it('honours the waze preference', () => {
    mockPref.mockReturnValue('waze')
    renderHandoff({ lat: 50.0755, lng: 14.4378 })
    expect(screen.getByRole('link', { name: 'Navigovat' })).toHaveAttribute(
      'href',
      expect.stringContaining('waze.com'),
    )
  })

  it('opens in a new tab safely', () => {
    renderHandoff({ lat: 50, lng: 14 })
    const link = screen.getByRole('link', { name: 'Navigovat' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('is keyboard reachable as a link', async () => {
    renderHandoff({ lat: 50, lng: 14 })
    await userEvent.tab()
    expect(screen.getByRole('link', { name: 'Navigovat' })).toHaveFocus()
  })

  it('has no axe violations', async () => {
    const { container } = renderHandoff({ lat: 50, lng: 14, label: 'Praha' })
    expect(await axe(container)).toHaveNoViolations()
  })
})
