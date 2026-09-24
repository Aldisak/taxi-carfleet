import { useState, useEffect } from 'react'
import styled, { css, keyframes } from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useNewOrderHighlight } from './useNewOrderHighlight'
import { orderHasNoCoords } from './orderCoords'
import { useMapHighlightStore } from './useMapHighlight'
import { getElapsedSeconds, isElapsedRed } from './elapsedTimer'
import { getOrderStatusTone } from './statusPill'
import { useAssignOrder } from './useAssignOrder'
import { useReassignOrder } from './useReassignOrder'
import { useCancelOrder } from './useCancelOrder'
import { CANCEL_REASON_CODES, buildCancelReason, reasonRequiresFreeText } from './cancelReasons'
import { DriverPicker } from './DriverPicker'
import { DeskButton, DeskPill } from '../../shared/ui/desk'
import { Icon } from '../../shared/ui/icons/Icon'
import { useQuery } from '@tanstack/react-query'
import { ApiResponseError, getOrder } from '../../shared/api/client'
import { useHubConnectionState, isServerActionBlocked } from '../../shared/realtime/useFleetHub'
import { hasFailedSms } from '../../shared/notifications/notificationStatus'
import type { OrderSummaryDto, OrderDetailDto } from '../../shared/api/client'
import type { CancelReasonCode } from './cancelReasons'

// ---------------------------------------------------------------------------
// Styled components — desk kit tokens (CSS custom properties)
// ---------------------------------------------------------------------------

const highlightFlash = keyframes`
  0%   { background-color: var(--warning-bg); }
  100% { background-color: transparent; }
`

const Card = styled.article<{ $highlighted: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--surface);
  border: 1px solid ${({ $highlighted }) => ($highlighted ? 'var(--accent)' : 'var(--line)')};
  border-radius: var(--r-md);
  padding: 10px 12px;
  margin: 8px 0;
  cursor: pointer;
  ${({ $highlighted }) =>
    $highlighted &&
    css`
      box-shadow: 0 0 0 2px var(--accent);
      animation: ${highlightFlash} 3s ease-out forwards;
    `}
`

const Line1 = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`

const PublicCode = styled.span`
  font-size: var(--fs-label);
  font-weight: var(--fw-extra);
  font-family: 'Manrope', monospace;
  color: var(--ink);
`

const TimeLabel = styled.span`
  font-size: var(--fs-caption);
  color: var(--ink-2);
`

const Price = styled.span`
  margin-left: auto;
  font-size: var(--fs-label);
  font-weight: var(--fw-bold);
  color: var(--ink);
`

const ElapsedPill = styled.span<{ $red: boolean }>`
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: var(--r-pill);
  font-size: 11px;
  font-weight: var(--fw-extra);
  letter-spacing: 0.02em;
  background: ${({ $red }) => ($red ? 'var(--danger-bg)' : 'var(--surface-2)')};
  color: ${({ $red }) => ($red ? 'var(--danger)' : 'var(--ink-2)')};
  white-space: nowrap;
`

const PhoneName = styled.p`
  margin: 0;
  font-size: var(--fs-label);
  color: var(--ink);
`

const Phone = styled.span`
  font-weight: var(--fw-bold);
`

const Route = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
`

const RouteRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-caption);
  color: var(--ink-2);
  min-width: 0;
`

const RouteAddress = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const PickupDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: var(--r-pill);
  background: var(--accent);
  flex-shrink: 0;
`

const DropoffSquare = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--ink);
  flex-shrink: 0;
`

const DriverLine = styled.p`
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-caption);
  color: var(--ink-2);
`

const CarIcon = styled.span`
  display: inline-flex;
  color: var(--ink-3);
`

const ConflictMsg = styled.p`
  margin: 0;
  font-size: var(--fs-caption);
  font-weight: var(--fw-bold);
  color: var(--danger);
`

const PickerWrapper = styled.div`
  position: relative;
  display: inline-block;
`

const ActionsRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 2px;
`

const CancelForm = styled.div`
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const ReasonSelect = styled.select`
  height: 32px;
  padding: 0 8px;
  font-size: var(--fs-caption);
  font-family: inherit;
  color: var(--ink);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
`

