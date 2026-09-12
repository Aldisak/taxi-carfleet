import styled from 'styled-components'
import { useTranslation } from 'react-i18next'

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`

const Display = styled.output`
  display: block;
  text-align: right;
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  min-height: ${({ theme }) => theme.touchTargets.min};
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${({ theme }) => theme.spacing.sm};
`

const Key = styled.button`
  min-height: ${({ theme }) => theme.touchTargets.primary};
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  cursor: pointer;
`

interface NumericKeypadProps {
  value: number | null
  onChange: (value: number | null) => void
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/** Big numeric keypad for entering the final price (Estimate/Meter rides). */
export function NumericKeypad({ value, onChange }: NumericKeypadProps) {
  const { t } = useTranslation()

  function appendDigit(d: string) {
    const current = value == null ? '' : String(value)
    const next = current + d
    // Guard against runaway length; CZK fares never exceed 7 digits.
    if (next.length > 7) return
    onChange(Number(next))
  }

  function backspace() {
    const current = value == null ? '' : String(value)
    const next = current.slice(0, -1)
    onChange(next.length === 0 ? null : Number(next))
  }

  return (
    <Wrap>
      <Display aria-label={t('driver.complete.price')}>{value ?? ''}</Display>
      <Grid>
        {DIGITS.map(d => (
          <Key key={d} type="button" onClick={() => appendDigit(d)}>
            {d}
          </Key>
        ))}
        <Key type="button" onClick={() => appendDigit('0')}>0</Key>
        <Key type="button" aria-label={t('driver.complete.keypad.delete')} onClick={backspace}>
          ⌫
        </Key>
      </Grid>
    </Wrap>
  )
}
