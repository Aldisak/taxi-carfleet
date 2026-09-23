import {
  type LabelHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type InputHTMLAttributes,
} from 'react'
import styled from 'styled-components'

/** Props for the {@link Lbl} — a desktop field label (12/700) placed above a {@link Ctrl}. */
export interface LblProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /** The `id` of the control this label describes (wired via `htmlFor`). */
  htmlFor: string
  /** Visible label text. */
  children: ReactNode
}

/** Props for the {@link Ctrl} — a compact 40px desktop form field (text input or select). */
export interface CtrlProps
  extends Pick<
    InputHTMLAttributes<HTMLInputElement>,
    'type' | 'placeholder' | 'inputMode' | 'autoComplete' | 'disabled' | 'name'
  > {
  /** Unique id — wired to a {@link Lbl} via `htmlFor` and the error `aria-describedby`. */
  id: string
  /** Current value (controlled). */
  value: string
  /** Called with the new value on change. */
  onChange: (v: string) => void
  /** Render a `<select>` instead of a text `<input>`. */
  as?: 'input' | 'select'
  /** `<option>` elements when {@link as} is `'select'`. */
  children?: ReactNode
  /** Optional leading icon slot (decorative). */
  leadingIcon?: ReactNode
  /** When set, shows a danger border + caption and wires `aria-invalid`/`aria-describedby`. */
  error?: string
  /** Extra native select attributes forwarded when {@link as} is `'select'`. */
  selectProps?: SelectHTMLAttributes<HTMLSelectElement>
}

const Label = styled.label`
  display: block;
  margin-bottom: 4px;
  font-size: var(--fs-caption);
  font-weight: var(--fw-bold);
  color: var(--ink-2);
`

const Control = styled.div<{ $hasError: boolean; $disabled: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 10px;
  border-radius: var(--r-sm);
  background: var(--surface-2);
  border: ${({ $hasError }) =>
    $hasError ? '2px solid var(--danger)' : '1px solid var(--line)'};
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

const fieldReset = `
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border: none;
  background: transparent;
  outline: none;
  font-family: inherit;
  font-size: var(--fs-body);
  font-weight: var(--fw-regular);
  color: var(--ink);
`

const Input = styled.input`
  ${fieldReset}

  &::placeholder {
    color: var(--ink-3);
  }
`

const Select = styled.select`
  ${fieldReset}
  cursor: pointer;
`

const ErrorText = styled.small`
  display: block;
  margin-top: 4px;
  font-size: var(--fs-caption);
  font-weight: var(--fw-bold);
  color: var(--danger);
`

/** A desktop field label placed above its control. */
export function Lbl({ htmlFor, children, ...rest }: LblProps): JSX.Element {
  return (
    <Label htmlFor={htmlFor} {...rest}>
      {children}
    </Label>
  )
}

/** A compact 40px desktop form control (text input or select) with icon and error slots. */
export function Ctrl({
  id,
  value,
  onChange,
  as = 'input',
  children,
  leadingIcon,
  error,
  disabled,
  selectProps,
  ...rest
}: CtrlProps): JSX.Element {
  const hasError = error !== undefined && error !== ''
  const errorId = `${id}-error`

  return (
    <div>
      <Control $hasError={hasError} $disabled={disabled === true}>
        {leadingIcon !== undefined && <IconSlot aria-hidden="true">{leadingIcon}</IconSlot>}
        {as === 'select' ? (
          <Select
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            aria-invalid={hasError || undefined}
            aria-describedby={hasError ? errorId : undefined}
            {...selectProps}
          >
            {children}
          </Select>
        ) : (
          <Input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            aria-invalid={hasError || undefined}
            aria-describedby={hasError ? errorId : undefined}
            {...rest}
          />
        )}
      </Control>
      {hasError && (
        <ErrorText id={errorId} role="alert">
          {error}
        </ErrorText>
      )}
    </div>
  )
}
