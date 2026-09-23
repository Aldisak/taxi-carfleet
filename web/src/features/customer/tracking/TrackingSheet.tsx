import { useState, type ReactNode } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { BottomSheet } from '../../../shared/ui/BottomSheet'
import { SearchingLoader } from '../../../shared/ui/SearchingLoader'
import { Pill } from '../../../shared/ui/Pill'
import { Plate } from '../../../shared/ui/Plate'
import { DriverCard } from '../../../shared/ui/DriverCard'
import { Callout } from '../../../shared/ui/Callout'
import { Button } from '../../../shared/ui/Button'
import { Icon } from '../../../shared/ui/icons/Icon'
import { CancelDialog } from './CancelDialog'
import type { HeadlineDescriptor, TrackVm } from './headlineRules'
import type { UseCancelOrderResult } from './useCancelOrder'

/** cs-CZ grouped integer formatter so the price reads "1 200" (the " Kč" lives in the i18n template). */
const czkGrouped = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 })

const HeadlineBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const Headline = styled.h2`
  margin: 0;
  font-size: var(--fs-title);
  font-weight: var(--fw-extra);
  color: var(--ink);
  line-height: 1.3;
`

const Caption = styled.p`
  margin: 0;
  font-size: var(--fs-caption);
  color: var(--ink-2);
`

const Secondary = styled.p`
  margin: 0;
  font-size: var(--fs-body);
  color: var(--ink-2);
`

const PillRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`

const PlateRow = styled.div`
  display: flex;
  justify-content: center;
  padding: 8px 0;
`

const CompletedHead = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--success);
`

const CancelledHead = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--danger);
`

const ReorderLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 56px;
  padding: 0 20px;
  background: var(--accent);
  color: var(--on-accent);
  border-radius: var(--r-md);
  font-size: var(--fs-body-lg);
  font-weight: var(--fw-extra);
  text-decoration: none;

  &:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
`

const ErrorText = styled.p`
  margin: 0;
  font-size: var(--fs-caption);
  font-weight: var(--fw-bold);
  color: var(--danger);
`

/** Props for the presentational tracking sheet — the page owns all data + the cancel mutation. */
export interface TrackingSheetProps {
  /** Normalized tracking view-model (mode-agnostic — authed live or public DTO). */
  vm: TrackVm
  /** WI-1 headline descriptor (phase discriminant + flags + i18n key/values). */
  descriptor: HeadlineDescriptor
  /** The order id, or null in public/no-id mode (gates the Cancel button). */
  orderId: string | null
  /** The public order code (shown as a Pill in the searching phase). */
  code?: string
  /** Cancel state + callback injected from the page's useCancelOrder — never called here directly. */
  cancel: UseCancelOrderResult
  /** Authed-only rating form injected on the Completed phase; absent → default ratingSeam. */
  ratingSlot?: ReactNode
}

/**
 * The status-driven customer tracking bottom sheet (UC-016 WI-2, restyled onto the shared UI kit
 * in UC-020 WI-4). A CONTROLLED presentational surface inside the shared BottomSheet — no
 * api-client import, no data fetching. It switches its content on `descriptor.phase`
 * (searching/assigned/arrived/inProgress/completed/cancelled) and always renders the descriptor
 * headline as an aria-live=polite `<h2>` so the e2e can locate status via
 * getByRole('heading', { name }) (the exact strings are load-bearing).
 *
 * Presentational blocks are composed from the kit (Pill, DriverCard, Plate, Callout, Button, Icon);
 * the phase→content mapping, the status→phase collapse, and every data flow are unchanged.
 *
 * Cancel is offered only when the descriptor allows it AND an orderId is present; it opens the
 * CancelDialog (a shared BottomSheet action sheet) driven by the injected useCancelOrder result
 * (the page owns the mutation). The rating slot (authed-only RatingForm) is injected on the
 * Completed phase; when absent the default ratingSeam text shows (public mode). It holds only local
 * UI state (dialog open).
 */
