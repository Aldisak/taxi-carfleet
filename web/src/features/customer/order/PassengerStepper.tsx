import { useTranslation } from 'react-i18next'
import { Stepper } from '../../../shared/ui/Stepper'
import { MIN_PASSENGERS, MAX_PASSENGERS, clampPassengers } from './orderForm'

/** Props for PassengerStepper. */
export interface PassengerStepperProps {
  value: number
  onChange: (value: number) => void
}

/**
 * 1–4 passenger stepper (spec §2), restyled onto the shared UI-kit Stepper (UC-020 WI-2). The pure
 * orderForm clamp is still applied to the emitted value; the shared Stepper disables the − / +
 * buttons at the bounds and carries the existing i18n aria-labels (rules/web-accessibility.md).
 */
export function PassengerStepper({ value, onChange }: PassengerStepperProps) {
  const { t } = useTranslation()

  return (
    <Stepper
      value={value}
      min={MIN_PASSENGERS}
      max={MAX_PASSENGERS}
      onChange={(v) => onChange(clampPassengers(v))}
      decrementLabel={t('customer.order.passengersDecrease')}
      incrementLabel={t('customer.order.passengersIncrease')}
      ariaLabel={t('customer.order.passengersLabel')}
    />
  )
}
