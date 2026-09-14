import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import type { RangePreset } from '../../../shared/date/analyticsRange'

/** Granularity options available for analytics queries. */
export type Granularity = 'day' | 'week' | 'month'

/** Props for the presentational AnalyticsControls component. */
export interface AnalyticsControlsProps {
  /** Currently selected date-range preset. */
  preset: RangePreset
  /** Called when the user selects a new preset from the dropdown. */
  onPresetChange: (preset: RangePreset) => void
  /** Currently active time granularity. */
  granularity: Granularity
  /** Called when the user clicks a granularity toggle button. */
  onGranularityChange: (g: Granularity) => void
  /** Whether the compare-to-previous-period toggle is active. */
  compare: boolean
  /** Called with the new boolean when the compare toggle is clicked. */
  onCompareChange: (compare: boolean) => void
}

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`

const Label = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const Select = styled.select`
  min-height: 36px;
  padding: 0 ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
`

const GranularityGroup = styled.div`
  display: flex;
  gap: 0;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  overflow: hidden;
`

const GranularityButton = styled.button<{ $active: boolean }>`
  min-height: 36px;
  padding: 0 ${({ theme }) => theme.spacing.md};
  background: ${({ theme, $active }) =>
    $active ? theme.colors.primary : theme.colors.surface};
  color: ${({ theme, $active }) =>
    $active ? theme.colors.textOnPrimary : theme.colors.text};
  border: none;
  border-right: 1px solid ${({ theme }) => theme.colors.border};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  cursor: pointer;

  &:last-child {
    border-right: none;
  }

  &:hover {
    background: ${({ theme, $active }) =>
      $active ? theme.colors.primaryDark : theme.colors.background};
  }
`

const CompareButton = styled.button<{ $active: boolean }>`
  min-height: 36px;
  padding: 0 ${({ theme }) => theme.spacing.md};
  background: ${({ theme, $active }) =>
    $active ? theme.colors.primary : theme.colors.surface};
  color: ${({ theme, $active }) =>
    $active ? theme.colors.textOnPrimary : theme.colors.text};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  cursor: pointer;

  &:hover {
    background: ${({ theme, $active }) =>
      $active ? theme.colors.primaryDark : theme.colors.background};
  }
`

const GRANULARITIES: Granularity[] = ['day', 'week', 'month']

/**
 * Presentational analytics toolbar: preset select, granularity toggle buttons,
 * and compare-to-previous-period toggle. All state is lifted to the parent via props.
 */
export function AnalyticsControls({
  preset,
  onPresetChange,
  granularity,
  onGranularityChange,
  compare,
  onCompareChange,
}: AnalyticsControlsProps) {
  const { t } = useTranslation()

  const PRESET_KEYS: RangePreset[] = [
    'dnes',
    '7dni',
    'tentoMesic',
    'minulyMesic',
    'kvartal',
    'rok',
    'vlastni',
  ]

  return (
    <Controls>
      <Label>
        {t('analytics.period.label')}
        <Select
          value={preset}
          onChange={e => onPresetChange(e.target.value as RangePreset)}
          aria-label={t('analytics.period.label')}
        >
          {PRESET_KEYS.map(key => (
            <option key={key} value={key}>
              {t(`analytics.ranges.${key}`)}
            </option>
          ))}
        </Select>
      </Label>

      <GranularityGroup role="group" aria-label={t('analytics.granularity.label')}>
        {GRANULARITIES.map(g => (
          <GranularityButton
            key={g}
            type="button"
            $active={granularity === g}
            aria-pressed={granularity === g}
            onClick={() => onGranularityChange(g)}
          >
            {t(`analytics.granularity.${g}`)}
          </GranularityButton>
        ))}
      </GranularityGroup>

      <CompareButton
        type="button"
        $active={compare}
        aria-pressed={compare}
        onClick={() => onCompareChange(!compare)}
      >
        {t('analytics.compare')}
      </CompareButton>
    </Controls>
  )
}
