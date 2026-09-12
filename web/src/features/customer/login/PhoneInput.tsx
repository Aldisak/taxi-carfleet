import styled from 'styled-components'
import { useTranslation } from 'react-i18next'

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`

const Label = styled.label`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.text};
`

const Input = styled.input`
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.surface};
  box-sizing: border-box;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 1px;
  }
`

/** Props for PhoneInput. */
export interface PhoneInputProps {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}

/** Phone number field with a +420 Czech default (normalized on submit). */
export function PhoneInput({ value, onChange, disabled }: PhoneInputProps) {
  const { t } = useTranslation()
  return (
    <Field>
      <Label htmlFor="customer-phone">{t('customer.login.phoneLabel')}</Label>
      <Input
        id="customer-phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder={t('customer.login.phonePlaceholder')}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
      />
    </Field>
  )
}
