import { useState, useEffect } from 'react'
import styled, { css, keyframes } from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useNewOrderHighlight } from './useNewOrderHighlight'
import { orderHasNoCoords } from './orderCoords'
import { useMapHighlightStore } from './useMapHighlight'
import { getElapsedSeconds, isElapsedRed } from './elapsedTimer'
import { useAssignOrder } from './useAssignOrder'
import { useReassignOrder } from './useReassignOrder'
import { useCancelOrder } from './useCancelOrder'
import { CANCEL_REASON_CODES, buildCancelReason, reasonRequiresFreeText } from './cancelReasons'
import { DriverPicker } from './DriverPicker'
import { useQuery } from '@tanstack/react-query'
import { ApiResponseError, getOrder } from '../../shared/api/client'
import { useHubConnectionState, isServerActionBlocked } from '../../shared/realtime/useFleetHub'
import { hasFailedSms } from '../../shared/notifications/notificationStatus'
import type { OrderSummaryDto, OrderDetailDto } from '../../shared/api/client'
import type { CancelReasonCode } from './cancelReasons'

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const highlightFlash = keyframes`
  0%   { background-color: #fef9c3; }
  100% { background-color: transparent; }
`

const Card = styled.article<{ $highlighted: boolean }>`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.sm};
  margin: ${({ theme }) => theme.spacing.xs} 0;
  position: relative;

  ${({ $highlighted }) =>
    $highlighted &&
    css`
      animation: ${highlightFlash} 3s ease-out forwards;
    `}
`

const CardRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  flex-wrap: wrap;
`

const PublicCode = styled.span`
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-family: monospace;
  color: ${({ theme }) => theme.colors.text};
`

const TimeLabel = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const FixedBadge = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  padding: 1px ${({ theme }) => theme.spacing.xs};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
`

const EstimateLabel = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const StatusPill = styled.span<{ $status: string }>`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  padding: 1px ${({ theme }) => theme.spacing.xs};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  background: ${({ $status, theme }) => {
    switch ($status) {
      case 'New': return theme.colors.orderNew
      case 'Assigned': return theme.colors.orderAssigned
      case 'Accepted':
      case 'Arrived':
      case 'InProgress': return theme.colors.orderInProgress
      case 'Completed': return theme.colors.orderCompleted
      case 'Cancelled': return theme.colors.orderCancelled
      default: return theme.colors.border
    }
  }};
  color: ${({ $status, theme }) => {
    switch ($status) {
      case 'New': return theme.colors.orderNewText
      case 'Assigned': return theme.colors.orderAssignedText
      case 'Accepted':
      case 'Arrived':
      case 'InProgress': return theme.colors.orderInProgressText
      case 'Completed': return theme.colors.orderCompletedText
      case 'Cancelled': return theme.colors.orderCancelledText
      default: return theme.colors.text
    }
  }};
`

const AddressLine = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 2px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const PhoneName = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  margin: 2px 0;
  color: ${({ theme }) => theme.colors.text};
`

const ElapsedBadge = styled.span<{ $red: boolean }>`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ $red, theme }) => ($red ? theme.colors.error : theme.colors.textSecondary)};
  font-weight: ${({ $red, theme }) => ($red ? theme.typography.fontWeightBold : theme.typography.fontWeightNormal)};
  margin-left: auto;
`

const ActionsRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
  flex-wrap: wrap;
  margin-top: ${({ theme }) => theme.spacing.xs};
`

const ActionBtn = styled.button`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  padding: 2px ${({ theme }) => theme.spacing.xs};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.primary};
    color: #fff;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`

const ConflictMsg = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ theme }) => theme.colors.error};
  margin: 2px 0;
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
`

const PickerWrapper = styled.div`
  position: relative;
  display: inline-block;
`

const CancelForm = styled.div`
  margin-top: ${({ theme }) => theme.spacing.xs};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`

const ReasonSelect = styled.select`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  padding: 2px ${({ theme }) => theme.spacing.xs};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
`

const FreeTextInput = styled.input`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  padding: 2px ${({ theme }) => theme.spacing.xs};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
`

const ErrorMsg = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ theme }) => theme.colors.error};
`

