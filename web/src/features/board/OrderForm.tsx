import { useRef, useEffect, useCallback, useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useCreateOrder, toCreateOrderRequest } from './useCreateOrder'
import { useHubConnectionState, isServerActionBlocked } from '../../shared/realtime/useFleetHub'
import { useAddressSuggest } from './useAddressSuggest'
import { useRouteEstimate } from './useRouteEstimate'
import { validateOrderForm } from './orderFormSchema'
import { QUICK_CHIPS } from './quickChips'
import type { OrderFormValues, AddressField, OrderFormErrors } from './orderFormSchema'
import type { GeoSuggestItem } from '../../shared/api/client'

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  height: 100%;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
`

const FieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const Label = styled.label`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const Input = styled.input`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.surface};
  width: 100%;
  box-sizing: border-box;

  &:focus {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &[aria-invalid='true'] {
    border-color: ${({ theme }) => theme.colors.error};
  }
`

const ErrorMsg = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ theme }) => theme.colors.error};
  min-height: 16px;
`

const ChipsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.xs};
  margin-top: 2px;
`

const Chip = styled.button`
  padding: 2px ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: ${({ theme }) => theme.colors.primary};
    color: #fff;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`

const SuggestList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: ${({ theme }) => theme.colors.surface};
  box-shadow: ${({ theme }) => theme.shadows.md};
  max-height: 160px;
  overflow-y: auto;
  position: absolute;
  left: 0;
  right: 0;
  z-index: 100;
`

const SuggestItem = styled.li<{ $highlighted: boolean }>`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  cursor: pointer;
  background: ${({ $highlighted, theme }) => ($highlighted ? theme.colors.primary : 'transparent')};
  color: ${({ $highlighted, theme }) => ($highlighted ? '#fff' : theme.colors.text)};

  &:hover {
    background: ${({ theme }) => theme.colors.primary};
    color: #fff;
  }
`

const WhenRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: center;
`

const AsapToggle = styled.button<{ $active: boolean }>`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.border)};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: ${({ $active, theme }) => ($active ? theme.colors.primary : 'transparent')};
  color: ${({ $active }) => ($active ? '#fff' : 'inherit')};
  cursor: pointer;
  flex-shrink: 0;
`

const PricePreview = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: ${({ theme }) => theme.spacing.xs} 0;
  min-height: 20px;
`

const SubmitBtn = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  cursor: pointer;
  width: 100%;
  margin-top: ${({ theme }) => theme.spacing.sm};

  &:hover {
    background: ${({ theme }) => theme.colors.primaryDark};
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`

// ---------------------------------------------------------------------------
// Address autocomplete sub-component
// ---------------------------------------------------------------------------

interface AddressInputProps {
  id: string
  label: string
  value: string
  onChange: (val: string) => void
  onSelect: (item: GeoSuggestItem) => void
  onClear: () => void
  error?: string
  'aria-label'?: string
}

