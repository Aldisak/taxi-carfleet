import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { BottomSheet } from '../../../shared/ui/BottomSheet'
import { Button } from '../../../shared/ui/Button'
import { Field } from '../../../shared/ui/Field'
import { Icon } from '../../../shared/ui/icons/Icon'
import { WhenPicker, type WhenMode } from './WhenPicker'
import { PassengerStepper } from './PassengerStepper'
import { minScheduledAt, maxScheduledAt } from './whenRules'

const Title = styled.h2`
  margin: 0;
  font-size: var(--fs-headline);
  font-weight: var(--fw-extra);
  color: var(--ink);
`

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const SectionLabel = styled.span`
  font-size: var(--fs-label);
  font-weight: var(--fw-bold);
  color: var(--ink-2);
`

const Caption = styled.span`
  font-size: var(--fs-caption);
  color: var(--ink-2);
`

/** Props for OptionsSheet — a controlled surface; the parent (PriceSheet) owns the state. */
export interface OptionsSheetProps {
  /** Whether the options sheet is shown. */
  open: boolean
  /** "Hned" vs "Na čas". */
  whenMode: WhenMode
  onWhenModeChange: (mode: WhenMode) => void
  /** datetime-local value for the scheduled pickup (empty when none). */
  scheduledAt: string
  onScheduledAtChange: (value: string) => void
  /** Passenger count (1..4). */
  passengers: number
  onPassengersChange: (value: number) => void
  /** The pickup note. */
  note: string
  onNoteChange: (value: string) => void
  /** Called by "Hotovo" or Escape — the parent collapses the sheet. */
  onDone: () => void
}

/**
 * The ride-options sheet (UC-020 WI-2) extracted from PriceSheet's former inline options block.
 * A BottomSheet (snap 'expanded') titled "Možnosti jízdy" that composes the restyled WhenPicker
 * (Segmented Hned/Na čas + datetime + caption), PassengerStepper (Stepper + "více cestujících"
 * caption) and a note Field. It is fully controlled — all state stays lifted in PriceSheet exactly
 * as before this restyle — and reports done via onDone (the "Hotovo" button and Escape both call it).
 * The pure whenRules min/max bounds are unchanged.
 */
export function OptionsSheet({
  open,
  whenMode,
  onWhenModeChange,
  scheduledAt,
  onScheduledAtChange,
  passengers,
  onPassengersChange,
  note,
  onNoteChange,
  onDone,
}: OptionsSheetProps) {
  const { t } = useTranslation()

  if (!open) return null

  return (
    <BottomSheet open snap="expanded" ariaLabelKey="customer.mapOrder.optionsToggle" onClose={onDone}>
      <Title>{t('customer.mapOrder.optionsToggle')}</Title>

      <WhenPicker
        mode={whenMode}
        onModeChange={onWhenModeChange}
        scheduledAt={scheduledAt}
        onScheduledAtChange={onScheduledAtChange}
        min={toLocalInput(minScheduledAt())}
        max={toLocalInput(maxScheduledAt())}
      />

      <Section>
        <SectionLabel>{t('customer.order.passengersLabel')}</SectionLabel>
        <PassengerStepper value={passengers} onChange={onPassengersChange} />
        <Caption>{t('customer.order.morePassengers')}</Caption>
      </Section>

      <Field
        id="options-note"
        label={t('customer.order.noteLabel')}
        placeholder={t('customer.order.notePlaceholder')}
        value={note}
        onChange={onNoteChange}
        leadingIcon={<Icon name="note" />}
      />

      <Button variant="primary" size="md" fullWidth onClick={onDone}>
        {t('customer.order.optionsDone')}
      </Button>
    </BottomSheet>
  )
}

/** Converts a Date to a datetime-local input value (local time, no seconds). */
function toLocalInput(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
