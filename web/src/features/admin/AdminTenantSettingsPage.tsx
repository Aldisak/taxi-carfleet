import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import styled from 'styled-components'
import { Panel, Lbl, Ctrl, DeskButton, DeskPill } from '../../shared/ui/desk'
import { Callout } from '../../shared/ui'
import { useAdminTenantSettings, useUpdateAdminTenantSettings } from './useAdminTenantSettings'
import {
  validateAdminTenantSettingsForm,
  toUpdateRequest,
  fromDto,
  type AdminTenantSettingsFormValues,
  type AdminTenantSettingsFormErrors,
} from './adminTenantSettingsForm'

// ── Styled components (desk kit + CSS custom properties) ─────────────────────────

const Page = styled.main`
  max-width: 1100px;
  margin: 0 auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  font-size: var(--fs-caption);
  font-weight: var(--fw-bold);
  line-height: 1;
  color: var(--ink);
  text-decoration: none;

  &:hover {
    background: var(--surface-2);
  }

  &:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
`

const Dot = styled.span`
  width: 12px;
  height: 12px;
  border-radius: var(--r-pill);
  background: var(--ink);
  flex-shrink: 0;
`

const TitleBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`

const Title = styled.h1`
  margin: 0;
  font-size: 26px;
  font-weight: var(--fw-extra);
  color: var(--ink);
  line-height: 1.1;
`

const Caption = styled.p`
  margin: 0;
  font-size: var(--fs-caption);
  color: var(--ink-3);
