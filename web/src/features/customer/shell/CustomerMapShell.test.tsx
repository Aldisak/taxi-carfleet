import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'

// The lazy leaflet chunk is stubbed — never mount a real MapContainer in jsdom. The stub
// echoes the threaded props as data-attrs so the test can assert they reach the background.
vi.mock('./CustomerMapBackground', () => ({
  default: (props: {
    cameraTarget?: unknown
    onCenterChange?: unknown
    carMarker?: unknown
    pickupMarker?: unknown
    routeGeometry?: unknown
  }) => (
    <div
      data-testid="map-background"
      data-camera-target={props.cameraTarget ? JSON.stringify(props.cameraTarget) : undefined}
      data-has-center-change={props.onCenterChange ? 'yes' : undefined}
      data-car-marker={props.carMarker ? JSON.stringify(props.carMarker) : undefined}
      data-pickup-marker={props.pickupMarker ? JSON.stringify(props.pickupMarker) : undefined}
      data-route-geometry={props.routeGeometry ? JSON.stringify(props.routeGeometry) : undefined}
    />
  ),
}))
vi.mock('../../../shared/api/auth-storage', () => ({
  authStorage: {
    setFleetSlug: vi.fn(),
    getAccessToken: vi.fn().mockReturnValue(null),
    getFleetPhone: vi.fn().mockReturnValue(null),
  },
}))
vi.mock('../../../shared/api/refresh', () => ({
  enableSilentRefresh: vi.fn(),
  scheduleProactiveRefresh: vi.fn(),
}))
// The shell resolves + persists the slug via ensureFleetSlug in a useState initializer.
vi.mock('./ensureFleetSlug', () => ({
  ensureFleetSlug: vi.fn().mockReturnValue('demo'),
}))
// Branding query is exercised elsewhere; here return a branded theme + a fleet with a phone
// so the CallButton renders a real tel: link in the top slot.
vi.mock('./useFleetBranding', () => ({
  useFleetBranding: () => ({
    theme,
    fleet: { name: 'Demo Taxi', phone: '+420123456789', primaryColorHex: null, logoUrl: null },
    isLoading: false,
  }),
}))

import { CustomerMapShell } from './CustomerMapShell'
import { authStorage } from '../../../shared/api/auth-storage'
import { enableSilentRefresh } from '../../../shared/api/refresh'
import { ensureFleetSlug } from './ensureFleetSlug'

function renderShell(props: React.ComponentProps<typeof CustomerMapShell> = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/customer']}>
        <CustomerMapShell {...props} />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe('CustomerMapShell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('persists the fleet slug exactly once on first render (F-05 / F6)', () => {
    renderShell()
    // useState initializer runs during render, before any branding fetch effect.
    expect(ensureFleetSlug).toHaveBeenCalledTimes(1)
    expect(authStorage.setFleetSlug).not.toHaveBeenCalled() // ensureFleetSlug is mocked; it owns the persist
  })

  it('enables customer silent refresh exactly once on mount (F6 double-invoke guard)', () => {
    renderShell()
    expect(enableSilentRefresh).toHaveBeenCalledTimes(1)
    expect(enableSilentRefresh).toHaveBeenCalledWith('/customer/login')
  })

  it('renders the fleet identity (FleetChip) in the chrome (onboarding AC4)', () => {
    renderShell()
    // The brand identity is now the centered FleetChip (name visible), not an <h1>.
    expect(screen.getByText('Demo Taxi')).toBeInTheDocument()
  })

  it('renders the accent call IconButton (tel link) in the top slot', () => {
    renderShell()
    const call = screen.getByRole('link', { name: /zavolat/i })
    expect(call).toHaveAttribute('href', 'tel:+420123456789')
  })

  it('opens the menu (with the language selector) from the top-bar menu button', async () => {
    const user = userEvent.setup()
    renderShell()
    // The LanguageSelector now lives inside the menu, reached via the menu IconButton.
    expect(screen.queryByRole('combobox', { name: 'Jazyk' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: i18n.t('customer.menu.openAria') }))
    expect(screen.getByRole('combobox', { name: 'Jazyk' })).toBeInTheDocument()
  })

  it('renders the lazy map background', async () => {
    renderShell()
    expect(await screen.findByTestId('map-background')).toBeInTheDocument()
  })

  it('renders a top-slot child passed by the consumer', () => {
    renderShell({ topSlot: <div data-testid="top-child" /> })
    expect(screen.getByTestId('top-child')).toBeInTheDocument()
  })

  it('renders a bottom-slot child inside the bottom overlay container', () => {
    renderShell({ bottomSlot: <div data-testid="bottom-child" /> })
    const bottom = screen.getByRole('region', { name: i18n.t('customer.shell.bottomSlotLabel') })
    expect(bottom).toContainElement(screen.getByTestId('bottom-child'))
  })

  it('threads cameraTarget and onCenterChange down to the lazy map background', async () => {
    const onCenterChange = vi.fn()
    const cameraTarget = [{ lat: 49.95, lng: 15.27 }]
    renderShell({ cameraTarget, onCenterChange })
    const bg = await screen.findByTestId('map-background')
    expect(bg).toHaveAttribute('data-camera-target', JSON.stringify(cameraTarget))
    expect(bg).toHaveAttribute('data-has-center-change', 'yes')
  })

  it('threads carMarker and pickupMarker down to the lazy map background', async () => {
    const carMarker = { lat: 49.948, lng: 15.268 }
    const pickupMarker = { lat: 49.95, lng: 15.271 }
    renderShell({ carMarker, pickupMarker })
    const bg = await screen.findByTestId('map-background')
    expect(bg).toHaveAttribute('data-car-marker', JSON.stringify(carMarker))
    expect(bg).toHaveAttribute('data-pickup-marker', JSON.stringify(pickupMarker))
  })

  it('threads routeGeometry down to the lazy map background (route-preview-gps)', async () => {
    const routeGeometry = [
      [50.08, 14.42],
      [49.95, 15.27],
    ]
    renderShell({ routeGeometry })
    const bg = await screen.findByTestId('map-background')
    expect(bg).toHaveAttribute('data-route-geometry', JSON.stringify(routeGeometry))
  })

  it('has no axe violations', async () => {
    const { container } = renderShell()
    // wait for the lazy background to resolve so the tree is stable
    await screen.findByTestId('map-background')
    expect(await axe(container)).toHaveNoViolations()
  })
})