const FreeTextInput = styled.input`
  height: 32px;
  padding: 0 8px;
  font-size: var(--fs-caption);
  font-family: inherit;
  color: var(--ink);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
`

const CancelLabel = styled.label`
  font-size: var(--fs-caption);
  font-weight: var(--fw-bold);
  color: var(--ink-2);
`

const ErrorMsg = styled.span`
  font-size: var(--fs-caption);
  color: var(--danger);
`

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface OrderCardProps {
  order: OrderSummaryDto
  driverName?: string | null
}

/** A single order card in the orders column. */
export function OrderCard({ order, driverName }: OrderCardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isNewHighlight = useNewOrderHighlight(order.id)
  const highlightOrder = useMapHighlightStore(s => s.highlightOrder)
  // Card whose pin is hovered/selected on the map (card←→pin). Atomic selector — an object
  // selector here would re-render-loop (documented zustand trap). The hot state is the OR of
  // the newest-order flash and the map-highlighted card (WI-3 §3 hot highlight).
  const mapHighlightedId = useMapHighlightStore(s => s.highlightedOrderId)
  const isHighlighted = isNewHighlight || mapHighlightedId === order.id

  // Elapsed time for New orders
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (order.status !== 'New') return
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [order.status])

  const elapsedSec = order.status === 'New' ? getElapsedSeconds(order.createdAt, now) : 0
  const isRed = order.status === 'New' && isElapsedRed(elapsedSec)

  // Conflict message state
  const [conflictMsg, setConflictMsg] = useState(false)

  // Driver picker visibility
  const [showAssignPicker, setShowAssignPicker] = useState(false)
  const [showReassignPicker, setShowReassignPicker] = useState(false)

  // Cancel form state
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [cancelReasonCode, setCancelReasonCode] = useState<CancelReasonCode | ''>('')
  const [cancelFreeText, setCancelFreeText] = useState('')
  const [cancelReasonError, setCancelReasonError] = useState(false)

  // Lazy-fetch order detail when a picker opens to get real pickup coords
  const { data: orderDetail } = useQuery({
    queryKey: ['orders', 'detail', order.id],
    queryFn: () => getOrder(order.id),
    enabled: showAssignPicker || showReassignPicker,
    staleTime: 60_000,
  })

  // Real coords from detail; fallback to 0,0 while loading (free-first still works)
  const pickupLat = orderDetail?.pickupLat ?? 0
  const pickupLng = orderDetail?.pickupLng ?? 0

  const assignOrder = useAssignOrder()
  const reassignOrder = useReassignOrder()
  const cancelOrder = useCancelOrder()
  const blocked = isServerActionBlocked(useHubConnectionState())

  // Failed-SMS danger pill (UC-005 §5). PRIMARY source is the LIST DTO flag `order.hasFailedSms`
  // (laneA5b/laneB5b) — it shows AT A GLANCE across the whole board WITHOUT any detail fetch.
  // As a reactive fallback we also subscribe to the order-detail cache entry WITHOUT fetching
  // (enabled: false — no N-query refetch storm, rules/web-performance.md#query-keys). Either
  // source reporting a failed SMS shows the pill (OR): a failed SMS is a latch — once flagged it
  // never clears — so detail can only ADD the pill, never turn it off.
  const { data: cachedDetail } = useQuery<OrderDetailDto>({
    queryKey: ['orders', 'detail', order.id],
    queryFn: () => getOrder(order.id),
    enabled: false,
  })
  const showFailedSms = order.hasFailedSms === true || hasFailedSms(cachedDetail?.notifications)

  // "bez souřadnic" indicator (UC-010 AC#2): the order was accepted without pickup coordinates
  // (suggest/geocode degraded), so it cannot be map-placed or distance-sorted.
  const noCoords = orderHasNoCoords(order)

  function handleConflict() {
    setConflictMsg(true)
    setTimeout(() => setConflictMsg(false), 5000)
  }

  function handleAssignSelect(driverId: string) {
    setShowAssignPicker(false)
    if (blocked) return
    assignOrder.mutate(
      { orderId: order.id, driverId },
      {
        onError: (err) => {
          if (err instanceof ApiResponseError && err.status === 409) {
            handleConflict()
          }
        },
      },
    )
  }

  function handleReassignSelect(driverId: string) {
    setShowReassignPicker(false)
    if (blocked) return
    reassignOrder.mutate(
      { orderId: order.id, driverId },
      {
        onError: (err) => {
          if (err instanceof ApiResponseError && err.status === 409) {
            handleConflict()
          }
        },
      },
    )
  }

  function handleCancelSubmit() {
    if (blocked) return
    if (!cancelReasonCode) {
      setCancelReasonError(true)
      return
    }
    setCancelReasonError(false)
    const reason = buildCancelReason(cancelReasonCode as CancelReasonCode, cancelFreeText)
    cancelOrder.mutate(
      { orderId: order.id, reason },
      {
        onSuccess: () => {
          setShowCancelForm(false)
          setCancelReasonCode('')
          setCancelFreeText('')
        },
        onError: (err) => {
          if (err instanceof ApiResponseError && err.status === 409) {
            handleConflict()
            setShowCancelForm(false)
          }
        },
      },
    )
  }

  // Derive display values
  const timeLabel = order.scheduledAt
    ? new Date(order.scheduledAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
    : t('board.order.asap')

  const priceDisplay = order.priceType === 'Fixed' && order.fixedPriceCzk != null
    ? { type: 'fixed' as const, value: order.fixedPriceCzk }
    : order.estimatedPriceCzk != null
      ? { type: 'estimate' as const, value: order.estimatedPriceCzk }
      : null

  return (
    <Card
      $highlighted={isHighlighted}
      aria-label={`order-card-${order.publicCode}`}
      onClick={() => highlightOrder(order.id)}
    >
      <Line1>
        <PublicCode>{order.publicCode}</PublicCode>
        <TimeLabel>{timeLabel}</TimeLabel>
        <span aria-label={`status-${order.status}`}>
          <DeskPill tone={getOrderStatusTone(order.status)}>
            {t(`status.order.${order.status}`, order.status)}
          </DeskPill>
        </span>
        {order.status === 'New' && (
          <ElapsedPill $red={isRed} aria-label="elapsed-time">
            {elapsedSec < 60
              ? t('board.order.elapsedTime', { sec: elapsedSec })
              : t('board.order.elapsedTimeMin', { min: Math.floor(elapsedSec / 60) })}
          </ElapsedPill>
        )}
        {noCoords && (
          <DeskPill tone="warning">{t('board.order.noCoords')}</DeskPill>
        )}
        {showFailedSms && (
          <DeskPill tone="danger">{t('board.order.smsFailed')}</DeskPill>
        )}
        {priceDisplay && (
          <Price>
            {priceDisplay.type === 'fixed'
              ? t('board.order.fixedPriceBadge', { price: priceDisplay.value })
              : t('board.order.estimatedPrice', { price: priceDisplay.value })}
          </Price>
        )}
      </Line1>

      <PhoneName>
        <Phone>{order.customerPhone}</Phone>
        {order.customerName && ` · ${order.customerName}`}
      </PhoneName>

      <Route>
        <RouteRow>
          <PickupDot aria-hidden="true" />
          <RouteAddress aria-label="pickup-address">{order.pickupAddress}</RouteAddress>
        </RouteRow>
        {order.dropoffAddress && (
          <RouteRow>
            <DropoffSquare aria-hidden="true" />
            <RouteAddress aria-label="dropoff-address">{order.dropoffAddress}</RouteAddress>
          </RouteRow>
        )}
      </Route>

      {driverName && (
        <DriverLine aria-label="driver-name">
          <CarIcon>
            <Icon name="car" size={14} />
          </CarIcon>
          <span>{driverName}</span>
        </DriverLine>
      )}

      {conflictMsg && (
        <ConflictMsg role="alert">{t('board.conflict')}</ConflictMsg>
      )}

      {/* Actions */}
      <ActionsRow>
        {order.status === 'New' && (
          <PickerWrapper>
            <DeskButton
              variant="primary"
              size="xs"
              aria-label={t('board.actions.assign')}
              disabled={blocked}
              onClick={() => {
                if (blocked) return
                setShowReassignPicker(false)
                setShowAssignPicker(p => !p)
              }}
            >
              {t('board.actions.assign')}
            </DeskButton>
            {showAssignPicker && (
              <DriverPicker
                pickupLat={pickupLat}
                pickupLng={pickupLng}
                onSelect={(d) => handleAssignSelect(d.driverId)}
                onClose={() => setShowAssignPicker(false)}
              />
            )}
          </PickerWrapper>
        )}

        {(order.status === 'Assigned' || order.status === 'Accepted' || order.status === 'Arrived') && (
          <PickerWrapper>
            <DeskButton
              variant="primary"
              size="xs"
              aria-label={t('board.actions.reassign')}
              disabled={blocked}
              onClick={() => {
                if (blocked) return
                setShowAssignPicker(false)
                setShowReassignPicker(p => !p)
              }}
            >
              {t('board.actions.reassign')}
            </DeskButton>
            {showReassignPicker && (
              <DriverPicker
                pickupLat={pickupLat}
                pickupLng={pickupLng}
                onSelect={(d) => handleReassignSelect(d.driverId)}
                onClose={() => setShowReassignPicker(false)}
              />
            )}
          </PickerWrapper>
        )}

        {order.status !== 'Completed' && order.status !== 'Cancelled' && (
          <DeskButton
            variant="danger"
            size="xs"
            aria-label={t('board.actions.cancel')}
            disabled={blocked}
            onClick={() => { if (!blocked) setShowCancelForm(p => !p) }}
          >
            {t('board.actions.cancel')}
          </DeskButton>
        )}

        <DeskButton
          variant="outline"
          size="xs"
          aria-label={t('board.actions.detail')}
          onClick={() => navigate(`/dispatcher/orders/${order.id}`)}
        >
          {t('board.actions.detail')}
        </DeskButton>
      </ActionsRow>

      {/* Cancel form — inline, no modal */}
      {showCancelForm && (
        <CancelForm aria-label="cancel-form">
          <CancelLabel htmlFor={`cancel-reason-${order.id}`}>
            {t('board.cancelReasons.title')}
          </CancelLabel>
          <ReasonSelect
            id={`cancel-reason-${order.id}`}
            value={cancelReasonCode}
            onChange={(e) => {
              setCancelReasonCode(e.target.value as CancelReasonCode | '')
              setCancelReasonError(false)
            }}
            aria-label={t('board.cancelReasons.title')}
          >
            <option value="">— {t('board.cancelReasons.title')} —</option>
            {CANCEL_REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {t(`board.cancelReasons.${code}`, code)}
              </option>
            ))}
          </ReasonSelect>

          {cancelReasonError && (
            <ErrorMsg role="alert">{t('board.cancelReasons.required')}</ErrorMsg>
          )}

          {cancelReasonCode && reasonRequiresFreeText(cancelReasonCode as CancelReasonCode) && (
            <FreeTextInput
              type="text"
              value={cancelFreeText}
              onChange={(e) => setCancelFreeText(e.target.value)}
              placeholder={t('board.cancelReasons.freeTextPlaceholder')}
              aria-label={t('board.cancelReasons.freeTextPlaceholder')}
            />
          )}

          <div style={{ display: 'flex', gap: '6px' }}>
            <DeskButton
              variant="primary"
              size="xs"
              onClick={handleCancelSubmit}
              disabled={cancelOrder.isPending || blocked}
              aria-label={t('board.actions.confirm')}
            >
              {t('board.actions.confirm')}
            </DeskButton>
            <DeskButton
              variant="secondary"
              size="xs"
              onClick={() => {
                setShowCancelForm(false)
                setCancelReasonCode('')
                setCancelFreeText('')
                setCancelReasonError(false)
              }}
              aria-label={t('board.actions.close')}
            >
              {t('board.actions.close')}
            </DeskButton>
          </div>
        </CancelForm>
      )}
    </Card>
  )
}
