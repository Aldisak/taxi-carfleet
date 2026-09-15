import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { theme } from '../../../shared/theme/theme'
import i18n from '../../../shared/i18n'
import { axe } from '../../../shared/test/axe'
import type { GeoUsageResponse } from '../../../shared/api/client'

vi.mock('../../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/api/client')>()
  return { ...actual, getGeoUsage: vi.fn() }
})

import * as client from '../../../shared/api/client'
import { GeoUsagePanel } from './GeoUsagePanel'

const USAGE: GeoUsageResponse = {
  creditsUsedThisMonth: 40000,
  creditBudget: 250000,
  usagePercent: 16,
  year: 2026,
  month: 9,
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ThemeProvider, { theme }, createElement(I18nextProvider, { i18n }, children)),
    )
  return render(createElement(GeoUsagePanel), { wrapper })
}

describe('GeoUsagePanel', () => {
  beforeEach(() => {
    vi.mocked(client.getGeoUsage).mockResolvedValue(USAGE)
  })

  it('shows this month\'s estimated credits and the budget', async () => {
    renderPanel()
    expect(await screen.findByText(/40[\s ]?000/)).toBeInTheDocument()
    expect(screen.getByText(/250[\s ]?000/)).toBeInTheDocument()
  })

  it('shows the usage percent of the monthly budget', async () => {
    renderPanel()
    expect(await screen.findByText(/16\s*%/)).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderPanel()
    await screen.findByText(/16\s*%/)
    expect(await axe(container)).toHaveNoViolations()
  })
})
