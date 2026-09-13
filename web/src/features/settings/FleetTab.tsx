import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { useFleetSettings } from './useFleetSettings'
import { computeSmsCostDisplay, formatCzk } from './smsCostDisplay'

const Section = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  max-width: 480px;
`

const Title = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  margin: 0 0 ${({ theme }) => theme.spacing.md} 0;
`

const FieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`

const FieldLabel = styled.label`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const FieldValue = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  color: ${({ theme }) => theme.colors.text};
`

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`

const DisabledToggle = styled.input`
  cursor: not-allowed;
  opacity: 0.5;
`

const HintText = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-style: italic;
`

const CapWarning = styled.p<{ $over: boolean }>`
  margin: ${({ theme }) => theme.spacing.xs} 0 0;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ $over, theme }) => ($over ? theme.colors.error : theme.colors.warning)};
`

/** Fleet settings tab — read-only display. Auto-dispatch toggle is disabled (v1.1). */
export function FleetTab() {
  const { t } = useTranslation()
  const { data, isLoading } = useFleetSettings()

  if (isLoading) {
    return <Section><p>{t('settings.fleet.loading')}</p></Section>
  }

  // SMS cost/cap panel — only when the backend exposes the cap data (UC-005 §4, additive).
  const sms =
    data?.smsSentThisMonth != null && data.smsUnitCostCzk != null && data.smsMonthlyCapCzk != null
      ? computeSmsCostDisplay(data.smsSentThisMonth, data.smsUnitCostCzk, data.smsMonthlyCapCzk)
      : null

  return (
    <Section>
      <Title>{t('settings.fleet.title')}</Title>

      <FieldGroup>
        <FieldLabel>{t('settings.fleet.name')}</FieldLabel>
        <FieldValue data-testid="fleet-name">{data?.name ?? '—'}</FieldValue>
      </FieldGroup>

      <FieldGroup>
        <FieldLabel>{t('settings.fleet.phone')}</FieldLabel>
        <FieldValue data-testid="fleet-phone">{data?.phone ?? '—'}</FieldValue>
      </FieldGroup>

      <FieldGroup>
        <FieldLabel>{t('settings.fleet.offerTimeout')}</FieldLabel>
        <FieldValue data-testid="offer-timeout">{data?.offerTimeoutSeconds ?? '—'}</FieldValue>
      </FieldGroup>

      <FieldGroup>
        <FieldLabel>{t('settings.fleet.autoDispatch')}</FieldLabel>
        <ToggleRow>
          <DisabledToggle
            type="checkbox"
            checked={data?.autoDispatchEnabled ?? false}
            disabled
            aria-disabled="true"
            data-testid="auto-dispatch-toggle"
            readOnly
          />
          <HintText>{t('settings.fleet.autoDispatchHint')}</HintText>
        </ToggleRow>
      </FieldGroup>

      {sms && (
        <section aria-label={t('notifications.settings.title')}>
          <Title as="h3">{t('notifications.settings.title')}</Title>

          <FieldGroup>
            <FieldLabel>{t('notifications.settings.monthlyCount')}</FieldLabel>
            <FieldValue data-testid="sms-month-count">{sms.count}</FieldValue>
          </FieldGroup>

          <FieldGroup>
            <FieldLabel>{t('notifications.settings.estimatedCost')}</FieldLabel>
            <FieldValue data-testid="sms-estimated-cost">{formatCzk(sms.estimatedCostCzk)}</FieldValue>
          </FieldGroup>

          <FieldGroup>
            <FieldLabel>{t('notifications.settings.cap')}</FieldLabel>
            <FieldValue data-testid="sms-cap">{formatCzk(sms.capCzk)}</FieldValue>
          </FieldGroup>

          {sms.level !== 'ok' && (
            <CapWarning role="alert" $over={sms.level === 'over'}>
              {sms.level === 'over'
                ? t('notifications.settings.overCap')
                : t('notifications.settings.nearCap')}
            </CapWarning>
          )}
        </section>
      )}
    </Section>
  )
}