const FailedSmsIcon = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.error};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  line-height: 1;
`

const NoCoordsBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ theme }) => theme.colors.warning};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
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
  const isHighlighted = useNewOrderHighlight(order.id)
  const highlightOrder = useMapHighlightStore(s => s.highlightOrder)

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

  // Failed-SMS red icon (UC-005 §5). PRIMARY source is the LIST DTO flag `order.hasFailedSms`
  // (laneA5b/laneB5b) — it shows AT A GLANCE across the whole board WITHOUT any detail fetch.
  // As a reactive fallback we also subscribe to the order-detail cache entry WITHOUT fetching
  // (enabled: false — no N-query refetch storm, rules/web-performance.md#query-keys). Using
  // useQuery (not getQueryData) re-renders the card when detail lands in cache later (e.g. the
  // drawer or assign-picker populates it). Either source reporting a failed SMS shows the icon
  // (OR): a failed SMS is a latch — once flagged it never clears — so detail can only ADD the
  // icon (when the list row has not caught up yet), never turn it off.
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
      <CardRow>
        <PublicCode>{order.publicCode}</PublicCode>
        <TimeLabel>{timeLabel}</TimeLabel>
        <StatusPill $status={order.status} aria-label={`status-${order.status}`}>
          {t(`status.order.${order.status}`, order.status)}
        </StatusPill>
        {order.status === 'New' && (
          <ElapsedBadge $red={isRed} aria-label="elapsed-time">
            {elapsedSec < 60
              ? t('board.order.elapsedTime', { sec: elapsedSec })
              : t('board.order.elapsedTimeMin', { min: Math.floor(elapsedSec / 60) })}
          </ElapsedBadge>
        )}
        {priceDisplay && (
          priceDisplay.type === 'fixed'
            ? <FixedBadge>{t('board.order.fixedPriceBadge', { price: priceDisplay.value })}</FixedBadge>
            : <EstimateLabel>{t('board.order.estimatedPrice', { price: priceDisplay.value })}</EstimateLabel>
        )}
        {showFailedSms && (
          <FailedSmsIcon role="img" aria-label={t('notifications.failedSmsIcon')}>
            ✉︎⚠
          </FailedSmsIcon>
        )}
      </CardRow>

      <PhoneName>
        {order.customerPhone}
        {order.customerName && ` · ${order.customerName}`}
      </PhoneName>

      <AddressLine aria-label="pickup-address">{order.pickupAddress}</AddressLine>
      {noCoords && (
        <NoCoordsBadge>
          <span aria-hidden="true">⚠</span> {t('map.noCoords')}
        </NoCoordsBadge>
      )}
      {order.dropoffAddress && (
        <AddressLine aria-label="dropoff-address">→ {order.dropoffAddress}</AddressLine>
      )}

      {driverName && (
        <AddressLine aria-label="driver-name">
          {driverName}
        </AddressLine>
      )}

      {conflictMsg && (
        <ConflictMsg role="alert">{t('board.conflict')}</ConflictMsg>
      )}

      {/* Actions */}
      <ActionsRow>
        {order.status === 'New' && (
          <PickerWrapper>
            <ActionBtn
              type="button"
              aria-label={t('board.actions.assign')}
              disabled={blocked}
              onClick={() => {
                if (blocked) return
                setShowReassignPicker(false)
                setShowAssignPicker(p => !p)
              }}
            >
              {t('board.actions.assign')}
            </ActionBtn>
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
            <ActionBtn
              type="button"
              aria-label={t('board.actions.reassign')}
              disabled={blocked}
              onClick={() => {
                if (blocked) return
                setShowAssignPicker(false)
                setShowReassignPicker(p => !p)
              }}
            >
              {t('board.actions.reassign')}
            </ActionBtn>
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
          <ActionBtn
            type="button"
            aria-label={t('board.actions.cancel')}
            disabled={blocked}
            onClick={() => { if (!blocked) setShowCancelForm(p => !p) }}
          >
            {t('board.actions.cancel')}
          </ActionBtn>
        )}

        <ActionBtn
          type="button"
          aria-label={t('board.actions.detail')}
          onClick={() => navigate(`/dispatcher/orders/${order.id}`)}
        >
          {t('board.actions.detail')}
        </ActionBtn>
      </ActionsRow>

      {/* Cancel form — inline, no modal */}
      {showCancelForm && (
        <CancelForm aria-label="cancel-form">
          <label htmlFor={`cancel-reason-${order.id}`}>
            {t('board.cancelReasons.title')}
          </label>
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

          <div style={{ display: 'flex', gap: '4px' }}>
            <ActionBtn
              type="button"
              onClick={handleCancelSubmit}
              disabled={cancelOrder.isPending || blocked}
              aria-label={t('board.actions.confirm')}
            >
              {t('board.actions.confirm')}
            </ActionBtn>
            <ActionBtn
              type="button"
              onClick={() => {
                setShowCancelForm(false)
                setCancelReasonCode('')
                setCancelFreeText('')
                setCancelReasonError(false)
              }}
              aria-label={t('board.actions.close')}
            >
              {t('board.actions.close')}
            </ActionBtn>
          </div>
        </CancelForm>
      )}
    </Card>
  )
}
