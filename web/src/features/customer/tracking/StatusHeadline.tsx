import type { ReactNode } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import type { HeadlineDescriptor, TrackVm } from './headlineRules'

const Wrapper = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.lg} ${({ theme }) => theme.spacing.md};
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

interface StatusHeadlineProps {
  descriptor: HeadlineDescriptor
  vm: TrackVm
  /** Rating prompt seam — B-rating renders its form here when descriptor.showRating is true. */
  ratingSlot?: ReactNode
}

/**
 * Renders the large one-line status headline plus the state-specific extras (vehicle on Arrived,
 * dropoff on InProgress, the rating seam on Completed). The headline string is composed here via
 * useTranslation from the structured descriptor (rules/web-react-style.md#i18n-czech-first).
 */
/** cs-CZ grouped integer formatter so the headline price reads "1 200" not "1200". */
const czkGrouped = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 })

export function StatusHeadline({ descriptor, vm, ratingSlot }: StatusHeadlineProps) {
  const { t } = useTranslation()

  const vehicle = [vm.vehicleColor, vm.vehiclePlate].filter(Boolean).join(' · ')

  // Format the CZK price with cs-CZ grouping before interpolation (the " Kč" suffix lives in the
  // i18n template); money must not render as a raw un-grouped number (rules/web-react-style.md).
  const values =
    typeof descriptor.values.price === 'number'
      ? { ...descriptor.values, price: czkGrouped.format(descriptor.values.price) }
      : descriptor.values

  return (
    <Wrapper aria-live="polite">
      <Headline>{t(descriptor.key, values)}</Headline>

      {descriptor.showVehicle && vehicle && (
        <Vehicle>
          {t('customer.tracking.vehicleLabel')}: {vehicle}
        </Vehicle>
      )}

      {descriptor.showDropoff && vm.dropoffAddress && (
        <Secondary>
          {t('customer.tracking.dropoffLabel')}: {vm.dropoffAddress}
        </Secondary>
      )}

      {descriptor.showRating && (ratingSlot ?? <Secondary>{t('customer.tracking.ratingSeam')}</Secondary>)}
    </Wrapper>
  )
}
