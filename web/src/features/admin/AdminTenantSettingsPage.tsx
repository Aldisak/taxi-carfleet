import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import styled from 'styled-components'
import { useAdminTenantSettings, useUpdateAdminTenantSettings } from './useAdminTenantSettings'
import {
  validateAdminTenantSettingsForm,
  toUpdateRequest,
  fromDto,
  type AdminTenantSettingsFormValues,
  type AdminTenantSettingsFormErrors,
} from './adminTenantSettingsForm'

const Page = styled.main`
  max-width: 720px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`

const Title = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  margin: 0;
`

const BackLink = styled(Link)`
  color: ${({ theme }) => theme.colors.primary};
  min-height: ${({ theme }) => theme.touchTargets.min};
  display: inline-flex;
  align-items: center;
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`

const Fieldset = styled.fieldset`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`

const Legend = styled.legend`
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  padding: 0 ${({ theme }) => theme.spacing.xs};
`

const FieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`

const FieldLabel = styled.label`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const Input = styled.input`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  min-height: ${({ theme }) => theme.touchTargets.min};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 1px;
  }

  &[aria-invalid='true'] {
    border-color: ${({ theme }) => theme.colors.error};
  }
`

const TextArea = styled.textarea`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-family: inherit;
  resize: vertical;
  min-height: 72px;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 1px;
  }

  &[aria-invalid='true'] {
    border-color: ${({ theme }) => theme.colors.error};
  }
`

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  min-height: ${({ theme }) => theme.touchTargets.min};
`

const Checkbox = styled.input`
  width: 24px;
  height: 24px;
`

const HintText = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-style: italic;
`

const ErrorText = styled.span`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
`

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: center;
`

const PrimaryButton = styled.button`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.text};
    outline-offset: 2px;
  }
`

const Banner = styled.p<{ $error: boolean }>`
  margin: 0;
  padding: ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ $error, theme }) => ($error ? theme.colors.error : theme.colors.success)};
  background: ${({ $error, theme }) => ($error ? theme.colors.error : theme.colors.success)}11;
  border: 1px solid ${({ $error, theme }) => ($error ? theme.colors.error : theme.colors.success)};
`

/**
 * SuperAdmin per-tenant settings editor (UC-012). Reached from the Edit link on
 * `AdminFleetsPage`. Reads `:fleetId` from the route, seeds the form from the fetched DTO via
 * `fromDto` once the query settles, and PUTs the mapped request on save. Grouped sections:
 * Fleet / Dispatch / SMS / Map & Mapy / Geo.
 *
 * SECURITY: the Mapy server-key field is write-only — it always loads blank (the DTO never
 * carries the value) and a blank submit maps to `null` (keep the stored key) via WI-3
 * `toUpdateRequest`. A configured/not-set hint is driven by `dto.mapyServerKeyConfigured`.
 */
