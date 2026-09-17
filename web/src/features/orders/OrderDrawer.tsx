import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { getOrder, getOrderEvents } from '../../shared/api/client'
import { isOrderEditable } from './isOrderEditable'
import { EventTimeline } from './OrderEventTimeline'
import { NotificationsSection } from './NotificationsSection'
import { deriveTransitionButtons } from './transitionButtons'
import { useUpdateOrder } from './useUpdateOrder'
import { useAssignOrder } from '../board/useAssignOrder'
import { useReassignOrder } from '../board/useReassignOrder'
import { useCancelOrder } from '../board/useCancelOrder'
import { DriverPicker } from '../board/DriverPicker'
import { CANCEL_REASON_CODES, buildCancelReason, reasonRequiresFreeText } from '../board/cancelReasons'
import type { CancelReasonCode } from '../board/cancelReasons'
import { useAddressSuggest } from '../board/useAddressSuggest'
import { orderHasNoCoords } from '../board/orderCoords'
import type { UpdateOrderRequest, GeoSuggestItem } from '../../shared/api/client'
import { suggestionMeta } from '../../shared/geo/suggestionMeta'

// ---------------------------------------------------------------------------
// Address autocomplete sub-component (edit mode only)
// ---------------------------------------------------------------------------

interface AddressEditInputProps {
  value: string
  onChange: (val: string) => void
  onSelect: (item: GeoSuggestItem) => void
  'aria-label': string
}

const SuggestList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: ${({ theme }) => theme.colors.surface};
  box-shadow: ${({ theme }) => theme.shadows.md};
  max-height: 160px;
  overflow-y: auto;
  position: absolute;
  left: 0;
  right: 0;
  z-index: 200;
`

const SuggestItem = styled.li<{ $highlighted: boolean }>`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  cursor: pointer;
  background: ${({ $highlighted, theme }) => ($highlighted ? theme.colors.primary : 'transparent')};
  color: ${({ $highlighted, theme }) => ($highlighted ? '#fff' : theme.colors.text)};

  &:hover {
    background: ${({ theme }) => theme.colors.primary};
    color: #fff;
  }
`

const SuggestMeta = styled.span<{ $highlighted: boolean }>`
  display: block;
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ $highlighted, theme }) => ($highlighted ? '#fff' : theme.colors.textSecondary)};
`

/** Address input with Photon autocomplete — used during edit mode in the drawer. */
function AddressEditInput({ value, onChange, onSelect, 'aria-label': ariaLabel }: AddressEditInputProps) {
  const { items, clear } = useAddressSuggest(value)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(i => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Escape') {
      clear()
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault()
      e.stopPropagation()
      const item = items[highlightedIndex]
      if (item) { onSelect(item); clear(); setHighlightedIndex(-1) }
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setHighlightedIndex(-1)
    onChange(e.target.value)
  }

  function handleItemMouseDown(item: GeoSuggestItem) {
    onSelect(item)
    clear()
    setHighlightedIndex(-1)
  }

  return (
    <div style={{ position: 'relative' }}>
      <FieldInput
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={items.length > 0}
        autoComplete="off"
      />
      {items.length > 0 && (
        <SuggestList role="listbox">
          {items.map((item, i) => {
            const meta = suggestionMeta(item)
            return (
              <SuggestItem
                key={`${item.lat}-${item.lng}`}
                role="option"
                aria-selected={i === highlightedIndex}
                $highlighted={i === highlightedIndex}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleItemMouseDown(item)
                }}
              >
                <span>{item.name}</span>
                {meta && <SuggestMeta $highlighted={i === highlightedIndex}>{meta}</SuggestMeta>}
              </SuggestItem>
            )
          })}
        </SuggestList>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 100;
  display: flex;
  justify-content: flex-end;
`

const DrawerPanel = styled.aside`
  width: 480px;
  max-width: 100vw;
  height: 100%;
  background: ${({ theme }) => theme.colors.surface};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

const DrawerHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  flex-shrink: 0;
`

const DrawerTitle = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

const CloseButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  padding: ${({ theme }) => theme.spacing.xs};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  line-height: 1;

  &:hover {
    background: ${({ theme }) => theme.colors.background};
  }
`

const DrawerBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`

const SectionTitle = styled.h3`
  margin: 0 0 ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`

