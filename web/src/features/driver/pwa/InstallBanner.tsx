import { useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { usePwaInstall } from './usePwaInstall'

const Banner = styled.div`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: ${({ theme }) => theme.colors.surface};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: ${({ theme }) => theme.shadows.md};
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  z-index: 1000;
`

const BannerTitle = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
`

const BannerDesc = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`

const ButtonRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`

const InstallButton = styled.button`
  flex: 1;
  min-height: ${({ theme }) => theme.touchTargets.primary};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  cursor: pointer;
`

const DismissButton = styled.button`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
`

const IosNote = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
  line-height: ${({ theme }) => theme.typography.lineHeight};
`

/** Detects iOS Safari where the beforeinstallprompt API is unavailable. */
function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iP(hone|ad|od)/.test(ua) && /WebKit/.test(ua) && !/CriOS/.test(ua)
}

/** Detects whether the app is already running in standalone mode (installed). */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
}

/**
 * Custom PWA install banner.
 * - On Android/desktop: shows when beforeinstallprompt fires.
 * - On iOS Safari: shows static "Přidat na plochu" instructions.
 * - Already installed (standalone): shows nothing.
 */
export function InstallBanner() {
  const { t } = useTranslation()
  const { canInstall, triggerInstall } = usePwaInstall()
  const [dismissed, setDismissed] = useState(false)

  // Never show if already installed
  if (isStandalone()) return null
  // Never show after dismiss
  if (dismissed) return null

  const showNative = canInstall
  const showIos = isIosSafari() && !canInstall

  if (!showNative && !showIos) return null

  async function handleInstall() {
    await triggerInstall()
    setDismissed(true)
  }

  return (
    <Banner role="complementary" aria-label={t('driver.install.bannerTitle')}>
      <BannerTitle>{t('driver.install.bannerTitle')}</BannerTitle>
      <BannerDesc>{t('driver.install.bannerDescription')}</BannerDesc>
      {showNative && (
        <ButtonRow>
          <InstallButton type="button" onClick={handleInstall}>
            {t('driver.install.installButton')}
          </InstallButton>
          <DismissButton type="button" onClick={() => setDismissed(true)}>
            {t('driver.install.dismissButton')}
          </DismissButton>
        </ButtonRow>
      )}
      {showIos && (
        <>
          <IosNote>{t('driver.install.iosInstructions')}</IosNote>
          <ButtonRow>
            <DismissButton type="button" onClick={() => setDismissed(true)}>
              {t('driver.install.dismissButton')}
            </DismissButton>
          </ButtonRow>
        </>
      )}
    </Banner>
  )
}
