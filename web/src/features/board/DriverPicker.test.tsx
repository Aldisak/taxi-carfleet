import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'
import { DriverPicker } from './DriverPicker'

vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return {
    ...actual,
    getDrivers: vi.fn(),
  }
})

import * as client from '../../shared/api/client'

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        ThemeProvider,
        { theme },
        createElement(I18nextProvider, { i18n }, children),
      ),
    )
}

const DRIVER_A = {
  driverId: 'driver-a',
  displayName: 'Adam Novák',
  status: 'Free',
  currentVehiclePlate: 'KO123',
  lastPositionAt: null,
  lastLat: null,
  lastLng: null,
}

const DRIVER_B = {
  driverId: 'driver-b',
  displayName: 'Barbora Dvořák',
  status: 'Busy',
  currentVehiclePlate: null,
  lastPositionAt: null,
  lastLat: null,
  lastLng: null,
}

describe('DriverPicker — keyboard navigation', () => {
  const onSelect = vi.fn()
  const onClose = vi.fn()

  beforeEach(() => {
    onSelect.mockReset()
    onClose.mockReset()
    vi.mocked(client.getDrivers).mockResolvedValue({ items: [DRIVER_A, DRIVER_B] })
  })

  it('focuses container on mount so keyboard events work', async () => {
    render(
      createElement(DriverPicker, {
        pickupLat: 0,
        pickupLng: 0,
        onSelect,
        onClose,
      }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => {
      const listbox = screen.getByRole('listbox')
      expect(document.activeElement).toBe(listbox)
    })
  })

  it('ArrowDown + Enter selects second driver', async () => {
    render(
      createElement(DriverPicker, {
        pickupLat: 0,
        pickupLng: 0,
        onSelect,
        onClose,
      }),
      { wrapper: makeWrapper() },
    )
    // Wait for drivers to load
    await waitFor(() => {
      expect(screen.getByText('Adam Novák')).toBeInTheDocument()
    })

    const listbox = screen.getByRole('listbox')
    // ArrowDown moves from index 0 to index 1
    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    // Enter selects the focused (index 1) driver
    fireEvent.keyDown(listbox, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ driverId: 'driver-b' }))
  })

  it('Escape key calls onClose', async () => {
    render(
      createElement(DriverPicker, {
        pickupLat: 0,
        pickupLng: 0,
        onSelect,
        onClose,
      }),
      { wrapper: makeWrapper() },
    )
    const listbox = screen.getByRole('listbox')
    fireEvent.keyDown(listbox, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
