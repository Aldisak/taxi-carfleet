import { useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'

const Prompt = styled.aside`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  margin: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
`

const Text = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.text};
`

const Buttons = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`

const AllowButton = styled.button`
  flex: 1;
  min-height: ${({ theme }) => theme.touchTargets.min};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  cursor: pointer;
`

const DismissButton = styled.button`
  flex: 1;
  min-height: ${({ theme }) => theme.touchTargets.min};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  cursor: pointer;
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

  // Only prompt when supported AND the user has not yet decided (permission === 'default').
  if (dismissed || !isPushSupported() || Notification.permission !== 'default') {
    return null
  }

  async function requestPermission(): Promise<void> {
    try {
      await Notification.requestPermission()
    } catch {
      // Permission request failed — ignore; push is an enhancement (spec §behavior rules).
    } finally {
      setDismissed(true)
    }
  }

  return (
    <Prompt aria-label={t('customer.tracking.pushPromptTitle')}>
      <Text>{t('customer.tracking.pushPromptTitle')}</Text>
      <Buttons>
        <AllowButton type="button" onClick={() => void requestPermission()}>
          {t('customer.tracking.pushAllow')}
        </AllowButton>
        <DismissButton type="button" onClick={() => setDismissed(true)}>
          {t('customer.tracking.pushDismiss')}
        </DismissButton>
      </Buttons>
    </Prompt>
  )
}
