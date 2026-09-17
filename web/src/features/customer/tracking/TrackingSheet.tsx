import { useState, type ReactNode } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { BottomSheet } from '../../../shared/ui/BottomSheet'
import { SearchingLoader } from '../../../shared/ui/SearchingLoader'
import { CancelDialog } from './CancelDialog'
import type { HeadlineDescriptor, TrackVm } from './headlineRules'
import type { UseCancelOrderResult } from './useCancelOrder'

/** cs-CZ grouped integer formatter so the price reads "1 200" (the " Kč" lives in the i18n template). */
const czkGrouped = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 })

const HeadlineBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`

const Headline = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.3;
`

const Vehicle = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.text};
`

const Secondary = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const CancelButton = styled.button`
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.min};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.error};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.error};
    outline-offset: 2px;
  }
`

const ReorderLink = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.min};
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.textOnPrimary};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  text-decoration: none;

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.text};
    outline-offset: 2px;
  }
`

const ErrorText = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.error};
`

/** Props for the presentational tracking sheet — the page owns all data + the cancel mutation. */
export interface TrackingSheetProps {
  /** Normalized tracking view-model (mode-agnostic — authed live or public DTO). */
  vm: TrackVm
  /** WI-1 headline descriptor (phase discriminant + flags + i18n key/values). */
  descriptor: HeadlineDescriptor
  /** The order id, or null in public/no-id mode (gates the Cancel button). */
  orderId: string | null
  /** Cancel state + callback injected from the page's useCancelOrder — never called here directly. */
  cancel: UseCancelOrderResult
  /** Authed-only rating form injected on the Completed phase; absent → default ratingSeam. */
  ratingSlot?: ReactNode
}

/**
 * The status-driven customer tracking bottom sheet (UC-016 WI-2). A CONTROLLED presentational
 * surface inside the shared BottomSheet — no api-client import, no data fetching. It switches its
 * content on `descriptor.phase` (searching/assigned/arrived/inProgress/completed/cancelled) and
 * always renders the descriptor headline as an aria-live=polite `<h2>` so the e2e can locate status
 * via getByRole('heading', { name }) (the exact strings are load-bearing).
 *
 * Cancel is offered only when the descriptor allows it AND an orderId is present; it opens the
 * reused CancelDialog driven by the injected useCancelOrder result (the page owns the mutation).
 * The rating slot (authed-only RatingForm) is injected on the Completed phase; when absent the
 * default ratingSeam text shows (public mode). It holds only local UI state (dialog open, expand).
 */
export function TrackingSheet({ vm, descriptor, orderId, cancel, ratingSlot }: TrackingSheetProps) {
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

  function handleClose() {
    // Escape closes the sheet (the sheet is always collapsed — no expand control exists).
    setOpen(false)
  }

  return (
    <BottomSheet open={open} expanded={false} ariaLabelKey="customer.tracking.sheetLabel" onClose={handleClose}>
      <HeadlineBlock aria-live="polite">
        <Headline>{t(descriptor.key, values)}</Headline>

        {descriptor.phase === 'searching' && <SearchingLoader />}

        {descriptor.phase === 'assigned' && vehicle && (
          <Vehicle>
            {t('customer.tracking.vehicleLabel')}: {vehicle}
          </Vehicle>
        )}

        {descriptor.phase === 'arrived' && vehicle && (
          <Vehicle>
            {t('customer.tracking.vehicleLabel')}: {vehicle}
          </Vehicle>
        )}

        {descriptor.phase === 'inProgress' && vm.dropoffAddress && (
          <Secondary>
            {t('customer.tracking.dropoffLabel')}: {vm.dropoffAddress}
          </Secondary>
        )}

        {descriptor.phase === 'completed' && vm.dropoffAddress && (
          <Secondary>
            {t('customer.tracking.dropoffLabel')}: {vm.dropoffAddress}
          </Secondary>
        )}

        {descriptor.showRating && (ratingSlot ?? <Secondary>{t('customer.tracking.ratingSeam')}</Secondary>)}
      </HeadlineBlock>

      {canCancel && (
        <CancelButton type="button" onClick={() => setShowCancelDialog(true)}>
          {t('customer.tracking.cancel')}
        </CancelButton>
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
