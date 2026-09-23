import { useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/ui/Button'
import { Icon } from '../../../shared/ui/icons/Icon'
import { usePushSubscription } from '../../../shared/push/usePushSubscription'

/**
 * Floating surface card pinned under the top bar (UC-020 WI-4 restyle — was an inline bordered
 * aside). Sits above the map/sheet, respecting the safe area; the map's bottom-left attribution
 * stays clear because the card is top-anchored.
 */
const Prompt = styled.aside`
  position: fixed;
  top: calc(env(safe-area-inset-top) + 12px);
  left: 16px;
  right: 16px;
  z-index: ${({ theme }) => theme.zIndex.overlay};
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 420px;
  margin: 0 auto;
  padding: 14px 16px;
  background: var(--surface);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-float);
`

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--ink);
`

const Text = styled.p`
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: var(--fs-body);
  color: var(--ink);
`

const Buttons = styled.div`
  display: flex;
  gap: 8px;
`

const Grow = styled.div`
  flex: 1;
`

/** Feature-detect the Web Push prerequisites (jsdom-safe — no bare global references). */
function isPushSupported(): boolean {
  return typeof Notification !== 'undefined' && typeof window !== 'undefined' && 'PushManager' in window
}

/**
 * Post-first-order push-subscription prompt ("Chcete dostat upozornění, až řidič dorazí?").
 * CLIENT permission only — the actual Web Push SENDING is deferred to assignment 05
 * (documented). Feature-detects Notification/PushManager so it renders nothing (and never
 * crashes) in jsdom or unsupported browsers, and skips itself when permission is already set.
 */
export function PushPrompt() {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(false)
  const { ensureSubscribed } = usePushSubscription()

  // Only prompt when supported AND the user has not yet decided (permission === 'default').
  if (dismissed || !isPushSupported() || Notification.permission !== 'default') {
    return null
  }

  async function requestPermission(): Promise<void> {
    try {
      // ensureSubscribed requests permission, subscribes via the Push API, and POSTs to
      // /push/subscriptions on grant (UC-005 B1). It no-ops safely when unsupported/denied.
      await ensureSubscribed()
    } catch {
      // Subscription failed — ignore; push is an enhancement (spec §behavior rules).
    } finally {
      setDismissed(true)
    }
  }

  return (
    <Prompt aria-label={t('customer.tracking.pushPromptTitle')}>
      <Head>
        <Icon name="bell" aria-hidden />
        <Text>{t('customer.tracking.pushPromptTitle')}</Text>
      </Head>
      <Buttons>
        <Grow>
          <Button variant="primary" size="sm" fullWidth onClick={() => void requestPermission()}>
            {t('customer.tracking.pushAllow')}
          </Button>
        </Grow>
        <Grow>
          <Button variant="secondary" size="sm" fullWidth onClick={() => setDismissed(true)}>
            {t('customer.tracking.pushDismiss')}
          </Button>
        </Grow>
      </Buttons>
    </Prompt>
  )
}
