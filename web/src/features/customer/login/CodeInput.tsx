import { useEffect, useRef } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { isValidCode } from './phoneNormalize'

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
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  letter-spacing: 0.4em;
  text-align: center;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.surface};
  box-sizing: border-box;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 1px;
  }
`

const Hint = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

/** Props for CodeInput. */
export interface CodeInputProps {
  value: string
  onChange: (v: string) => void
  /** Called once the field reaches 6 digits (auto-submit). */
  onComplete: (code: string) => void
  disabled?: boolean
}

/**
 * 6-digit OTP field. Restricts input to digits, caps at 6, and auto-submits the
 * moment a 6-digit code is present (spec §Login step).
 */
export function CodeInput({ value, onChange, onComplete, disabled }: CodeInputProps) {
  const { t } = useTranslation()
  const submittedFor = useRef<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Move focus to the code field when it appears (the user just asked for a code).
  // Programmatic focus rather than the autoFocus prop (jsx-a11y/no-autofocus).
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (isValidCode(value) && submittedFor.current !== value) {
      submittedFor.current = value
      onComplete(value)
    }
    if (!isValidCode(value)) {
      submittedFor.current = null
    }
  }, [value, onComplete])

  function handleChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 6)
    onChange(digits)
  }

  return (
    <Field>
      <Label htmlFor="customer-code">{t('customer.login.codeLabel')}</Label>
      <Input
        ref={inputRef}
        id="customer-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        onChange={e => handleChange(e.target.value)}
        disabled={disabled}
      />
      <Hint>{t('customer.login.codeHint')}</Hint>
    </Field>
  )
}