export function AdminTenantSettingsPage() {
  const { t } = useTranslation()
  const { fleetId = '' } = useParams<{ fleetId: string }>()
  const { data, isLoading, isError } = useAdminTenantSettings(fleetId)
  const update = useUpdateAdminTenantSettings(fleetId)

  const [form, setForm] = useState<AdminTenantSettingsFormValues | null>(null)
  const [errors, setErrors] = useState<AdminTenantSettingsFormErrors>({})
  const [banner, setBanner] = useState<{ error: boolean; key: string } | null>(null)

  // Seed the form once the settings read has settled. All number inputs are seeded from the
  // DTO (never rendered blank) so a cleared numeric never coerces to a surprising 0 in the
  // validator (WI-3 review advisory).
  useEffect(() => {
    if (form || isLoading || !data) return
    setForm(fromDto(data))
  }, [form, isLoading, data])

  function set<K extends keyof AdminTenantSettingsFormValues>(
    key: K,
    value: AdminTenantSettingsFormValues[K],
  ) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setBanner(null)
    const found = validateAdminTenantSettingsForm(form)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    update.mutate(toUpdateRequest(form), {
      onSuccess: () => setBanner({ error: false, key: 'admin.tenant.saved' }),
      onError: () => setBanner({ error: true, key: 'admin.tenant.saveFailed' }),
    })
  }

  if (isError) {
    return (
      <Page>
        <Banner role="alert" $error>
          {t('admin.tenant.loadFailed')}
        </Banner>
      </Page>
    )
  }

  if (isLoading || !form) {
    return (
      <Page>
        <p role="status">{t('admin.tenant.loading')}</p>
      </Page>
    )
  }

  return (
    <Page>
      <TopBar>
        <Title>{t('admin.tenant.title')}</Title>
        <BackLink to="/admin">{t('admin.tenant.back')}</BackLink>
      </TopBar>

      {banner && (
        <Banner role="status" aria-live="polite" $error={banner.error}>
          {t(banner.key)}
        </Banner>
      )}

      <Form onSubmit={handleSubmit} noValidate>
        {/* ── Fleet ─────────────────────────────────────────────── */}
        <Fieldset>
          <Legend>{t('admin.tenant.sections.fleet')}</Legend>

          <FieldGroup>
            <FieldLabel htmlFor="ts-name">{t('admin.tenant.fields.name')}</FieldLabel>
            <Input
              id="ts-name"
              value={form.name}
              aria-invalid={errors.name ? 'true' : undefined}
              onChange={(e) => set('name', e.target.value)}
            />
            {errors.name && <ErrorText role="alert">{t(errors.name)}</ErrorText>}
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="ts-phone">{t('admin.tenant.fields.phone')}</FieldLabel>
            <Input
              id="ts-phone"
              type="tel"
              value={form.phone}
              aria-invalid={errors.phone ? 'true' : undefined}
              onChange={(e) => set('phone', e.target.value)}
            />
            {errors.phone && <ErrorText role="alert">{t(errors.phone)}</ErrorText>}
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="ts-currency">{t('admin.tenant.fields.currency')}</FieldLabel>
            <Input
              id="ts-currency"
              value={form.currency}
              aria-invalid={errors.currency ? 'true' : undefined}
              onChange={(e) => set('currency', e.target.value)}
            />
            {errors.currency && <ErrorText role="alert">{t(errors.currency)}</ErrorText>}
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="ts-timezone">{t('admin.tenant.fields.timeZone')}</FieldLabel>
            <Input
              id="ts-timezone"
              value={form.timeZone}
              aria-invalid={errors.timeZone ? 'true' : undefined}
              onChange={(e) => set('timeZone', e.target.value)}
            />
            {errors.timeZone && <ErrorText role="alert">{t(errors.timeZone)}</ErrorText>}
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="ts-color">{t('admin.tenant.fields.primaryColorHex')}</FieldLabel>
            <Input
              id="ts-color"
              value={form.primaryColorHex}
              placeholder="#1E88E5"
              aria-invalid={errors.primaryColorHex ? 'true' : undefined}
              onChange={(e) => set('primaryColorHex', e.target.value)}
            />
            <HintText>{t('admin.tenant.hints.primaryColorHex')}</HintText>
            {errors.primaryColorHex && <ErrorText role="alert">{t(errors.primaryColorHex)}</ErrorText>}
          </FieldGroup>

          <FieldGroup>
            <ToggleRow>
              <Checkbox
                id="ts-active"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set('isActive', e.target.checked)}
              />
              <FieldLabel htmlFor="ts-active">{t('admin.tenant.fields.isActive')}</FieldLabel>
            </ToggleRow>
          </FieldGroup>
        </Fieldset>

        {/* ── Dispatch ──────────────────────────────────────────── */}
        <Fieldset>
          <Legend>{t('admin.tenant.sections.dispatch')}</Legend>

          <FieldGroup>
            <FieldLabel htmlFor="ts-offer-timeout">
              {t('admin.tenant.fields.offerTimeoutSeconds')}
            </FieldLabel>
            <Input
              id="ts-offer-timeout"
              type="number"
              min={10}
              max={600}
              value={form.offerTimeoutSeconds}
              aria-invalid={errors.offerTimeoutSeconds ? 'true' : undefined}
              onChange={(e) => set('offerTimeoutSeconds', e.target.value)}
            />
            {errors.offerTimeoutSeconds && (
              <ErrorText role="alert">{t(errors.offerTimeoutSeconds)}</ErrorText>
            )}
          </FieldGroup>

          <FieldGroup>
            <ToggleRow>
              <Checkbox
                id="ts-auto-dispatch"
                type="checkbox"
                checked={form.autoDispatchEnabled}
                onChange={(e) => set('autoDispatchEnabled', e.target.checked)}
              />
              <FieldLabel htmlFor="ts-auto-dispatch">
                {t('admin.tenant.fields.autoDispatchEnabled')}
              </FieldLabel>
            </ToggleRow>
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="ts-auto-dispatch-after">
              {t('admin.tenant.fields.autoDispatchAfterSeconds')}
            </FieldLabel>
            <Input
              id="ts-auto-dispatch-after"
              type="number"
              min={0}
              value={form.autoDispatchAfterSeconds}
              aria-invalid={errors.autoDispatchAfterSeconds ? 'true' : undefined}
              onChange={(e) => set('autoDispatchAfterSeconds', e.target.value)}
            />
            {errors.autoDispatchAfterSeconds && (
              <ErrorText role="alert">{t(errors.autoDispatchAfterSeconds)}</ErrorText>
            )}
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="ts-max-radius">
              {t('admin.tenant.fields.maxOfferRadiusKm')}
            </FieldLabel>
            <Input
              id="ts-max-radius"
              type="number"
              min={1}
              max={100}
              value={form.maxOfferRadiusKm}
              aria-invalid={errors.maxOfferRadiusKm ? 'true' : undefined}
              onChange={(e) => set('maxOfferRadiusKm', e.target.value)}
            />
            {errors.maxOfferRadiusKm && (
              <ErrorText role="alert">{t(errors.maxOfferRadiusKm)}</ErrorText>
            )}
          </FieldGroup>
        </Fieldset>

        {/* ── SMS ───────────────────────────────────────────────── */}
        <Fieldset>
          <Legend>{t('admin.tenant.sections.sms')}</Legend>

          <FieldGroup>
            <FieldLabel htmlFor="ts-sms-sender">
              {t('admin.tenant.fields.smsSenderName')}
            </FieldLabel>
            <Input
              id="ts-sms-sender"
              value={form.smsSenderName}
              aria-invalid={errors.smsSenderName ? 'true' : undefined}
              onChange={(e) => set('smsSenderName', e.target.value)}
            />
            {errors.smsSenderName && (
              <ErrorText role="alert">{t(errors.smsSenderName)}</ErrorText>
            )}
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="ts-sms-cap">
              {t('admin.tenant.fields.smsMonthlyCapCzk')}
            </FieldLabel>
            <Input
              id="ts-sms-cap"
              type="number"
              min={0}
              value={form.smsMonthlyCapCzk}
              aria-invalid={errors.smsMonthlyCapCzk ? 'true' : undefined}
              onChange={(e) => set('smsMonthlyCapCzk', e.target.value)}
            />
            {errors.smsMonthlyCapCzk && (
              <ErrorText role="alert">{t(errors.smsMonthlyCapCzk)}</ErrorText>
            )}
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="ts-sms-unit-cost">
              {t('admin.tenant.fields.smsUnitCostCzk')}
            </FieldLabel>
            <Input
              id="ts-sms-unit-cost"
              type="number"
              min={0}
              value={form.smsUnitCostCzk}
              aria-invalid={errors.smsUnitCostCzk ? 'true' : undefined}
              onChange={(e) => set('smsUnitCostCzk', e.target.value)}
            />
            {errors.smsUnitCostCzk && (
              <ErrorText role="alert">{t(errors.smsUnitCostCzk)}</ErrorText>
            )}
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="ts-welcome">{t('admin.tenant.fields.welcomeText')}</FieldLabel>
            <TextArea
              id="ts-welcome"
              value={form.welcomeText}
              aria-invalid={errors.welcomeText ? 'true' : undefined}
              onChange={(e) => set('welcomeText', e.target.value)}
            />
            {errors.welcomeText && <ErrorText role="alert">{t(errors.welcomeText)}</ErrorText>}
          </FieldGroup>
        </Fieldset>

        {/* ── Map & Mapy ────────────────────────────────────────── */}
        <Fieldset>
          <Legend>{t('admin.tenant.sections.map')}</Legend>

          <FieldGroup>
            <FieldLabel htmlFor="ts-mapy-browser">
              {t('admin.tenant.fields.mapyBrowserKey')}
            </FieldLabel>
            <Input
              id="ts-mapy-browser"
              value={form.mapyBrowserKey}
              aria-invalid={errors.mapyBrowserKey ? 'true' : undefined}
              onChange={(e) => set('mapyBrowserKey', e.target.value)}
            />
            <HintText>{t('admin.tenant.hints.mapyBrowserKeyKeep')}</HintText>
            {errors.mapyBrowserKey && (
              <ErrorText role="alert">{t(errors.mapyBrowserKey)}</ErrorText>
            )}
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="ts-mapy-server">
              {t('admin.tenant.fields.mapyServerKey')}
            </FieldLabel>
            <Input
              id="ts-mapy-server"
              type="password"
              autoComplete="new-password"
              value={form.mapyServerKey}
              aria-invalid={errors.mapyServerKey ? 'true' : undefined}
              onChange={(e) => set('mapyServerKey', e.target.value)}
            />
            <HintText>
              {form.mapyServerKeyConfigured
                ? t('admin.tenant.hints.mapyServerKeyConfigured')
                : t('admin.tenant.hints.mapyServerKeyNotSet')}
            </HintText>
            <HintText>{t('admin.tenant.hints.mapyServerKeyKeep')}</HintText>
            {errors.mapyServerKey && (
              <ErrorText role="alert">{t(errors.mapyServerKey)}</ErrorText>
            )}
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="ts-map-lat">{t('admin.tenant.fields.mapCenterLat')}</FieldLabel>
            <Input
              id="ts-map-lat"
              type="number"
              step="any"
              value={form.mapCenterLat}
              aria-invalid={errors.mapCenterLat ? 'true' : undefined}
              onChange={(e) => set('mapCenterLat', e.target.value)}
            />
            {errors.mapCenterLat && <ErrorText role="alert">{t(errors.mapCenterLat)}</ErrorText>}
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="ts-map-lng">{t('admin.tenant.fields.mapCenterLng')}</FieldLabel>
            <Input
              id="ts-map-lng"
              type="number"
              step="any"
              value={form.mapCenterLng}
              aria-invalid={errors.mapCenterLng ? 'true' : undefined}
              onChange={(e) => set('mapCenterLng', e.target.value)}
            />
            {errors.mapCenterLng && <ErrorText role="alert">{t(errors.mapCenterLng)}</ErrorText>}
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="ts-map-zoom">{t('admin.tenant.fields.mapZoom')}</FieldLabel>
            <Input
              id="ts-map-zoom"
              type="number"
              min={1}
              max={20}
              value={form.mapZoom}
              aria-invalid={errors.mapZoom ? 'true' : undefined}
              onChange={(e) => set('mapZoom', e.target.value)}
            />
            {errors.mapZoom && <ErrorText role="alert">{t(errors.mapZoom)}</ErrorText>}
          </FieldGroup>
        </Fieldset>

        {/* ── Geo ───────────────────────────────────────────────── */}
        <Fieldset>
          <Legend>{t('admin.tenant.sections.geo')}</Legend>

          <FieldGroup>
            <FieldLabel htmlFor="ts-geo-budget">
              {t('admin.tenant.fields.geoMonthlyCreditBudget')}
            </FieldLabel>
            <Input
              id="ts-geo-budget"
              type="number"
              min={0}
              value={form.geoMonthlyCreditBudget}
              aria-invalid={errors.geoMonthlyCreditBudget ? 'true' : undefined}
              onChange={(e) => set('geoMonthlyCreditBudget', e.target.value)}
            />
            {errors.geoMonthlyCreditBudget && (
              <ErrorText role="alert">{t(errors.geoMonthlyCreditBudget)}</ErrorText>
            )}
          </FieldGroup>
        </Fieldset>

        <Actions>
          <PrimaryButton type="submit" disabled={update.isPending}>
            {update.isPending ? t('admin.tenant.saving') : t('admin.tenant.save')}
          </PrimaryButton>
        </Actions>
      </Form>
    </Page>
  )
}
