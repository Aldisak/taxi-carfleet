import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { theme } from '../shared/theme/theme'
import i18n from '../shared/i18n'
import { axe } from '../shared/test/axe'
import { AppHeader, type AppHeaderProps } from './AppHeader'

function makeWrapper() {
  return ({ children }: { children: ReactNode }) =>
    createElement(
      MemoryRouter,
      null,
      createElement(ThemeProvider, { theme }, createElement(I18nextProvider, { i18n }, children)),
    )
}

const navItems = [
  { to: '/dispatcher', label: 'Dispečink' },
  { to: '/dispatcher/orders', label: 'Objednávky' },
]

function baseProps(overrides: Partial<AppHeaderProps> = {}): AppHeaderProps {
  return {
    navItems,
    brand: { name: 'Taxi Praha', colorHex: '#ff0000' },
    connection: 'connected',
    isMuted: false,
    onToggleMute: vi.fn(),
    resolvedTheme: 'light',
    onToggleTheme: vi.fn(),
    onLogout: vi.fn(),
    roleLabel: 'Dispatcher',
    ...overrides,
  }
}

function renderHeader(props: Partial<AppHeaderProps> = {}) {
  return render(createElement(AppHeader, baseProps(props)), { wrapper: makeWrapper() })
}

describe('AppHeader', () => {
  it('renders nav items as links', () => {
    renderHeader()
    expect(screen.getByRole('link', { name: 'Dispečink' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Objednávky' })).toBeInTheDocument()
  })

  it('renders the brand name', () => {
    renderHeader({ brand: { name: 'Taxi Praha', colorHex: '#ff0000' } })
    expect(screen.getByText('Taxi Praha')).toBeInTheDocument()
  })

  it('shows the connection status and mute toggle when branded', () => {
    renderHeader()
    expect(screen.getByText('Připojeno')).toBeInTheDocument()
    expect(screen.getByTestId('mute-toggle')).toBeInTheDocument()
  })

  it('hides the connection status and mute toggle when unbranded', () => {
    renderHeader({ unbranded: true })
    expect(screen.queryByText('Připojeno')).toBeNull()
    expect(screen.queryByTestId('mute-toggle')).toBeNull()
  })

  it('exposes the mute toggle with aria-pressed reflecting mute state', () => {
    renderHeader({ isMuted: true })
    const button = screen.getByTestId('mute-toggle')
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveAccessibleName('Zapnout zvuk')
  })

  it('renders the theme toggle', () => {
    renderHeader()
    expect(screen.getByRole('button', { name: 'Přepnout vzhled' })).toBeInTheDocument()
  })

  it('renders the logout button', () => {
    renderHeader()
    expect(screen.getByRole('button', { name: 'Odhlásit se' })).toBeInTheDocument()
  })

  it('has no axe violations (branded)', async () => {
    const { container } = renderHeader()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations (unbranded)', async () => {
    const { container } = renderHeader({ unbranded: true })
    expect(await axe(container)).toHaveNoViolations()
  })
})