const FieldValue = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.text};
`

// "bez souřadnic" warning shown under the pickup address when the order has no usable pickup
// coordinates (UC-010 AC#2 — suggest/geocode was degraded when the order was created).
const NoCoordsWarning = styled.p`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 4px 0 0;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.warning};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
`

const FieldInput = styled.input`
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.text};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  width: 100%;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`

const FieldTextArea = styled.textarea`
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.text};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  width: 100%;
  resize: vertical;
  min-height: 64px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`

const ButtonRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`

const ActionButton = styled.button<{ $variant?: 'primary' | 'danger' | 'secondary' }>`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme, $variant }) =>
    $variant === 'primary' ? theme.colors.primary :
    $variant === 'danger' ? theme.colors.error :
    theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: ${({ theme, $variant }) =>
    $variant === 'primary' ? theme.colors.primary :
    $variant === 'danger' ? theme.colors.error :
    'transparent'};
  color: ${({ theme, $variant }) =>
    $variant === 'primary' || $variant === 'danger' ? '#ffffff' : theme.colors.text};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  cursor: pointer;

  &:hover:not(:disabled) {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const ConflictBanner = styled.div`
  background: ${({ theme }) => theme.colors.warning};
  color: #202124;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
`

const LoadingMessage = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
`

const CancelForm = styled.div`
  margin-top: ${({ theme }) => theme.spacing.xs};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`

const ReasonSelect = styled.select`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.surface};
`

const FreeTextInput = styled.input`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
`

