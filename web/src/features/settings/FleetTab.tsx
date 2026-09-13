import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { useQuery } from '@tanstack/react-query'
import { getPublicFleet } from '../../shared/api/client'
import { useFleetSettings } from './useFleetSettings'
import { useUpdateFleetSettings, useUploadFleetLogo } from './useFleetSettingsMutations'
import {
  validateFleetSettingsForm,
  toUpdateRequest,
  checkLogoFile,
  type FleetSettingsFormValues,
  type FleetSettingsFormErrors,
} from './fleetSettingsForm'

const Section = styled.form`
  padding: ${({ theme }) => theme.spacing.md};
  max-width: 520px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`

const Title = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  margin: 0;
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
`

const ColorRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`

const ColorSwatch = styled.input`
  width: 48px;
  height: 48px;
  padding: 0;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  cursor: pointer;
`

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
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

const LogoPreview = styled.img`
  max-width: 160px;
  max-height: 80px;
  object-fit: contain;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: ${({ theme }) => theme.colors.surface};
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

const EMPTY: FleetSettingsFormValues = {
  name: '',
  phone: '',
  primaryColorHex: '',
  welcomeText: '',
  offerTimeoutSeconds: '45',
  smsMonthlyCapCzk: '500',
  autoDispatchEnabled: false,
}

/**
 * Fleet self-service settings tab (UC-007 A6 — FleetAdmin). Editable form: name, phone,
 * primary color, welcome text, offer timeout, SMS cap, a DISABLED auto-dispatch toggle
 * (v1.1), and a PNG logo upload (<= 200 KB, client pre-check + server 400 fallback).
 *
 * Pre-fill sources (the PUT is a full replace, so all persisted fields must be seeded or they
 * get wiped): GET /fleet/settings now round-trips the FULL editable set accepted by PUT —
 * name, phone, offerTimeout, autoDispatch, primaryColorHex, welcomeText AND smsMonthlyCapCzk
 * (UC-007 A7b). The old public/fleet + default-500 clobber workaround is gone. GET /public/fleet
 * is retained ONLY for the logo preview image (logoUrl is NOT in the settings read — the logo is a
 * separate 204 upload, not part of the PUT, so it is not clobber-prone).
 */
export function FleetTab() {
  const { t } = useTranslation()
  const { data: settings, isLoading } = useFleetSettings()
  const { data: publicFleet } = useQuery({
    queryKey: ['public', 'fleet'],
    queryFn: getPublicFleet,
    staleTime: 60_000,
    retry: false,
  })
  const update = useUpdateFleetSettings()
  const uploadLogo = useUploadFleetLogo()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FleetSettingsFormValues>(EMPTY)
  const [errors, setErrors] = useState<FleetSettingsFormErrors>({})
  const [banner, setBanner] = useState<{ error: boolean; key: string } | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [seeded, setSeeded] = useState(false)

  // Seed the form once the settings read has settled. GET /fleet/settings now supplies the full
  // editable set (including color/welcome/smsCap — UC-007 A7b), so it is the single prefill source;
  // publicFleet is used ONLY for the logo preview image below.
  useEffect(() => {
    if (seeded || isLoading) return
    setForm({
      name: settings?.name ?? '',
      phone: settings?.phone ?? '',
      primaryColorHex: settings?.primaryColorHex ?? '',
      welcomeText: settings?.welcomeText ?? '',
      offerTimeoutSeconds: String(settings?.offerTimeoutSeconds ?? 45),
      smsMonthlyCapCzk: String(settings?.smsMonthlyCapCzk ?? 500),
      autoDispatchEnabled: settings?.autoDispatchEnabled ?? false,
    })
    setSeeded(true)
  }, [seeded, isLoading, settings])

  function set<K extends keyof FleetSettingsFormValues>(key: K, value: FleetSettingsFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBanner(null)
    const found = validateFleetSettingsForm(form)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    update.mutate(toUpdateRequest(form), {
      onSuccess: () => setBanner({ error: false, key: 'settings.fleet.saved' }),
      onError: () => setBanner({ error: true, key: 'settings.fleet.saveFailed' }),
    })
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    setLogoError(null)
    const file = e.target.files?.[0]
    if (!file) return
    const check = checkLogoFile(file)
    if (!check.ok) {
      setLogoError(check.reason === 'tooLarge' ? 'settings.fleet.logo.tooLarge' : 'settings.fleet.logo.notPng')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    uploadLogo.mutate(file, {
      onSuccess: () => setBanner({ error: false, key: 'settings.fleet.logo.uploaded' }),
      // Server re-validates (PNG magic + 200 KB) — fall back to the 400 message.
      onError: () => setLogoError('settings.fleet.logo.uploadFailed'),
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (isLoading) {
    return <Section as="div"><p>{t('settings.fleet.loading')}</p></Section>
  }

  return (
    <Section onSubmit={handleSubmit} noValidate aria-label={t('settings.fleet.title')}>
      <Title>{t('settings.fleet.title')}</Title>

      {banner && (
        <Banner role="status" aria-live="polite" $error={banner.error}>
          {t(banner.key)}
        </Banner>
      )}

      <FieldGroup>
        <FieldLabel htmlFor="fleet-name">{t('settings.fleet.name')}</FieldLabel>
        <Input
          id="fleet-name"
          value={form.name}
          aria-invalid={errors.name ? 'true' : undefined}
          onChange={(e) => set('name', e.target.value)}
        />
        {errors.name && <ErrorText role="alert">{t(errors.name)}</ErrorText>}
      </FieldGroup>

      <FieldGroup>
        <FieldLabel htmlFor="fleet-phone">{t('settings.fleet.phone')}</FieldLabel>
        <Input
          id="fleet-phone"
          type="tel"
          value={form.phone}
          aria-invalid={errors.phone ? 'true' : undefined}
          onChange={(e) => set('phone', e.target.value)}
        />
        {errors.phone && <ErrorText role="alert">{t(errors.phone)}</ErrorText>}
      </FieldGroup>

      <FieldGroup>
        <FieldLabel htmlFor="fleet-color">{t('settings.fleet.primaryColor')}</FieldLabel>
        <ColorRow>
          <ColorSwatch
            id="fleet-color"
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(form.primaryColorHex) ? form.primaryColorHex : '#000000'}
            aria-label={t('settings.fleet.primaryColor')}
            onChange={(e) => set('primaryColorHex', e.target.value)}
          />
          <Input
            id="fleet-color-hex"
            value={form.primaryColorHex}
            placeholder="#1E88E5"
            aria-label={t('settings.fleet.primaryColorHex')}
            aria-invalid={errors.primaryColorHex ? 'true' : undefined}
            onChange={(e) => set('primaryColorHex', e.target.value)}
          />
        </ColorRow>
        {errors.primaryColorHex && <ErrorText role="alert">{t(errors.primaryColorHex)}</ErrorText>}
      </FieldGroup>

      <FieldGroup>
        <FieldLabel htmlFor="fleet-logo">{t('settings.fleet.logo.label')}</FieldLabel>
        {publicFleet?.logoUrl && (
          <LogoPreview src={publicFleet.logoUrl} alt={t('settings.fleet.logo.previewAlt')} />
        )}
        <input
          id="fleet-logo"
          ref={fileInputRef}
          type="file"
          accept="image/png"
          onChange={handleLogoChange}
        />
        <HintText>{t('settings.fleet.logo.hint')}</HintText>
        {logoError && <ErrorText role="alert">{t(logoError)}</ErrorText>}
      </FieldGroup>

      <FieldGroup>
        <FieldLabel htmlFor="fleet-welcome">{t('settings.fleet.welcomeText')}</FieldLabel>
        <TextArea
          id="fleet-welcome"
          value={form.welcomeText}
          aria-invalid={errors.welcomeText ? 'true' : undefined}
          onChange={(e) => set('welcomeText', e.target.value)}
        />
        {errors.welcomeText && <ErrorText role="alert">{t(errors.welcomeText)}</ErrorText>}
      </FieldGroup>

      <FieldGroup>
        <FieldLabel htmlFor="fleet-offer-timeout">{t('settings.fleet.offerTimeout')}</FieldLabel>
        <Input
          id="fleet-offer-timeout"
          type="number"
          min={10}
          max={600}
          value={form.offerTimeoutSeconds}
          aria-invalid={errors.offerTimeoutSeconds ? 'true' : undefined}
          onChange={(e) => set('offerTimeoutSeconds', e.target.value)}
        />
        {errors.offerTimeoutSeconds && <ErrorText role="alert">{t(errors.offerTimeoutSeconds)}</ErrorText>}
      </FieldGroup>

      <FieldGroup>
        <FieldLabel htmlFor="fleet-sms-cap">{t('settings.fleet.smsCap')}</FieldLabel>
        <Input
          id="fleet-sms-cap"
          type="number"
          min={0}
          value={form.smsMonthlyCapCzk}
          aria-invalid={errors.smsMonthlyCapCzk ? 'true' : undefined}
          onChange={(e) => set('smsMonthlyCapCzk', e.target.value)}
        />
        {errors.smsMonthlyCapCzk && <ErrorText role="alert">{t(errors.smsMonthlyCapCzk)}</ErrorText>}
      </FieldGroup>

      <FieldGroup>
        <FieldLabel htmlFor="fleet-auto-dispatch">{t('settings.fleet.autoDispatch')}</FieldLabel>
        <ToggleRow>
          <input
            id="fleet-auto-dispatch"
            type="checkbox"
            checked={form.autoDispatchEnabled}
            disabled
            aria-disabled="true"
            data-testid="auto-dispatch-toggle"
            readOnly
          />
          <HintText>{t('settings.fleet.autoDispatchHint')}</HintText>
        </ToggleRow>
      </FieldGroup>

      <Actions>
        <PrimaryButton type="submit" disabled={update.isPending}>
          {update.isPending ? t('settings.fleet.saving') : t('settings.fleet.save')}
        </PrimaryButton>
      </Actions>
    </Section>
  )
}
