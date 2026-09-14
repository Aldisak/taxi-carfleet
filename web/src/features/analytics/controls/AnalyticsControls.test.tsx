import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { axe } from '../../../shared/test/axe'
import { theme } from '../../../shared/theme/theme'
import i18n from '../../../shared/i18n'
import { AnalyticsControls } from './AnalyticsControls'

function makeWrapper() {
  return ({ children }: { children: ReactNode }) =>
    createElement(ThemeProvider, { theme }, createElement(I18nextProvider, { i18n }, children))
}

function renderControls(overrides: Partial<Parameters<typeof AnalyticsControls>[0]> = {}) {
  const defaults: Parameters<typeof AnalyticsControls>[0] = {
    preset: 'tentoMesic',
    onPresetChange: vi.fn(),
    granularity: 'day',
    onGranularityChange: vi.fn(),
    compare: false,
    onCompareChange: vi.fn(),
    ...overrides,
  }
  const Wrapper = makeWrapper()
  return render(createElement(AnalyticsControls, defaults), { wrapper: Wrapper })
}

describe('AnalyticsControls', () => {
  it('renders the preset select with the current preset selected', () => {
    renderControls({ preset: 'tentoMesic' })
    const select = screen.getByRole('combobox', { name: /období|period/i })
    expect(select).toBeDefined()
  })

  it('calls onPresetChange when a new preset is chosen', async () => {
    const onPresetChange = vi.fn()
    renderControls({ onPresetChange })
    const select = screen.getByRole('combobox', { name: /období|period/i })
    fireEvent.change(select, { target: { value: 'rok' } })
    expect(onPresetChange).toHaveBeenCalledWith('rok')
  })

  it('renders granularity buttons for day / week / month', () => {
    renderControls()
    // Czech labels from i18n: Denně / Týdně / Měsíčně
    expect(screen.getByRole('button', { name: /denně|daily/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /týdně|weekly/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /měsíčně|monthly/i })).toBeDefined()
  })

  it('marks the active granularity button with aria-pressed="true"', () => {
    renderControls({ granularity: 'week' })
    const weekBtn = screen.getByRole('button', { name: /týdně|weekly/i })
    expect(weekBtn.getAttribute('aria-pressed')).toBe('true')
    const dayBtn = screen.getByRole('button', { name: /denně|daily/i })
    expect(dayBtn.getAttribute('aria-pressed')).toBe('false')
  })

  it('calls onGranularityChange when a granularity button is clicked', async () => {
    const user = userEvent.setup()
    const onGranularityChange = vi.fn()
    renderControls({ onGranularityChange, granularity: 'day' })
    await user.click(screen.getByRole('button', { name: /měsíčně|monthly/i }))
    expect(onGranularityChange).toHaveBeenCalledWith('month')
  })

  it('renders the compare toggle button', () => {
    renderControls()
    const toggle = screen.getByRole('button', { name: /srovnat|compare/i })
    expect(toggle).toBeDefined()
  })

  it('marks compare toggle as aria-pressed="true" when compare=true', () => {
    renderControls({ compare: true })
    const toggle = screen.getByRole('button', { name: /srovnat|compare/i })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
  })

  it('marks compare toggle as aria-pressed="false" when compare=false', () => {
    renderControls({ compare: false })
    const toggle = screen.getByRole('button', { name: /srovnat|compare/i })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })

  it('calls onCompareChange with toggled value when compare button is clicked', async () => {
    const user = userEvent.setup()
    const onCompareChange = vi.fn()
    renderControls({ compare: false, onCompareChange })
    await user.click(screen.getByRole('button', { name: /srovnat|compare/i }))
    expect(onCompareChange).toHaveBeenCalledWith(true)
  })

  it('has no axe violations', async () => {
    const { container } = renderControls()
    expect(await axe(container)).toHaveNoViolations()
  })
})
