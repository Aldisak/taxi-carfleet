import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import type { GeoSuggestItem } from '../../../shared/api/client'
import { suggestionMeta } from '../../../shared/geo/suggestionMeta'
import { useSuggest } from './useSuggest'

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`

const Label = styled.label`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const Input = styled.input`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
`

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  overflow: hidden;
`

const Option = styled.li`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.colors.background};
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: -2px;
  }
`

const OptionLabel = styled.span`
  display: block;
`

const OptionMeta = styled.span`
  display: block;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const Empty = styled.p`
  margin: 0;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const LocationButton = styled.button`
  align-self: flex-start;
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.primary};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`

const Message = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

/** The selected address plus resolved coordinates (null until a suggestion/GPS/drag resolves them). */
export interface AddressValue {
  address: string
  lat: number | null
  lng: number | null
}

/** Props for AddressAutocomplete. */
export interface AddressAutocompleteProps {
  /** i18n key for the field label. */
  label: string
  /** i18n key for the input placeholder. */
  placeholder: string
  value: AddressValue
  onChange: (value: AddressValue) => void
  /** Whether to show the "Použít moji polohu" GPS button (pickup only). */
  showUseMyLocation?: boolean
}

/**
 * Controlled address field with debounced geo/suggest autocomplete and an optional
 * "Použít moji polohu" GPS button. Picking a suggestion or using GPS resolves the
 * coordinates; typing freeform clears them (the submit is gated on resolved coords).
 *
 * GPS is a CLIENT PIN STUB (no reverse-geocode endpoint pre-06): on success we drop a pin
 * at the raw GPS coords and use "Moje poloha (GPS)" as the label. On permission denial we
 * show a friendly message and keep the input usable (typing + map-pin drag still work —
 * spec §Behavior rules: the screen works without location permission). Suggest is gated on
 * auth inside useSuggest, so a logged-out visitor gets no dropdown but can still type.
 */
export function AddressAutocomplete({
  label,
  placeholder,
  value,
  onChange,
  showUseMyLocation = false,
}: AddressAutocompleteProps) {
  const { t } = useTranslation()
  // `query` is the live typed text and the input's displayed value, so typing is never
  // clobbered by the controlled `value.address` (the parent echoes it back a render late).
  const [query, setQuery] = useState(value.address)
  const [open, setOpen] = useState(false)
  const [geoDenied, setGeoDenied] = useState(false)
  const { items, isEmpty } = useSuggest(query)

  // Keep the displayed text in sync when the parent sets the address externally (e.g.
  // GPS pin, map-pin drag, or "Objednat znovu" prefill) without reopening the dropdown.
  useEffect(() => {
    setQuery(value.address)
  }, [value.address])

  function handleType(next: string): void {
    setQuery(next)
    setOpen(true)
    // Typing a freeform address clears any previously resolved coordinates.
    onChange({ address: next, lat: null, lng: null })
  }

  function handlePick(item: GeoSuggestItem): void {
    setOpen(false)
    setQuery(item.label)
    onChange({ address: item.label, lat: item.lat, lng: item.lng })
  }

  function handleUseMyLocation(): void {
    setGeoDenied(false)
    if (!navigator.geolocation) {
      setGeoDenied(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOpen(false)
        setQuery(t('customer.custom.myLocationLabel'))
        onChange({
          address: t('customer.custom.myLocationLabel'),
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      () => setGeoDenied(true),
    )
  }

  const showList = open && (items.length > 0 || isEmpty)

  return (
    <Field>
      <Label htmlFor={`addr-${label}`}>{t(label)}</Label>
      <Input
        id={`addr-${label}`}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={t(placeholder)}
        value={query}
        onChange={(e) => handleType(e.target.value)}
      />

      {showUseMyLocation && (
        <LocationButton type="button" onClick={handleUseMyLocation}>
          {t('customer.custom.useMyLocation')}
        </LocationButton>
      )}

      {geoDenied && <Message role="status">{t('customer.custom.locationDenied')}</Message>}

      {showList && items.length > 0 && (
        <List role="listbox" aria-label={t('customer.custom.suggestionsLabel')}>
          {items.map((item) => {
            const meta = suggestionMeta(item)
            return (
              <Option
                key={`${item.label}-${item.lat}-${item.lng}`}
                role="option"
                aria-selected={value.address === item.label}
                tabIndex={0}
                onClick={() => handlePick(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handlePick(item)
                  }
                }}
              >
                <OptionLabel>{item.label}</OptionLabel>
                {meta && <OptionMeta>{meta}</OptionMeta>}
              </Option>
            )
          })}
        </List>
      )}

      {showList && items.length === 0 && isEmpty && (
        <Empty role="status">{t('customer.custom.noSuggestions')}</Empty>
      )}
    </Field>
  )
}
