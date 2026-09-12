import styled from 'styled-components'
import { useTranslation } from 'react-i18next'

/** PaymentType values accepted by the backend. */
export type PaymentType = 'Cash' | 'Card' | 'Invoice'

const Group = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`

const Toggle = styled.button<{ $selected: boolean }>`
  flex: 1;
  min-height: ${({ theme }) => theme.touchTargets.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  cursor: pointer;
  background: ${({ theme, $selected }) =>
    $selected ? theme.colors.primary : theme.colors.surface};
  color: ${({ theme, $selected }) =>
    $selected ? '#ffffff' : theme.colors.text};
  border: 2px solid
    ${({ theme, $selected }) => ($selected ? theme.colors.primary : theme.colors.border)};
`

interface PaymentTogglesProps {
  selected: string | null
  onSelect: (type: PaymentType) => void
}

const OPTIONS: Array<{ type: PaymentType; labelKey: string }> = [
  { type: 'Cash', labelKey: 'driver.complete.paymentCash' },
  { type: 'Card', labelKey: 'driver.complete.paymentCard' },
  { type: 'Invoice', labelKey: 'driver.complete.paymentInvoice' },
]

/** Three big payment-type toggles: Hotově / Kartou / Faktura. */
export function PaymentToggles({ selected, onSelect }: PaymentTogglesProps) {
  const { t } = useTranslation()
  return (
    <Group role="group" aria-label={t('driver.complete.paymentTitle')}>
      {OPTIONS.map(({ type, labelKey }) => (
        <Toggle
          key={type}
          type="button"
          $selected={selected === type}
          aria-pressed={selected === type}
          onClick={() => onSelect(type)}
        >
          {t(labelKey)}
        </Toggle>
      ))}
    </Group>
  )
}