const ErrorMsg = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.error};
`

// ---------------------------------------------------------------------------
// Types for edit state
// ---------------------------------------------------------------------------

interface EditState {
  pickupAddress: string
  pickupLat: number | null
  pickupLng: number | null
  dropoffAddress: string
  dropoffLat: number | null
  dropoffLng: number | null
  note: string
  passengers: number
  scheduledAt: string  // datetime-local string (YYYY-MM-DDTHH:mm) or ''
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Converts ISO string to datetime-local input value (truncate seconds). */
function isoToDateTimeLocal(iso: string | null): string {
  if (!iso) return ''
  // Format: YYYY-MM-DDTHH:mm
  return iso.slice(0, 16)
}

/** Converts datetime-local value to ISO string, or null if empty. */
function dateTimeLocalToIso(val: string): string | null {
  if (!val) return null
  return new Date(val).toISOString()
}

/** Builds a diff-only PATCH payload — only includes fields the user actually changed.
 * When address changes, includes the corresponding lat/lng (required by the backend). */
function buildPatchFields(
  original: { pickupAddress: string; pickupLat: number; pickupLng: number; dropoffAddress: string | null; dropoffLat: number | null; dropoffLng: number | null; note: string | null; passengers: number; scheduledAt: string | null },
  edited: EditState,
): Partial<Omit<UpdateOrderRequest, 'version'>> {
  const patch: Partial<Omit<UpdateOrderRequest, 'version'>> = {}

  if (edited.pickupAddress !== original.pickupAddress) {
    patch.pickupAddress = edited.pickupAddress || null
    // Always include coords when address changes — backend requires them together
    patch.pickupLat = edited.pickupLat
    patch.pickupLng = edited.pickupLng
  }
  if (edited.dropoffAddress !== (original.dropoffAddress ?? '')) {
    patch.dropoffAddress = edited.dropoffAddress || null
    // Include dropoff coords when dropoff address changes
    patch.dropoffLat = edited.dropoffLat
    patch.dropoffLng = edited.dropoffLng
  }
  if (edited.note !== (original.note ?? '')) {
    patch.note = edited.note || null
  }
  if (edited.passengers !== original.passengers) {
    patch.passengers = edited.passengers
  }

  const originalScheduledAt = isoToDateTimeLocal(original.scheduledAt)
  if (edited.scheduledAt !== originalScheduledAt) {
    patch.scheduledAt = dateTimeLocalToIso(edited.scheduledAt)
  }

  return patch
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** B8: Right-side drawer showing order detail, editable fields, timeline, and action buttons. */
export function OrderDrawer() {
  const { t } = useTranslation()
  const { id: orderId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // State for edit mode
  const [isEditing, setIsEditing] = useState(false)
  const [editState, setEditState] = useState<EditState>({
    pickupAddress: '',
    pickupLat: null,
    pickupLng: null,
    dropoffAddress: '',
    dropoffLat: null,
    dropoffLng: null,
    note: '',
    passengers: 1,
    scheduledAt: '',
  })
  const [showConflict, setShowConflict] = useState(false)

  // Driver picker state for assign/reassign
  const [activePickerAction, setActivePickerAction] = useState<string | null>(null)

  // Cancel form state
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [cancelReasonCode, setCancelReasonCode] = useState<CancelReasonCode | ''>('')
  const [cancelFreeText, setCancelFreeText] = useState('')
  const [cancelReasonError, setCancelReasonError] = useState(false)

  // Fetch order detail
  const { data: order, isLoading } = useQuery({
    queryKey: ['orders', 'detail', orderId],
    queryFn: () => getOrder(orderId!),
    enabled: !!orderId,
    staleTime: 10_000,
  })

  // Fetch order events
  const { data: events } = useQuery({
    queryKey: ['orders', 'detail', orderId, 'events'],
    queryFn: () => getOrderEvents(orderId!),
    enabled: !!orderId,
    staleTime: 10_000,
  })

  // Update order mutation
  const { mutate: updateOrder, isPending: isSaving } = useUpdateOrder(
    () => {
      setIsEditing(false)
      setShowConflict(false)
    },
    () => {
      setShowConflict(true)
      setIsEditing(false)
    },
  )

  // B4 hooks for assign/reassign/cancel — reuse their cache management and 409 handling
  const assignOrder = useAssignOrder()
  const reassignOrder = useReassignOrder()
  const cancelOrder = useCancelOrder()

  function handleClose() {
    navigate('/dispatcher')
  }

  function handleStartEdit() {
    if (!order) return
    setEditState({
      pickupAddress: order.pickupAddress,
      pickupLat: order.pickupLat,
      pickupLng: order.pickupLng,
      dropoffAddress: order.dropoffAddress ?? '',
      dropoffLat: order.dropoffLat,
      dropoffLng: order.dropoffLng,
      note: order.note ?? '',
      passengers: order.passengers,
      scheduledAt: isoToDateTimeLocal(order.scheduledAt),
    })
    setIsEditing(true)
    setShowConflict(false)
  }

  function handleSave() {
    if (!order || !orderId) return
    const patchFields = buildPatchFields(
      {
        pickupAddress: order.pickupAddress,
        pickupLat: order.pickupLat,
        pickupLng: order.pickupLng,
        dropoffAddress: order.dropoffAddress,
        dropoffLat: order.dropoffLat,
        dropoffLng: order.dropoffLng,
        note: order.note,
        passengers: order.passengers,
        scheduledAt: order.scheduledAt,
      },
      editState,
    )
    updateOrder({
      orderId,
      version: order.version,
      fields: patchFields,
    })
  }

  function handleCancelEdit() {
    setIsEditing(false)
    setShowConflict(false)
  }

  function handleCancelSubmit() {
    if (!orderId) return
    if (!cancelReasonCode) {
      setCancelReasonError(true)
      return
    }
    setCancelReasonError(false)
    const reason = buildCancelReason(cancelReasonCode as CancelReasonCode, cancelFreeText)
    cancelOrder.mutate(
      { orderId, reason },
      {
        onSuccess: () => {
          setShowCancelForm(false)
          setCancelReasonCode('')
          setCancelFreeText('')
        },
        onError: (err) => {
          const apiErr = err as { status?: number }
          if (apiErr?.status === 409) {
            setShowConflict(true)
            setShowCancelForm(false)
          }
        },
      },
    )
  }

  function handleTransitionAction(action: string, payload?: { driverId?: string }) {
    if (!orderId) return
    if (action === 'assign' || action === 'reassign') {
      const driverId = payload?.driverId
      if (!driverId) {
        setActivePickerAction(action)
        return
      }
      const onError = (err: Error) => {
        const apiErr = err as { status?: number }
        if (apiErr?.status === 409) {
          setShowConflict(true)
        }
      }
      if (action === 'assign') {
        assignOrder.mutate({ orderId, driverId }, { onError })
      } else {
        reassignOrder.mutate({ orderId, driverId }, { onError })
      }
    }
  }

  const editable = order ? isOrderEditable(order.status) : false
  const buttons = order ? deriveTransitionButtons(order.allowedActions) : []

  // Filter out cancel from transition buttons since we handle it separately inline
  const nonCancelButtons = buttons.filter(b => b.action !== 'cancel')
  const hasCancelAction = buttons.some(b => b.action === 'cancel')

  return (
    <Overlay onClick={handleClose} role="dialog" aria-modal="true" aria-label={t('orders.drawer.title')}>
      <DrawerPanel onClick={(e) => e.stopPropagation()}>
        <DrawerHeader>
          <DrawerTitle>
            {order ? `${t('orders.drawer.title')} #${order.publicCode}` : t('orders.drawer.title')}
          </DrawerTitle>
          <CloseButton onClick={handleClose} aria-label={t('orders.drawer.close')}>
            ×
          </CloseButton>
        </DrawerHeader>

        <DrawerBody>
          {isLoading && <LoadingMessage>{t('orders.loading')}</LoadingMessage>}

          {!isLoading && !order && (
            <LoadingMessage>{t('orders.notFound')}</LoadingMessage>
          )}

          {order && (
            <>
              {showConflict && (
                <ConflictBanner role="alert">
                  {t('orders.drawer.conflict')}
                </ConflictBanner>
              )}

              {/* Editable fields */}
              <Section>
                <SectionTitle>{t('orders.drawer.fields.pickup')}</SectionTitle>
                {isEditing ? (
                  <AddressEditInput
                    value={editState.pickupAddress}
                    onChange={(val) => setEditState(s => ({ ...s, pickupAddress: val, pickupLat: null, pickupLng: null }))}
                    onSelect={(item) => setEditState(s => ({ ...s, pickupAddress: item.name, pickupLat: item.lat, pickupLng: item.lng }))}
                    aria-label={t('orders.drawer.fields.pickup')}
                  />
                ) : (
                  <>
                    <FieldValue>{order.pickupAddress}</FieldValue>
                    {orderHasNoCoords(order) && (
                      <NoCoordsWarning>
                        <span aria-hidden="true">⚠</span> {t('map.noCoords')}
                      </NoCoordsWarning>
                    )}
                  </>
                )}
              </Section>

              <Section>
                <SectionTitle>{t('orders.drawer.fields.dropoff')}</SectionTitle>
                {isEditing ? (
                  <AddressEditInput
                    value={editState.dropoffAddress}
                    onChange={(val) => setEditState(s => ({ ...s, dropoffAddress: val, dropoffLat: null, dropoffLng: null }))}
                    onSelect={(item) => setEditState(s => ({ ...s, dropoffAddress: item.name, dropoffLat: item.lat, dropoffLng: item.lng }))}
                    aria-label={t('orders.drawer.fields.dropoff')}
                  />
                ) : (
                  <FieldValue>{order.dropoffAddress ?? '—'}</FieldValue>
                )}
              </Section>

              <Section>
                <SectionTitle>{t('orders.drawer.fields.note')}</SectionTitle>
                {isEditing ? (
                  <FieldTextArea
                    value={editState.note}
                    onChange={(e) => setEditState(s => ({ ...s, note: e.target.value }))}
                    aria-label={t('orders.drawer.fields.note')}
                  />
                ) : (
                  <FieldValue>{order.note ?? '—'}</FieldValue>
                )}
              </Section>

              <Section>
                <SectionTitle>{t('orders.drawer.fields.passengers')}</SectionTitle>
                {isEditing ? (
                  <FieldInput
                    type="number"
                    min={1}
                    max={9}
                    value={editState.passengers}
                    onChange={(e) => setEditState(s => ({ ...s, passengers: Number(e.target.value) }))}
                    aria-label={t('orders.drawer.fields.passengers')}
                  />
                ) : (
                  <FieldValue>{order.passengers}</FieldValue>
                )}
              </Section>

              <Section>
                <SectionTitle>{t('orders.drawer.fields.scheduledAt')}</SectionTitle>
                {isEditing ? (
                  <FieldInput
                    type="datetime-local"
                    value={editState.scheduledAt}
                    onChange={(e) => setEditState(s => ({ ...s, scheduledAt: e.target.value }))}
                    aria-label={t('orders.drawer.fields.scheduledAt')}
                  />
                ) : (
                  <FieldValue>
                    {order.scheduledAt
                      ? new Date(order.scheduledAt).toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' })
                      : t('board.order.asap')}
                  </FieldValue>
                )}
              </Section>

              {/* Edit / Save / Cancel buttons */}
              <ButtonRow>
                {!isEditing && editable && (
                  <ActionButton $variant="secondary" onClick={handleStartEdit}>
                    {t('orders.drawer.edit')}
                  </ActionButton>
                )}
                {isEditing && (
                  <>
                    <ActionButton
                      $variant="primary"
                      onClick={handleSave}
                      disabled={isSaving}
                    >
                      {isSaving ? t('orders.drawer.saving') : t('orders.drawer.save')}
                    </ActionButton>
                    <ActionButton $variant="secondary" onClick={handleCancelEdit} disabled={isSaving}>
                      {t('orders.drawer.cancel')}
                    </ActionButton>
                  </>
                )}
                {!editable && !isEditing && (
                  <FieldValue style={{ fontSize: '12px', color: '#5f6368' }}>
                    {t('orders.drawer.editableStatuses')}
                  </FieldValue>
                )}
              </ButtonRow>

              {/* Transition action buttons from allowedActions (except cancel) */}
              {nonCancelButtons.length > 0 && (
                <Section>
                  <SectionTitle>{t('orders.actions.title')}</SectionTitle>
                  <ButtonRow>
                    {nonCancelButtons.map((btn) => (
                      <ActionButton
                        key={btn.action}
                        $variant="secondary"
                        onClick={() => {
                          if (btn.needsDriverPicker) {
                            setActivePickerAction(btn.action)
                          } else {
                            void handleTransitionAction(btn.action)
                          }
                        }}
                      >
                        {btn.label}
                      </ActionButton>
                    ))}
                  </ButtonRow>
                </Section>
              )}

              {/* Cancel action — inline form, no window.prompt */}
              {hasCancelAction && (
                <Section>
                  {!showCancelForm ? (
                    <ActionButton
                      $variant="danger"
                      onClick={() => setShowCancelForm(true)}
                    >
                      {t('board.actions.cancel')}
                    </ActionButton>
                  ) : (
                    <CancelForm aria-label="cancel-form">
                      <label htmlFor="drawer-cancel-reason">
                        {t('board.cancelReasons.title')}
                      </label>
                      <ReasonSelect
                        id="drawer-cancel-reason"
                        value={cancelReasonCode}
                        onChange={(e) => {
                          setCancelReasonCode(e.target.value as CancelReasonCode | '')
                          setCancelReasonError(false)
                        }}
                        aria-label={t('board.cancelReasons.title')}
                      >
                        <option value="">— {t('board.cancelReasons.title')} —</option>
                        {CANCEL_REASON_CODES.map((code) => (
                          <option key={code} value={code}>{t(`board.cancelReasons.${code}`, code)}</option>
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

                      <ButtonRow>
                        <ActionButton
                          $variant="danger"
                          onClick={handleCancelSubmit}
                          aria-label={t('board.actions.confirm')}
                        >
                          {t('board.actions.confirm')}
                        </ActionButton>
                        <ActionButton
                          $variant="secondary"
                          onClick={() => {
                            setShowCancelForm(false)
                            setCancelReasonCode('')
                            setCancelFreeText('')
                            setCancelReasonError(false)
                          }}
                        >
                          {t('orders.drawer.cancel')}
                        </ActionButton>
                      </ButtonRow>
                    </CancelForm>
                  )}
                </Section>
              )}

              {/* Inline driver picker for assign/reassign */}
              {activePickerAction && (
                <DriverPicker
                  pickupLat={order.pickupLat}
                  pickupLng={order.pickupLng}
                  onSelect={(driver) => {
                    setActivePickerAction(null)
                    void handleTransitionAction(activePickerAction, { driverId: driver.driverId })
                  }}
                  onClose={() => setActivePickerAction(null)}
                />
              )}

              {/* Notifikace — sent/failed notification delivery status (UC-005 B2) */}
              <Section>
                <SectionTitle>{t('notifications.title')}</SectionTitle>
                <NotificationsSection notifications={order.notifications ?? []} />
              </Section>

              {/* Event timeline */}
              <Section>
                <SectionTitle>{t('orders.timeline.title')}</SectionTitle>
                <EventTimeline events={events ?? []} />
              </Section>
            </>
          )}
        </DrawerBody>
      </DrawerPanel>
    </Overlay>
  )
}
