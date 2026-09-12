import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'

const useDriverMe = vi.fn()
vi.mock('../home/useDriverMe', () => ({ useDriverMe: () => useDriverMe() }))

const usePositionReporting = vi.fn()
vi.mock('./usePositionReporting', () => ({
  usePositionReporting: (enabled: boolean) => usePositionReporting(enabled),
}))

import { DriverPositionReporter } from './DriverPositionReporter'

function renderReporter() {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <DriverPositionReporter />
      </I18nextProvider>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  useDriverMe.mockReset()
  usePositionReporting.mockReset().mockReturnValue({ stale: false })
})

describe('DriverPositionReporter', () => {
  it('enables reporting when the driver is online (Free)', () => {
    useDriverMe.mockReturnValue({ data: { status: 'Free' } })
    renderReporter()
    expect(usePositionReporting).toHaveBeenCalledWith(true)
  })

  it('disables reporting when Offline', () => {
    useDriverMe.mockReturnValue({ data: { status: 'Offline' } })
    renderReporter()
    expect(usePositionReporting).toHaveBeenCalledWith(false)
  })

  it('disables reporting when me is not loaded', () => {
    useDriverMe.mockReturnValue({ data: undefined })
    renderReporter()
    expect(usePositionReporting).toHaveBeenCalledWith(false)
  })

  it('renders the stale banner when stale', () => {
    useDriverMe.mockReturnValue({ data: { status: 'Busy' } })
    usePositionReporting.mockReturnValue({ stale: true })
    const { getByRole } = renderReporter()
    expect(getByRole('alert')).toHaveTextContent('Poloha se neodesílá')
  })
})