export function TrackingSheet({ vm, descriptor, orderId, code, cancel, ratingSlot }: TrackingSheetProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  const [showCancelDialog, setShowCancelDialog] = useState(false)

  // The " Kč" suffix lives in the i18n template — feed a cs-CZ grouped number, never formatCzk
  // (which would append a second " Kč"). Mirrors the StatusHeadline reference (CLAUDE.md).
  const values =
    typeof descriptor.values.price === 'number'
      ? { ...descriptor.values, price: czkGrouped.format(descriptor.values.price) }
      : descriptor.values

  const vehicle = [vm.vehicleColor, vm.vehiclePlate].filter(Boolean).join(' · ')
  const canCancel = descriptor.showCancel && orderId != null

  // watchFor is shown only when BOTH the vehicle colour AND the plate exist (the {{vehicle}} slot is
  // the car descriptor — the colour — never the plate; the plate goes solely in the {{plate}} slot).
  // paymentNote is shown only when the price is known.
  const hasVehicleAndPlate = Boolean(vm.vehicleColor && vm.vehiclePlate)
  const priceFormatted = vm.priceCzk != null ? `${czkGrouped.format(vm.priceCzk)} Kč` : null

  function handleClose() {
    // Escape closes the sheet (the sheet is always collapsed — no expand control exists).
    setOpen(false)
  }

  return (
    <BottomSheet open={open} snap="collapsed" ariaLabelKey="customer.tracking.sheetLabel" onClose={handleClose}>
      <HeadlineBlock aria-live="polite">
        {descriptor.phase === 'completed' ? (
          <CompletedHead>
            <Icon name="check" aria-hidden />
            <Headline>{t(descriptor.key, values)}</Headline>
          </CompletedHead>
        ) : descriptor.phase === 'cancelled' ? (
          <CancelledHead>
            <Icon name="close" aria-hidden />
            <Headline>{t(descriptor.key, values)}</Headline>
          </CancelledHead>
        ) : (
          <Headline>{t(descriptor.key, values)}</Headline>
        )}

        {descriptor.phase === 'searching' && (
          <>
            <SearchingLoader />
            <Caption>{t('customer.tracking.searchingHint')}</Caption>
            {code && (
              <PillRow>
                <Pill tone="neutral">
                  {t('customer.tracking.codeLabel')}: {code}
                </Pill>
              </PillRow>
            )}
          </>
        )}

        {descriptor.phase === 'assigned' && (
          <>
            {vm.driverFirstName && (
              <DriverCard
                name={vm.driverFirstName}
                vehicle={vm.vehicleColor ?? undefined}
                plate={vm.vehiclePlate ?? undefined}
              />
            )}
            {(hasVehicleAndPlate || priceFormatted) && (
              <Callout tone="neutral">
                {hasVehicleAndPlate &&
                  t('customer.tracking.watchFor', { vehicle: vm.vehicleColor, plate: vm.vehiclePlate })}
                {hasVehicleAndPlate && priceFormatted ? ' ' : ''}
                {priceFormatted && t('customer.tracking.paymentNote', { price: priceFormatted })}
              </Callout>
            )}
          </>
        )}

        {descriptor.phase === 'arrived' && (
          <>
            <PillRow>
              <Pill tone="success">{t('customer.tracking.pillArrived')}</Pill>
            </PillRow>
            {vm.vehiclePlate ? (
              <PlateRow>
                <Plate size="lg">{vm.vehiclePlate}</Plate>
              </PlateRow>
            ) : (
              vehicle && (
                <Secondary>
                  {t('customer.tracking.vehicleLabel')}: {vehicle}
                </Secondary>
              )
            )}
          </>
        )}

        {descriptor.phase === 'inProgress' && (
          <>
            <PillRow>
              <Pill tone="info">{t('customer.tracking.pillInProgress')}</Pill>
            </PillRow>
            {vm.dropoffAddress && (
              <Secondary>
                {t('customer.tracking.dropoffLabel')}: {vm.dropoffAddress}
              </Secondary>
            )}
            {priceFormatted && (
              <Secondary>
                {t('customer.tracking.priceLabel')}: {priceFormatted}
              </Secondary>
            )}
          </>
        )}

        {descriptor.phase === 'completed' && vm.dropoffAddress && (
          <Secondary>
            {t('customer.tracking.dropoffLabel')}: {vm.dropoffAddress}
          </Secondary>
        )}

        {descriptor.showRating && (ratingSlot ?? <Secondary>{t('customer.tracking.ratingSeam')}</Secondary>)}
      </HeadlineBlock>

      {canCancel && (
        <Button variant="dangerGhost" fullWidth onClick={() => setShowCancelDialog(true)}>
          {t('customer.tracking.cancel')}
        </Button>
      )}

      {cancel.errorKey && !showCancelDialog && <ErrorText role="alert">{t(cancel.errorKey)}</ErrorText>}

      {descriptor.phase === 'cancelled' && <ReorderLink to="/customer">{t('customer.tracking.reorder')}</ReorderLink>}

      {showCancelDialog && (
        <CancelDialog
          showAcceptedHint={descriptor.showAcceptedHint}
          isPending={cancel.isPending}
          errorKey={cancel.errorKey}
          onConfirm={() => {
            // Branch on the returned outcome (NOT the captured errorKey — a stale closure): close
            // only on success, keep the dialog open on failure so its in-dialog error shows.
            void cancel.cancel().then((ok) => {
              if (ok) setShowCancelDialog(false)
            })
          }}
          onDismiss={() => setShowCancelDialog(false)}
        />
      )}
    </BottomSheet>
  )
}
