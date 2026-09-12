import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'

const useQueuePendingCount = vi.fn()
const useQueueReplayOnReconnect = vi.fn()
vi.mock('./useTransitionQueue', () => ({
  useQueuePendingCount: () => useQueuePendingCount(),
  useQueueReplayOnReconnect: () => useQueueReplayOnReconnect(),
}))

import { DriverQueueBar } from './DriverQueueBar'

function renderBar() {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <DriverQueueBar />
      </I18nextProvider>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  useQueuePendingCount.mockReset().mockReturnValue(0)
  useQueueReplayOnReconnect.mockReset()
})

describe('DriverQueueBar', () => {
  it('mounts the reconnect-drain hook (replays survive sub-route changes)', () => {
    renderBar()
    expect(useQueueReplayOnReconnect).toHaveBeenCalled()
  })

  it('renders nothing when the queue is empty', () => {
    useQueuePendingCount.mockReturnValue(0)
    const { container } = renderBar()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the pending badge when items are queued', () => {
    useQueuePendingCount.mockReturnValue(3)
    renderBar()
    expect(screen.getByRole('status')).toHaveTextContent('čeká na odeslání')
  })
})
