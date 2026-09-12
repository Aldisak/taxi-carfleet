import styled from 'styled-components'
import { useTranslation } from 'react-i18next'

const Group = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`

const Toggle = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`

const ToggleButton = styled.button<{ $active: boolean }>`
  flex: 1;
  min-height: ${({ theme }) => theme.touchTargets.min};
  background: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.surface)};
  color: ${({ theme, $active }) => ($active ? '#ffffff' : theme.colors.text)};
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`

const DateInput = styled.input`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
`

const Label = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

/** "Hned" vs "Na čas" selection. */
export type WhenMode = 'now' | 'scheduled'

/** Props for WhenPicker. */
export interface WhenPickerProps {
  mode: WhenMode
  onModeChange: (mode: WhenMode) => void
  /** datetime-local value (empty when none chosen yet). */
  scheduledAt: string
  onScheduledAtChange: (value: string) => void
  /** Minimum selectable value (datetime-local format). */
  min: string
  /** Maximum selectable value (datetime-local format). */
  max: string
}

/**
 * "Kdy" picker: Hned (default) or Na čas with a datetime-local input bounded to
 * +20 min … +7 days (spec §2). Bounds are enforced by the pure whenRules.ts module;
 * the input min/max are a UX affordance, not the source of truth.
 */
export function WhenPicker({ mode, onModeChange, scheduledAt, onScheduledAtChange, min, max }: WhenPickerProps) {
  const { t } = useTranslation()

  return (
    <Group>
      <Label as="label" id="when-label">{t('customer.order.whenLabel')}</Label>
      <Toggle role="group" aria-labelledby="when-label">
        <ToggleButton type="button" $active={mode === 'now'} aria-pressed={mode === 'now'} onClick={() => onModeChange('now')}>
          {t('customer.order.whenNow')}
        </ToggleButton>
        <ToggleButton type="button" $active={mode === 'scheduled'} aria-pressed={mode === 'scheduled'} onClick={() => onModeChange('scheduled')}>
          {t('customer.order.whenScheduled')}
        </ToggleButton>
      </Toggle>
      {mode === 'scheduled' && (
        <DateInput
          type="datetime-local"
          aria-label={t('customer.order.scheduledAtLabel')}
          value={scheduledAt}
          min={min}
          max={max}
          onChange={e => onScheduledAtChange(e.target.value)}
        />
      )}
    </Group>
  )
}
