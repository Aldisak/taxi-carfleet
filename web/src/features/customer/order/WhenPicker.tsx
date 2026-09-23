import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { Segmented } from '../../../shared/ui/Segmented'

const Group = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const Label = styled.span`
  font-size: var(--fs-label);
  font-weight: var(--fw-bold);
  color: var(--ink-2);
`

const Caption = styled.span`
  font-size: var(--fs-caption);
  color: var(--ink-2);
`

// A datetime-local control styled to match the Kit's Field (the shared Field does not accept
// native min/max, and the +20 min … +7 day bounds are a real affordance here, so this stays a
// bespoke kit-styled input rather than the Field primitive). Real bound enforcement lives in the
// pure whenRules.ts — these attributes are the UX hint only.
const DateInput = styled.input`
  min-height: 56px;
  padding: 0 14px;
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid transparent;
  font-family: inherit;
  font-size: var(--fs-body-lg);
  color: var(--ink);

  &:focus-visible {
    outline: none;
    background: var(--surface);
    border: 2px solid var(--ink);
  }
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
 * "Kdy" picker: Hned (default) or Na čas with a datetime-local Field bounded to
 * +20 min … +7 days (spec §2). Restyled onto the UI kit (UC-020 WI-2): the Hned/Na čas toggle
 * is the shared Segmented control and the datetime input is the shared Field. Bounds are enforced
 * by the pure whenRules.ts module; the input min/max are a UX affordance, not the source of truth.
 * The pure rules and the accessible labels (aria-pressed toggle, "Datum a čas vyzvednutí") are
 * unchanged so the wiring in PriceSheet/OptionsSheet is untouched.
 */
export function WhenPicker({ mode, onModeChange, scheduledAt, onScheduledAtChange, min, max }: WhenPickerProps) {
  const { t } = useTranslation()

  return (
    <Group>
      <Label>{t('customer.order.whenLabel')}</Label>
      <Segmented
        ariaLabel={t('customer.order.whenLabel')}
        value={mode}
        onChange={(v) => onModeChange(v as WhenMode)}
        options={[
          { value: 'now', label: t('customer.order.whenNow') },
          { value: 'scheduled', label: t('customer.order.whenScheduled') },
        ]}
      />
      {mode === 'scheduled' && (
        <DateInput
          type="datetime-local"
          aria-label={t('customer.order.scheduledAtLabel')}
          value={scheduledAt}
          min={min}
          max={max}
          onChange={(e) => onScheduledAtChange(e.target.value)}
        />
      )}
      <Caption>{t('customer.order.whenCaption')}</Caption>
    </Group>
  )
}
