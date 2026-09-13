import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'

// Mock the push subscription hook — the accept button delegates to ensureSubscribed, which does
// the real Push API + /push/subscriptions POST (tested in usePushSubscription.test.ts).
const ensureSubscribed = vi.fn().mockResolvedValue('subscribed')
vi.mock('../../../shared/push/usePushSubscription', () => ({
  usePushSubscription: () => ({ ensureSubscribed, unsubscribeLocal: vi.fn() }),
}))

import { PushPrompt } from './PushPrompt'

function renderPrompt() {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <PushPrompt />
      </I18nextProvider>
    </ThemeProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PushPrompt', () => {
  it('renders nothing when the Notification API is unavailable (jsdom default)', () => {
    // jsdom has no Notification / PushManager — the prompt must not crash or render.
    const { container } = renderPrompt()
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the prompt and triggers subscription when supported and permission is default', async () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() })
    vi.stubGlobal('PushManager', class {})
    const user = userEvent.setup()

    renderPrompt()
    expect(screen.getByText(/chcete dostat upozornění/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /zapnout upozornění/i }))
    expect(ensureSubscribed).toHaveBeenCalledTimes(1)
  })

  it('does not render when permission was already granted', () => {
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() })
    vi.stubGlobal('PushManager', class {})
    const { container } = renderPrompt()
    expect(container).toBeEmptyDOMElement()
  })

  it('hides after the user dismisses it', async () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() })
    vi.stubGlobal('PushManager', class {})
    const user = userEvent.setup()

    renderPrompt()
    await user.click(screen.getByRole('button', { name: /teď ne/i }))
    expect(screen.queryByText(/chcete dostat upozornění/i)).not.toBeInTheDocument()
  })

  it('has no axe violations when shown', async () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() })
    vi.stubGlobal('PushManager', class {})
    const { container } = renderPrompt()
    expect(await axe(container)).toHaveNoViolations()
  })
})
