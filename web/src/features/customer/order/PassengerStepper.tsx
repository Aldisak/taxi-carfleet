import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { MIN_PASSENGERS, MAX_PASSENGERS, clampPassengers } from './orderForm'

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
`

const StepButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${({ theme }) => theme.touchTargets.min};
  height: ${({ theme }) => theme.touchTargets.min};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`

const Count = styled.span`
  min-width: 2ch;
  text-align: center;
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

/** Props for PassengerStepper. */
export interface PassengerStepperProps {
  value: number
  onChange: (value: number) => void
}

/**
 * 1–4 passenger stepper (spec §2). Clamps via the pure orderForm helper; the buttons
 * disable at the bounds and carry i18n aria-labels (rules/web-accessibility.md).
 */
export function PassengerStepper({ value, onChange }: PassengerStepperProps) {
  const { t } = useTranslation()

  return (
    <Row>
      <StepButton
        type="button"
        aria-label={t('customer.order.passengersDecrease')}
        disabled={value <= MIN_PASSENGERS}
        onClick={() => onChange(clampPassengers(value - 1))}
      >
        −
      </StepButton>
      <Count aria-live="polite">{value}</Count>
      <StepButton
        type="button"
        aria-label={t('customer.order.passengersIncrease')}
        disabled={value >= MAX_PASSENGERS}
        onClick={() => onChange(clampPassengers(value + 1))}
      >
        +
      </StepButton>
    </Row>
  )
}
