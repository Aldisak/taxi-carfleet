import { useCallback, useEffect, useState } from 'react'
import styled from 'styled-components'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authStorage } from '../../../shared/api/auth-storage'
import { CustomerLoginStep } from '../login/CustomerLoginStep'
import { useOnlineStatus } from '../shell/useOnlineStatus'
import { useRouteOrder } from './useRouteOrder'
import { useCreateOrder } from './useCreateOrder'
import { buildRouteOrderRequest, isAddressLocked } from './orderForm'
import { validateScheduledAt, minScheduledAt, maxScheduledAt } from './whenRules'
import { FixedPriceBadge } from './FixedPriceBadge'
import { PassengerStepper } from './PassengerStepper'
import { WhenPicker, type WhenMode } from './WhenPicker'

const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
  padding: ${({ theme }) => theme.spacing.lg};
`

const Journey = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const NoteInput = styled.input`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
`

const Placeholder = styled.p`
  margin: 0;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.background};
  border: 1px dashed ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const MoreLink = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const SubmitButton = styled.button`
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.primary};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const Message = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.error};
`

const LoginPrompt = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.text};
`

/**
 * Confirm-route order screen (/c/order/route/:routeId). Route-type-driven: PointToPoint
 * shows a locked journey + optional pickup note; Zone/ZoneToZone are placeholders pre-06.
 * When (Hned / Na čas +20min…+7d), passengers 1–4, big fixed price. On Objednat, if the
 * customer is not logged in the inline CustomerLoginStep renders WITHOUT unmounting the
 * form (the parent owns all form state via local state, so passengers/when/note survive);
 * on auth the order is created (reusing postCreateOrder, unwrapping { order }) and the app
 * navigates to tracking via the returned publicCode.
 */
export function RouteOrderPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const online = useOnlineStatus()
  const { route } = useRouteOrder()
  const createOrder = useCreateOrder()

  const [passengers, setPassengers] = useState(1)
  const [whenMode, setWhenMode] = useState<WhenMode>('now')
  const [scheduledAtLocal, setScheduledAtLocal] = useState('')
  const [note, setNote] = useState('')
  const [showLogin, setShowLogin] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const toIso = useCallback((local: string): string | null => {
    if (!local) return null
    const ms = Date.parse(local)
    return Number.isNaN(ms) ? local : new Date(ms).toISOString()
  }, [])

  const submit = useCallback(async () => {
    if (!route) return
    setFormError(null)

    let scheduledAt: string | null = null
    if (whenMode === 'scheduled') {
      const iso = toIso(scheduledAtLocal)
      const verdict = iso ? validateScheduledAt(iso) : 'invalid'
      if (verdict === 'tooSoon') { setFormError('customer.order.errorTooSoon'); return }
      if (verdict === 'tooLate') { setFormError('customer.order.errorTooLate'); return }
      if (verdict === 'invalid') { setFormError('customer.order.errorScheduledInvalid'); return }
      scheduledAt = iso
    }

    const req = buildRouteOrderRequest({
      route,
      passengers,
      scheduledAt,
      note: note.trim() === '' ? null : note.trim(),
    })

    try {
      const created = await createOrder.mutateAsync(req)
      navigate(`/c/t/${created.publicCode}`)
    } catch {
      setFormError('customer.order.errorCreateFailed')
    }
  }, [route, whenMode, scheduledAtLocal, toIso, passengers, note, createOrder, navigate])

  // Deep-link / hard-refresh with no nav-state and no warm cache cannot recover the
  // route (no route-detail endpoint pre-06) — bounce back Home.
  useEffect(() => {
    if (route === null) {
      navigate('/c', { replace: true })
    }
  }, [route, navigate])

  if (!route) {
    return <Page><Message>{t('customer.order.routeNotFound')}</Message></Page>
  }

  function handleSubmitClick() {
    if (!online) {
      setFormError('customer.order.offlineBlocked')
      return
    }
    if (authStorage.getAccessToken() === null) {
      setShowLogin(true)
      return
    }
    void submit()
  }

  const locked = isAddressLocked(route)

  return (
    <Page>
      <Journey>{route.name}</Journey>
      <FixedPriceBadge priceCzk={route.priceCzk} />

      {!locked && (
        <Placeholder role="note">{t('customer.order.zonePlaceholder')}</Placeholder>
      )}

      {locked && (
        <Field>
          {t('customer.order.noteLabel')}
          <NoteInput
            value={note}
            placeholder={t('customer.order.notePlaceholder')}
            onChange={e => setNote(e.target.value)}
          />
        </Field>
      )}

      <WhenPicker
        mode={whenMode}
        onModeChange={setWhenMode}
        scheduledAt={scheduledAtLocal}
        onScheduledAtChange={setScheduledAtLocal}
        min={toLocalInput(minScheduledAt())}
        max={toLocalInput(maxScheduledAt())}
      />

      <Field as="div">
        {t('customer.order.passengersLabel')}
        <PassengerStepper value={passengers} onChange={setPassengers} />
        <MoreLink>{t('customer.order.morePassengers')}</MoreLink>
      </Field>

      {formError && <Message role="alert">{t(formError)}</Message>}

      {showLogin ? (
        <>
          <LoginPrompt>{t('customer.order.loginPrompt')}</LoginPrompt>
          <CustomerLoginStep onAuthenticated={() => { setShowLogin(false); void submit() }} />
        </>
      ) : (
        <SubmitButton type="button" onClick={handleSubmitClick} disabled={createOrder.isPending}>
          {createOrder.isPending ? t('customer.order.submitting') : t('customer.order.submit')}
        </SubmitButton>
      )}
    </Page>
  )
}

/** Converts a Date to a datetime-local input value (local time, no seconds). */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
