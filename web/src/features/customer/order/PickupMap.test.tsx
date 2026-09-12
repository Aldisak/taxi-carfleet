import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'

// Stub the lazy Leaflet body so jsdom never loads react-leaflet (no real layout/canvas).
vi.mock('./PickupMapInner', () => ({
  default: ({ onPinMove }: { onPinMove: (lat: number, lng: number) => void }) => (
    <button type="button" data-testid="fake-map" onClick={() => onPinMove(50.1, 14.3)}>
      map
    </button>
  ),
}))

import { PickupMap } from './PickupMap'

function renderMap(onPinMove = vi.fn()) {
  const utils = render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <PickupMap lat={null} lng={null} onPinMove={onPinMove} />
      </I18nextProvider>
    </ThemeProvider>,
  )
  return { ...utils, onPinMove }
}

describe('PickupMap', () => {
  it('is collapsed by default (map body not mounted)', () => {
    renderMap()
    expect(screen.queryByTestId('fake-map')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upravit na mapě/i })).toHaveAttribute('aria-expanded', 'false')
  })

  it('reveals the map and reports a dragged pin', async () => {
    const user = userEvent.setup()
    const { onPinMove } = renderMap()
    await user.click(screen.getByRole('button', { name: /upravit na mapě/i }))
    const map = await screen.findByTestId('fake-map')
    await user.click(map)
    expect(onPinMove).toHaveBeenCalledWith(50.1, 14.3)
  })

  it('has no axe violations', async () => {
    const { container } = renderMap()
    expect(await axe(container)).toHaveNoViolations()
  })
})