function AddressInput({ id, label, value, onChange, onSelect, onClear, error }: AddressInputProps) {
  const { items, clear } = useAddressSuggest(value)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (items.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(i => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Escape') {
      clear()
      onClear()
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault()
      // Stop the event from bubbling to the form's onKeyDown, which would submit the form
      // while the user is still selecting an autocomplete suggestion.
      e.stopPropagation()
      const item = items[highlightedIndex]
      if (item) {
        onSelect(item)
        clear()
        setHighlightedIndex(-1)
      }
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setHighlightedIndex(-1)
    onChange(e.target.value)
  }

  function handleItemClick(item: GeoSuggestItem) {
    onSelect(item)
    clear()
    setHighlightedIndex(-1)
  }

  return (
    <div style={{ position: 'relative' }}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        aria-label={label}
        aria-invalid={!!error}
        aria-autocomplete="list"
        aria-expanded={items.length > 0}
        autoComplete="off"
      />
      {error && <ErrorMsg role="alert">{error}</ErrorMsg>}
      {items.length > 0 && (
        <SuggestList role="listbox">
          {items.map((item, i) => (
            <SuggestItem
              key={`${item.lat}-${item.lng}`}
              role="option"
              aria-selected={i === highlightedIndex}
              $highlighted={i === highlightedIndex}
              onMouseDown={(e) => {
                e.preventDefault()
                handleItemClick(item)
              }}
            >
              {item.label}
            </SuggestItem>
          ))}
        </SuggestList>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

const INITIAL_VALUES: OrderFormValues = {
  phone: '',
  name: '',
  pickup: { address: '', lat: null, lng: null },
  dropoff: { address: '', lat: null, lng: null },
  asap: true,
  scheduledAt: '',
  passengers: 1,
  note: '',
}

export interface OrderFormProps {
  onOrderCreated?: () => void
}

/** The dispatcher's New Order form — left column of the board. */
export function OrderForm({ onOrderCreated }: OrderFormProps) {
  const { t } = useTranslation()
  const phoneRef = useRef<HTMLInputElement>(null)
  const [values, setValues] = useState<OrderFormValues>(INITIAL_VALUES)
  const [errors, setErrors] = useState<OrderFormErrors>({})
  const [submitted, setSubmitted] = useState(false)

  const createOrder = useCreateOrder()
  const connectionState = useHubConnectionState()
  const blocked = isServerActionBlocked(connectionState)

  const routeEstimate = useRouteEstimate({
    fromLat: values.pickup.lat,
    fromLng: values.pickup.lng,
    toLat: values.dropoff.lat,
    toLng: values.dropoff.lng,
  })

  // F2 focus handler — registered at window level
  useEffect(() => {
    function handleF2(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault()
        phoneRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleF2)
    return () => window.removeEventListener('keydown', handleF2)
  }, [])

  function setField<K extends keyof OrderFormValues>(key: K, val: OrderFormValues[K]) {
    setValues(prev => ({ ...prev, [key]: val }))
  }

  function setAddressField(key: 'pickup' | 'dropoff', partial: Partial<AddressField>) {
    setValues(prev => ({ ...prev, [key]: { ...prev[key], ...partial } }))
  }

  const validate = useCallback(() => {
    const errs = validateOrderForm(values)
    setErrors(errs)
    return Object.keys(errs).length === 0
  }, [values])

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (blocked) return
    setSubmitted(true)
    if (!validate()) return

    try {
      const req = toCreateOrderRequest(values, routeEstimate.estimatedPriceCzk)
      await createOrder.mutateAsync(req)
      // Clear form and refocus Phone on success
      setValues(INITIAL_VALUES)
      setErrors({})
      setSubmitted(false)
      onOrderCreated?.()
      // Slight delay to ensure React has re-rendered before focusing
      setTimeout(() => phoneRef.current?.focus(), 0)
    } catch {
      // Mutation error handled by TanStack Query; form is not cleared
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
      // preventDefault stops the browser's native form submit from also firing,
      // so handleSubmit is called exactly once (not twice via onKeyDown + onSubmit).
      e.preventDefault()
      void handleSubmit()
    }
  }

  function handleChipClick(chip: typeof QUICK_CHIPS[number]) {
    setAddressField('pickup', {
      address: chip.address,
      lat: chip.lat,
      lng: chip.lng,
    })
    setErrors(prev => ({ ...prev, pickup: undefined }))
  }

  // Re-validate on change if form was already submitted
  useEffect(() => {
    if (submitted) {
      setErrors(validateOrderForm(values))
    }
  }, [values, submitted])

  return (
    <Form onSubmit={(e) => { void handleSubmit(e) }} onKeyDown={handleKeyDown} noValidate>
      {/* Phone */}
      <FieldGroup>
        <Label htmlFor="order-phone">{t('board.form.phone')}</Label>
        <Input
          id="order-phone"
          ref={phoneRef}
          type="tel"
          value={values.phone}
          onChange={e => setField('phone', e.target.value)}
          aria-label={t('board.form.phone')}
          aria-invalid={!!errors.phone}
          aria-required="true"
          autoComplete="tel"
        />
        {errors.phone && <ErrorMsg role="alert">{t(errors.phone)}</ErrorMsg>}
      </FieldGroup>

      {/* Name */}
      <FieldGroup>
        <Label htmlFor="order-name">{t('board.form.name')}</Label>
        <Input
          id="order-name"
          type="text"
          value={values.name}
          onChange={e => setField('name', e.target.value)}
          aria-label={t('board.form.name')}
          autoComplete="off"
        />
      </FieldGroup>

      {/* Pickup */}
      <FieldGroup>
        <AddressInput
          id="order-pickup"
          label={t('board.form.pickup')}
          value={values.pickup.address}
          onChange={val => setAddressField('pickup', { address: val, lat: null, lng: null })}
          onSelect={item =>
            setAddressField('pickup', { address: item.label, lat: item.lat, lng: item.lng })
          }
          onClear={() => setAddressField('pickup', { address: '', lat: null, lng: null })}
          error={errors.pickup ? t(errors.pickup) : undefined}
        />
        <ChipsRow>
          {QUICK_CHIPS.map(chip => (
            <Chip
              key={chip.label}
              type="button"
              tabIndex={-1}
              aria-label={chip.label}
              onClick={() => handleChipClick(chip)}
            >
              {chip.label}
            </Chip>
          ))}
        </ChipsRow>
      </FieldGroup>

      {/* Dropoff */}
      <FieldGroup>
        <AddressInput
          id="order-dropoff"
          label={t('board.form.dropoff')}
          value={values.dropoff.address}
          onChange={val => setAddressField('dropoff', { address: val, lat: null, lng: null })}
          onSelect={item =>
            setAddressField('dropoff', { address: item.label, lat: item.lat, lng: item.lng })
          }
          onClear={() => setAddressField('dropoff', { address: '', lat: null, lng: null })}
        />
      </FieldGroup>

      {/* When */}
      <FieldGroup>
        <Label>{t('board.form.when')}</Label>
        <WhenRow>
          <AsapToggle
            type="button"
            $active={values.asap}
            onClick={() => setField('asap', true)}
            aria-pressed={values.asap}
          >
            {t('board.form.asap')}
          </AsapToggle>
          <Input
            type="datetime-local"
            value={values.scheduledAt}
            onChange={e => {
              setField('asap', false)
              setField('scheduledAt', e.target.value)
            }}
            aria-label={t('board.form.scheduledAt')}
            aria-invalid={!!errors.scheduledAt}
            style={{ flex: 1 }}
          />
        </WhenRow>
        {errors.scheduledAt && <ErrorMsg role="alert">{t(errors.scheduledAt)}</ErrorMsg>}
      </FieldGroup>

      {/* Passengers */}
      <FieldGroup>
        <Label htmlFor="order-passengers">{t('board.form.passengers')}</Label>
        <Input
          id="order-passengers"
          type="number"
          min={1}
          max={99}
          value={values.passengers}
          onChange={e => setField('passengers', Math.max(1, parseInt(e.target.value, 10) || 1))}
          aria-label={t('board.form.passengers')}
          aria-invalid={!!errors.passengers}
          style={{ width: '80px' }}
        />
        {errors.passengers && <ErrorMsg role="alert">{t(errors.passengers)}</ErrorMsg>}
      </FieldGroup>

      {/* Note */}
      <FieldGroup>
        <Label htmlFor="order-note">{t('board.form.note')}</Label>
        <Input
          as="input"
          id="order-note"
          type="text"
          value={values.note}
          onChange={e => setField('note', e.target.value)}
          aria-label={t('board.form.note')}
        />
      </FieldGroup>

      {/* Price preview (F-03) */}
      <PricePreview aria-live="polite">
        {routeEstimate.estimatedPriceCzk !== null
          ? t('board.form.pricePreview', { price: routeEstimate.estimatedPriceCzk })
          : routeEstimate.distanceMeters !== null
            ? t('board.form.distanceOnly', {
                km: (routeEstimate.distanceMeters / 1000).toFixed(1),
              })
            : null}
      </PricePreview>

      {/* Submit */}
      <SubmitBtn type="submit" disabled={createOrder.isPending || blocked}>
        {createOrder.isPending ? t('board.form.creating') : t('board.form.submit')}
      </SubmitBtn>
    </Form>
  )
}
