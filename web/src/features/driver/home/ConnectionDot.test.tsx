import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import React from 'react'
import { theme } from '../../../shared/theme/theme'
import { ConnectionDot } from './ConnectionDot'

// Mock useConnectionState
vi.mock('../../../shared/realtime/useFleetHub', () => ({
  useConnectionState: vi.fn(),
}))

import { useConnectionState } from '../../../shared/realtime/useFleetHub'

const mockUseConnectionState = vi.mocked(useConnectionState)

function renderDot() {
  return render(
    React.createElement(
      ThemeProvider,
      { theme },
      React.createElement(ConnectionDot),
    ),
  )
}

describe('ConnectionDot', () => {
  it('shows green when connected', () => {
    mockUseConnectionState.mockReturnValue('connected')
    renderDot()
    expect(screen.getByText('green')).toBeInTheDocument()
  })

  it('shows yellow when connecting', () => {
    mockUseConnectionState.mockReturnValue('connecting')
    renderDot()
    expect(screen.getByText('yellow')).toBeInTheDocument()
  })

  it('shows yellow when reconnecting', () => {
    mockUseConnectionState.mockReturnValue('reconnecting')
    renderDot()
    expect(screen.getByText('yellow')).toBeInTheDocument()
  })

  it('shows red when disconnected', () => {
    mockUseConnectionState.mockReturnValue('disconnected')
    renderDot()
    expect(screen.getByText('red')).toBeInTheDocument()
  })
})
