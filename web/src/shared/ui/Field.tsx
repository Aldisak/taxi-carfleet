import { type InputHTMLAttributes, type ReactNode } from 'react'
import styled from 'styled-components'

/**
 * Props for the shared {@link Field} — a labelled 56px text input with optional
 * leading icon, prefix slot and error state. Presentational only: all user-facing
 * text (label, error) is supplied by the caller. Pass-through native input
 * attributes (`type`, `placeholder`, `inputMode`, `autoComplete`, `disabled`).
 */
export interface FieldProps
  extends Pick<
    InputHTMLAttributes<HTMLInputElement>,
    'type' | 'placeholder' | 'inputMode' | 'autoComplete' | 'disabled'
  > {
  /** Unique id — wires `<label htmlFor>` to the input and the error `aria-describedby`. */
  id: string
  /** Visible field label. */
  label: string
  /** Current input value (controlled). */
  value: string
  /** Called with the new value on every keystroke. */
  onChange: (v: string) => void
  /** Optional decorative icon rendered at the leading edge (a ReactNode slot). */
  leadingIcon?: ReactNode
  /** Optional prefix slot rendered before the input, e.g. a `"+420"` label. */
  prefix?: ReactNode
  /** When set, shows a danger border + error message and wires `aria-invalid`/`aria-describedby`. */
  error?: string
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const Label = styled.label`
  font-size: var(--fs-label);
  font-weight: var(--fw-bold);
  color: var(--ink-2);
`

const Control = styled.div<{ $hasError: boolean; $disabled: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 56px;
  padding: 0 14px;
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: ${({ $hasError }) =>
    $hasError ? '2px solid var(--danger)' : '1px solid transparent'};
  opacity: ${({ $disabled }) => ($disabled ? 0.6 : 1)};

  &:focus-within {
    background: var(--surface);
    border: ${({ $hasError }) =>
      $hasError ? '2px solid var(--danger)' : '2px solid var(--ink)'};
  }
`

const IconSlot = styled.span`
  display: inline-flex;
  align-items: center;
  color: var(--ink-3);
`

const Prefix = styled.span`
  display: inline-flex;
  align-items: center;
  font-size: var(--fs-body);
  font-weight: var(--fw-bold);
  color: var(--ink-2);
`

const Input = styled.input`
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border: none;
  background: transparent;
  outline: none;
  font-family: inherit;
  font-size: var(--fs-body-lg);
  font-weight: var(--fw-regular);
  color: var(--ink);

  &::placeholder {
    color: var(--ink-3);
  }
`

const ErrorText = styled.small`
  font-size: var(--fs-caption);
  font-weight: var(--fw-bold);
  color: var(--danger);
`

/** A labelled text input with leading-icon and prefix slots plus an error state. */
export function Field({
  id,
  label,
  value,
  onChange,
  leadingIcon,
  prefix,
  error,
  disabled,
  ...rest
}: FieldProps): JSX.Element {
  const hasError = error !== undefined && error !== ''
  const errorId = `${id}-error`

  return (
    <Wrapper>
      <Label htmlFor={id}>{label}</Label>
      <Control $hasError={hasError} $disabled={disabled === true}>
        {leadingIcon !== undefined && <IconSlot aria-hidden="true">{leadingIcon}</IconSlot>}
        {prefix !== undefined && <Prefix aria-hidden="true">{prefix}</Prefix>}
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : undefined}
          {...rest}
        />
      </Control>
      {hasError && (
        <ErrorText id={errorId} role="alert">
          {error}
        </ErrorText>
      )}
    </Wrapper>
  )
}