`

const TitleActions = styled.div`
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: start;

  @media (max-width: 860px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

const PanelForm = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 14px;
  padding: 14px;

  @media (max-width: 520px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
`

/** Spans both columns of the two-column panel grid (welcome text, toggles). */
const FieldWide = styled(Field)`
  grid-column: 1 / -1;
`

const Hint = styled.small`
  display: block;
  margin-top: 4px;
  font-size: var(--fs-caption);
  color: var(--ink-3);
`

const ToggleRow = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: var(--fs-body);
  color: var(--ink);
`

const Checkbox = styled.input`
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  accent-color: var(--accent);
`

const Swatch = styled.span<{ $color: string }>`
  display: inline-block;
  width: 40px;
  height: 40px;
  border-radius: var(--r-sm);
  border: 1px solid var(--line);
  background: ${({ $color }) => $color};
  flex-shrink: 0;
`

const SwatchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const SwatchCtrl = styled.div`
  flex: 1 1 auto;
  min-width: 0;
`

const Footer = styled.div`
  position: sticky;
  bottom: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 0;
  background: var(--bg);
  border-top: 1px solid var(--line);
`

const Message = styled.p`
  margin: 0;
  padding: 16px;
  color: var(--ink-2);
`

/**
 * SuperAdmin per-tenant settings editor (UC-012, restyled onto the desk kit for UC-021 WI-8).
 * Reached from the Settings link on `AdminFleetsPage`. Reads `:fleetId` from the route, seeds the
 * form from the fetched DTO via `fromDto` once the query settles, and PUTs the mapped request on a
 * SINGLE page-level save (`Uložit vše`). Four desk `Panel`s in a 2-column grid: Flotila / Dispečink
 * / SMS / Mapa a Mapy.com; a sticky footer carries the one save + a Deaktivovat action.
 *
 * `Deaktivovat` is a UI-only affordance: it flips the `isActive` form field to false; the change is
 * committed with the single `Uložit vše` save (there is no separate deactivate mutation — one save
 * for the whole page per the design). The title-row `Aktivní` pill reflects the current form state.
 *
 * The title-row fleet dot is ink: the tenant DTO carries a `primaryColorHex` brand color but the
 * design specifies an ink dot in the SuperAdmin shell; the brand color is edited (with a live
 * swatch) inside the Flotila panel.
 *
 * SECURITY: the Mapy server-key field is write-only — it always loads blank (the DTO never carries
 * the value) and a blank submit maps to `null` (keep the stored key) via WI-3 `toUpdateRequest`. A
 * configured/not-set hint is driven by `dto.mapyServerKeyConfigured`. The server key stays masked
 * (type=password) always; the public browser key renders in the clear (it is not a secret).
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

  function errorFor(key: keyof AdminTenantSettingsFormErrors): string | undefined {
    const code = errors[key]
    return code ? t(code) : undefined
  }

  if (isError) {
    return (
      <Page>
        <Callout tone="danger" role="alert">
          {t('admin.tenant.loadFailed')}
        </Callout>
      </Page>
    )
  }

  if (isLoading || !form) {
    return (
      <Page>
        <Message role="status">{t('admin.tenant.loading')}</Message>
      </Page>
    )
  }

  const swatchColor = form.primaryColorHex.trim() || 'var(--surface-2)'

  return (
    <Page>
      <TitleRow>
        <BackLink to="/admin">{t('admin.tenant.back')}</BackLink>
        <Dot aria-hidden="true" />
        <TitleBlock>
          <Title>{form.name}</Title>
          <Caption>
            {t('admin.tenant.subtitle', {
              slug: fleetId,
              created: '—',
              drivers: '—',
            })}
          </Caption>
        </TitleBlock>
        <TitleActions>
          <DeskPill tone={form.isActive ? 'success' : 'neutral'}>
            {form.isActive ? t('admin.fleets.active') : t('admin.fleets.inactive')}
          </DeskPill>
        </TitleActions>
      </TitleRow>

      {banner && (
        <Callout tone={banner.error ? 'danger' : 'info'} role="status">
          {t(banner.key)}
        </Callout>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <Grid>
          {/* ── Flotila ─────────────────────────────────────────── */}
          <Panel title={t('admin.tenant.sections.fleet')}>
            <PanelForm>
              <Field>
                <Lbl htmlFor="ts-name">{t('admin.tenant.fields.name')}</Lbl>
                <Ctrl id="ts-name" value={form.name} onChange={(v) => set('name', v)} error={errorFor('name')} />
              </Field>
              <Field>
                <Lbl htmlFor="ts-phone">{t('admin.tenant.fields.phone')}</Lbl>
                <Ctrl
                  id="ts-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(v) => set('phone', v)}
                  error={errorFor('phone')}
                />
              </Field>
              <Field>
                <Lbl htmlFor="ts-currency">{t('admin.tenant.fields.currency')}</Lbl>
                <Ctrl
                  id="ts-currency"
                  value={form.currency}
                  onChange={(v) => set('currency', v)}
                  error={errorFor('currency')}
                />
              </Field>
              <Field>
                <Lbl htmlFor="ts-timezone">{t('admin.tenant.fields.timeZone')}</Lbl>
                <Ctrl
                  id="ts-timezone"
                  value={form.timeZone}
                  onChange={(v) => set('timeZone', v)}
                  error={errorFor('timeZone')}
                />
              </Field>
              <FieldWide>
                <Lbl htmlFor="ts-color">{t('admin.tenant.fields.primaryColorHex')}</Lbl>
                <SwatchRow>
                  <Swatch $color={swatchColor} aria-hidden="true" />
                  <SwatchCtrl>
                    <Ctrl
                      id="ts-color"
                      value={form.primaryColorHex}
                      placeholder="#1E88E5"
                      onChange={(v) => set('primaryColorHex', v)}
                      error={errorFor('primaryColorHex')}
                    />
                  </SwatchCtrl>
                </SwatchRow>
                <Hint>{t('admin.tenant.hints.primaryColorHex')}</Hint>
              </FieldWide>
              <FieldWide>
                <ToggleRow htmlFor="ts-active">
                  <Checkbox
                    id="ts-active"
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => set('isActive', e.target.checked)}
                  />
                  {t('admin.tenant.fields.isActive')}
                </ToggleRow>
              </FieldWide>
            </PanelForm>
          </Panel>

          {/* ── Dispečink ───────────────────────────────────────── */}
          <Panel title={t('admin.tenant.sections.dispatch')}>
            <PanelForm>
              <Field>
                <Lbl htmlFor="ts-offer-timeout">{t('admin.tenant.fields.offerTimeoutSeconds')}</Lbl>
                <Ctrl
                  id="ts-offer-timeout"
                  type="number"
                  value={form.offerTimeoutSeconds}
                  onChange={(v) => set('offerTimeoutSeconds', v)}
                  error={errorFor('offerTimeoutSeconds')}
                />
              </Field>
              <Field>
                <Lbl htmlFor="ts-max-radius">{t('admin.tenant.fields.maxOfferRadiusKm')}</Lbl>
                <Ctrl
                  id="ts-max-radius"
                  type="number"
                  value={form.maxOfferRadiusKm}
                  onChange={(v) => set('maxOfferRadiusKm', v)}
                  error={errorFor('maxOfferRadiusKm')}
                />
              </Field>
              <FieldWide>
                <ToggleRow htmlFor="ts-auto-dispatch">
                  <Checkbox
                    id="ts-auto-dispatch"
                    type="checkbox"
                    checked={form.autoDispatchEnabled}
                    onChange={(e) => set('autoDispatchEnabled', e.target.checked)}
                  />
                  {t('admin.tenant.fields.autoDispatchEnabled')}
                </ToggleRow>
                <Hint>{t('admin.tenant.autoDispatchHint')}</Hint>
              </FieldWide>
              <Field>
                <Lbl htmlFor="ts-auto-dispatch-after">
                  {t('admin.tenant.fields.autoDispatchAfterSeconds')}
                </Lbl>
                <Ctrl
                  id="ts-auto-dispatch-after"
                  type="number"
                  value={form.autoDispatchAfterSeconds}
                  onChange={(v) => set('autoDispatchAfterSeconds', v)}
                  error={errorFor('autoDispatchAfterSeconds')}
                />
              </Field>
            </PanelForm>
          </Panel>

          {/* ── SMS ─────────────────────────────────────────────── */}
          <Panel title={t('admin.tenant.sections.sms')}>
            <PanelForm>
              <Field>
                <Lbl htmlFor="ts-sms-sender">{t('admin.tenant.fields.smsSenderName')}</Lbl>
                <Ctrl
                  id="ts-sms-sender"
                  value={form.smsSenderName}
                  onChange={(v) => set('smsSenderName', v)}
                  error={errorFor('smsSenderName')}
                />
              </Field>
              <Field>
                <Lbl htmlFor="ts-sms-cap">{t('admin.tenant.fields.smsMonthlyCapCzk')}</Lbl>
                <Ctrl
                  id="ts-sms-cap"
                  type="number"
                  value={form.smsMonthlyCapCzk}
                  onChange={(v) => set('smsMonthlyCapCzk', v)}
                  error={errorFor('smsMonthlyCapCzk')}
                />
              </Field>
              <Field>
                <Lbl htmlFor="ts-sms-unit-cost">{t('admin.tenant.fields.smsUnitCostCzk')}</Lbl>
                <Ctrl
                  id="ts-sms-unit-cost"
                  type="number"
                  value={form.smsUnitCostCzk}
                  onChange={(v) => set('smsUnitCostCzk', v)}
                  error={errorFor('smsUnitCostCzk')}
                />
              </Field>
              <FieldWide>
                <Lbl htmlFor="ts-welcome">{t('admin.tenant.fields.welcomeText')}</Lbl>
                <Ctrl
                  id="ts-welcome"
                  value={form.welcomeText}
                  onChange={(v) => set('welcomeText', v)}
                  error={errorFor('welcomeText')}
                />
              </FieldWide>
            </PanelForm>
          </Panel>

          {/* ── Mapa a Mapy.com ─────────────────────────────────── */}
          <Panel title={t('admin.tenant.sections.map')}>
            <PanelForm>
              <FieldWide>
                <Lbl htmlFor="ts-mapy-browser">{t('admin.tenant.fields.mapyBrowserKey')}</Lbl>
                <Ctrl
                  id="ts-mapy-browser"
                  value={form.mapyBrowserKey}
                  onChange={(v) => set('mapyBrowserKey', v)}
                  error={errorFor('mapyBrowserKey')}
                />
                <Hint>{t('admin.tenant.hints.mapyBrowserKeyKeep')}</Hint>
              </FieldWide>
              <FieldWide>
                <Lbl htmlFor="ts-mapy-server">{t('admin.tenant.fields.mapyServerKey')}</Lbl>
                <Ctrl
                  id="ts-mapy-server"
                  type="password"
                  autoComplete="new-password"
                  value={form.mapyServerKey}
                  onChange={(v) => set('mapyServerKey', v)}
                  error={errorFor('mapyServerKey')}
                />
                <Hint>
                  {form.mapyServerKeyConfigured
                    ? t('admin.tenant.hints.mapyServerKeyConfigured')
                    : t('admin.tenant.hints.mapyServerKeyNotSet')}
                </Hint>
                <Hint>{t('admin.tenant.hints.mapyServerKeyKeep')}</Hint>
              </FieldWide>
              <Field>
                <Lbl htmlFor="ts-map-lat">{t('admin.tenant.fields.mapCenterLat')}</Lbl>
                <Ctrl
                  id="ts-map-lat"
                  type="number"
                  value={form.mapCenterLat}
                  onChange={(v) => set('mapCenterLat', v)}
                  error={errorFor('mapCenterLat')}
                />
              </Field>
              <Field>
                <Lbl htmlFor="ts-map-lng">{t('admin.tenant.fields.mapCenterLng')}</Lbl>
                <Ctrl
                  id="ts-map-lng"
                  type="number"
                  value={form.mapCenterLng}
                  onChange={(v) => set('mapCenterLng', v)}
                  error={errorFor('mapCenterLng')}
                />
              </Field>
              <Field>
                <Lbl htmlFor="ts-map-zoom">{t('admin.tenant.fields.mapZoom')}</Lbl>
                <Ctrl
                  id="ts-map-zoom"
                  type="number"
                  value={form.mapZoom}
                  onChange={(v) => set('mapZoom', v)}
                  error={errorFor('mapZoom')}
                />
              </Field>
              <Field>
                <Lbl htmlFor="ts-geo-budget">{t('admin.tenant.fields.geoMonthlyCreditBudget')}</Lbl>
                <Ctrl
                  id="ts-geo-budget"
                  type="number"
                  value={form.geoMonthlyCreditBudget}
                  onChange={(v) => set('geoMonthlyCreditBudget', v)}
                  error={errorFor('geoMonthlyCreditBudget')}
                />
              </Field>
            </PanelForm>
          </Panel>
        </Grid>

        <Footer>
          <DeskButton
            type="button"
            variant="danger"
            onClick={() => set('isActive', false)}
            disabled={!form.isActive}
          >
            {t('admin.tenant.deactivate')}
          </DeskButton>
          <DeskButton
            type="submit"
            variant="primary"
            loading={update.isPending}
            loadingLabel={t('admin.tenant.saving')}
          >
            {t('admin.tenant.saveAll')}
          </DeskButton>
        </Footer>
      </form>
    </Page>
  )
}
