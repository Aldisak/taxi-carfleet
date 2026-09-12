import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'

// Leaflet body stubbed so jsdom never loads react-leaflet.
vi.mock('./TrackingMapInner', () => ({ default: () => <div data-testid="fake-tracking-map" /> }))

import { TrackingMap } from './TrackingMap'

function renderMap() {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <TrackingMap car={{ lat: 50.08, lng: 14.42 }} pickup={{ lat: 50.09, lng: 14.43 }} />
      </I18nextProvider>
    </ThemeProvider>,
  )
}

describe('TrackingMap', () => {
  it('is collapsed by default and does not mount the Leaflet body', () => {
    renderMap()
    expect(screen.queryByTestId('fake-tracking-map')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /zobrazit mapu/i })).toHaveAttribute('aria-expanded', 'false')
  })

  it('mounts the Leaflet body when expanded', async () => {
    const user = userEvent.setup()
    renderMap()
    await user.click(screen.getByRole('button', { name: /zobrazit mapu/i }))
    expect(await screen.findByTestId('fake-tracking-map')).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderMap()
    expect(await axe(container)).toHaveNoViolations()
  })
})
