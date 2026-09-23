import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import styled from 'styled-components'

/**
 * Props for the shared {@link CodeInput} — a row of separate single-digit boxes
 * for SMS one-time codes. Presentational only: the group's accessible name is a
 * required prop. Controlled: the parent owns the concatenated `value`.
 */
export interface CodeInputProps {
  /** The current code (concatenation of all box characters). */
  value: string
  /** Called with the new concatenated code whenever a box changes. */
  onChange: (v: string) => void
  /** Number of digit boxes. Defaults to 6. */
  length?: number
  /** Accessible name for the box group and the base of each box's own label. */
  ariaLabel: string
  /** Called with the full code once every box is filled. */
  onComplete?: (code: string) => void
  /** Disables every box. */
  disabled?: boolean
  /** Focuses the first box on mount. */
  autoFocus?: boolean
  /** Optional per-box accessible-name builder (index is 0-based). Overrides the numbered default. */
  boxLabel?: (index: number) => string
}

const Group = styled.div`
  display: flex;
  gap: 8px;
`

const Box = styled.input`
  width: 48px;
  height: 60px;
  padding: 0;
  text-align: center;
  border-radius: var(--r-md);
  border: 1px solid var(--line-strong);
  background: var(--surface-2);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--fs-headline);
  font-weight: var(--fw-bold);
  outline: none;

  &:focus {
    background: var(--surface);
    border: 2px solid var(--ink);
  }

  &:disabled {
    opacity: 0.6;
  }
`

/** Extract the single trailing digit character a user typed into a box. */
function lastDigit(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length > 0 ? digits[digits.length - 1] : ''
}

/** A 6-box (configurable) numeric code entry with focus-advance, backspace and paste. */
export function CodeInput({
  value,
  onChange,
  length = 6,
  ariaLabel,
  onComplete,
  disabled = false,
  autoFocus = false,
  boxLabel,
}: CodeInputProps): JSX.Element {
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const chars = Array.from({ length }, (_, i) => value[i] ?? '')

  const emit = (nextChars: string[]): void => {
    const next = nextChars.join('')
    onChange(next)
    if (next.replace(/\s/g, '').length === length && onComplete !== undefined) {
      onComplete(next)
    }
  }

  const focusBox = (index: number): void => {
    const clamped = Math.max(0, Math.min(length - 1, index))
    refs.current[clamped]?.focus()
  }

  const handleInput = (index: number, raw: string): void => {
    const digit = lastDigit(raw)
    if (digit === '') return
    const nextChars = [...chars]
    nextChars[index] = digit
    emit(nextChars)
    if (index < length - 1) focusBox(index + 1)
  }

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Backspace') {
      if (chars[index] === '') {
        // Empty box: step back and clear the previous box.
        if (index > 0) {
          const nextChars = [...chars]
          nextChars[index - 1] = ''
          emit(nextChars)
          focusBox(index - 1)
        }
        e.preventDefault()
      } else {
        const nextChars = [...chars]
        nextChars[index] = ''
        emit(nextChars)
      }
    } else if (e.key === 'ArrowLeft') {
      focusBox(index - 1)
    } else if (e.key === 'ArrowRight') {
      focusBox(index + 1)
    }
  }

  const handlePaste = (index: number, e: ClipboardEvent<HTMLInputElement>): void => {
    e.preventDefault()
    const digits = e.clipboardData.getData('text').replace(/\D/g, '')
    if (digits === '') return
    const nextChars = [...chars]
    for (let i = 0; i < digits.length && index + i < length; i++) {
      nextChars[index + i] = digits[i]
    }
    emit(nextChars)
    const filled = Math.min(index + digits.length, length - 1)
    focusBox(filled)
  }

  const labelFor = (i: number): string =>
    boxLabel !== undefined ? boxLabel(i) : `${ariaLabel} ${i + 1}`

  return (
    <Group role="group" aria-label={ariaLabel}>
      {chars.map((char, i) => (
        <Box
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={char}
          disabled={disabled}
          aria-label={labelFor(i)}
          // Focusing the first OTP box on mount is the expected SMS-code UX; caller opts in via autoFocus.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus && i === 0}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
        />
      ))}
    </Group>
  )
}
