import { useEffect, useCallback, useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useCreateOrder, toCreateOrderRequest } from './useCreateOrder'
import { useHubConnectionState, isServerActionBlocked } from '../../shared/realtime/useFleetHub'
import { useAddressSuggest } from './useAddressSuggest'
import { useRouteEstimate } from './useRouteEstimate'
import { validateOrderForm } from './orderFormSchema'
import { useOrderFormPlaces, type OrderFormChip } from './useOrderFormPlaces'
import type { OrderFormValues, AddressField, OrderFormErrors } from './orderFormSchema'
import type { GeoSuggestItem } from '../../shared/api/client'
import { suggestionMeta } from '../../shared/geo/suggestionMeta'
import { Panel, PanelHeader, Ctrl, Lbl, DeskButton, DeskSegmented, DeskPill } from '../../shared/ui/desk'
// The address fields need combobox ARIA + keyboard handling the desk `Ctrl` API does not
// expose (it Picks a fixed attribute set). They render a locally-styled control that mirrors
// the `Ctrl` look via the same CSS custom properties — kept board-local to avoid changing the
// committed desk kit.
import { Icon } from '../../shared/ui/icons/Icon'

// ---------------------------------------------------------------------------
// Styled components — dense desk layout (no scroll at 900px height)
// ---------------------------------------------------------------------------

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
`

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px;
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
`

const Row = styled.div`
  display: flex;
  gap: 10px;
`

const RowCol = styled.div<{ $grow?: number; $basis?: string }>`
  flex: ${({ $grow }) => $grow ?? 1} 1 ${({ $basis }) => $basis ?? '0'};
  min-width: 0;
`

const Hint = styled.span`
  font-size: var(--fs-caption);
  color: var(--ink-3);
`

const ChipsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
`

const PlaceChip = styled.button`
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--r-sm);
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--ink-2);
  font-family: inherit;
  font-size: var(--fs-caption);
  font-weight: var(--fw-bold);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: transform var(--dur-press);

  &:hover {
    color: var(--ink);
    border-color: var(--line-strong);
  }

  &:active {
    transform: scale(0.98);
  }
`

const AddrControl = styled.div<{ $hasError: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 10px;
  border-radius: var(--r-sm);
  background: var(--surface-2);
  border: ${({ $hasError }) => ($hasError ? '2px solid var(--danger)' : '1px solid var(--line)')};

  &:focus-within {
    background: var(--surface);
    border: ${({ $hasError }) => ($hasError ? '2px solid var(--danger)' : '2px solid var(--ink)')};
  }
`

const AddrIcon = styled.span`
  display: inline-flex;
  align-items: center;
  color: var(--ink-3);
`

const AddrInput = styled.input`
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border: none;
  background: transparent;
  outline: none;
  font-family: inherit;
  font-size: var(--fs-body);
  font-weight: var(--fw-regular);
  color: var(--ink);

  &::placeholder {
    color: var(--ink-3);
  }
`

const AddrError = styled.small`
  display: block;
  margin-top: 4px;
  font-size: var(--fs-caption);
  font-weight: var(--fw-bold);
  color: var(--danger);
`

const SuggestList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface);
  box-shadow: var(--shadow-float);
  max-height: 180px;
  overflow-y: auto;
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  z-index: 100;
`

const SuggestItem = styled.li<{ $highlighted: boolean }>`
  padding: 6px 8px;
  border-radius: var(--r-sm);
  font-size: var(--fs-body);
  cursor: pointer;
  color: ${({ $highlighted }) => ($highlighted ? 'var(--on-accent)' : 'var(--ink)')};
  background: ${({ $highlighted }) => ($highlighted ? 'var(--accent)' : 'transparent')};

  &:hover {
    background: var(--accent);
    color: var(--on-accent);
  }
`

const SuggestMeta = styled.span<{ $highlighted: boolean }>`
  display: block;
  font-size: var(--fs-caption);
  color: ${({ $highlighted }) => ($highlighted ? 'var(--on-accent)' : 'var(--ink-3)')};
`

const PriceCardBox = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface-2);
`

const PriceValue = styled.span`
  font-size: 20px;
  font-weight: var(--fw-extra);
  color: var(--ink);
`

const PriceMeta = styled.span`
  margin-left: auto;
  font-size: var(--fs-caption);
  color: var(--ink-3);
`

const PricePlaceholder = styled.span`
  font-size: var(--fs-body);
  color: var(--ink-3);
`

// ---------------------------------------------------------------------------
// Address autocomplete sub-component (desk-styled Ctrl + suggestion popover)
// ---------------------------------------------------------------------------

interface AddressInputProps {
  id: string
  label: string
  value: string
  placeholder?: string
  leadingIcon?: React.ReactNode
  onChange: (val: string) => void
  onSelect: (item: GeoSuggestItem) => void
  onClear: () => void
  error?: string
}

function AddressInput({
  id,
  label,
  value,
  placeholder,
  leadingIcon,
  onChange,
  onSelect,
  onClear,
  error,
}: AddressInputProps) {
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

  function handleItemClick(item: GeoSuggestItem) {
    onSelect(item)
    clear()
    setHighlightedIndex(-1)
  }

  const hasError = error !== undefined && error !== ''
  const errorId = `${id}-error`

  return (
    <div>
      <Lbl htmlFor={id}>{label}</Lbl>
      <div style={{ position: 'relative' }}>
        <AddrControl $hasError={hasError}>
          {leadingIcon && <AddrIcon aria-hidden="true">{leadingIcon}</AddrIcon>}
          <AddrInput
            id={id}
            type="text"
            value={value}
            placeholder={placeholder}
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={items.length > 0}
            aria-invalid={hasError || undefined}
            aria-describedby={hasError ? errorId : undefined}
            onChange={(e) => {
              setHighlightedIndex(-1)
              onChange(e.target.value)
            }}
            onKeyDown={handleKeyDown}
          />
        </AddrControl>
        {hasError && <AddrError id={errorId} role="alert">{error}</AddrError>}
        {items.length > 0 && (
          <SuggestList role="listbox">
            {items.map((item, i) => {
              const meta = suggestionMeta(item)
              return (
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
                  <span>{item.name}</span>
                  {meta && <SuggestMeta $highlighted={i === highlightedIndex}>{meta}</SuggestMeta>}
                </SuggestItem>
              )
            })}
          </SuggestList>
        )}
      </div>
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
  const [values, setValues] = useState<OrderFormValues>(INITIAL_VALUES)
  const [errors, setErrors] = useState<OrderFormErrors>({})
  const [submitted, setSubmitted] = useState(false)

  const chips = useOrderFormPlaces()
  const createOrder = useCreateOrder()
  const connectionState = useHubConnectionState()
  const blocked = isServerActionBlocked(connectionState)

  const routeEstimate = useRouteEstimate({
    fromLat: values.pickup.lat,
    fromLng: values.pickup.lng,
    toLat: values.dropoff.lat,
    toLng: values.dropoff.lng,
  })

  const focusPhone = () => {
    const el = document.getElementById('order-phone') as HTMLInputElement | null
    el?.focus()
  }

  // F2 focus handler — registered at window level
  useEffect(() => {
    function handleF2(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault()
        focusPhone()
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
      setTimeout(focusPhone, 0)
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

  function handleChipClick(chip: OrderFormChip) {
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

  const priceCard = (() => {
    const km = routeEstimate.distanceMeters !== null
      ? (routeEstimate.distanceMeters / 1000).toFixed(1)
      : null
    const min = routeEstimate.durationSeconds !== null
      ? Math.round(routeEstimate.durationSeconds / 60)
      : null

    if (routeEstimate.estimatedPriceCzk !== null) {
      return (
        <PriceCardBox aria-live="polite">
          <PriceValue>{t('board.form.pricePreview', { price: routeEstimate.estimatedPriceCzk })}</PriceValue>
          <DeskPill tone="accent">{t('board.form.fixedPill')}</DeskPill>
          {km !== null && (
            <PriceMeta>
              {min !== null
                ? t('board.form.distanceDuration', { km, min })
                : t('board.form.distanceOnly', { km })}
            </PriceMeta>
          )}
        </PriceCardBox>
      )
    }

    if (km !== null) {
      return (
        <PriceCardBox aria-live="polite">
          <PricePlaceholder>
            {min !== null
              ? t('board.form.distanceDuration', { km, min })
              : t('board.form.distanceOnly', { km })}
          </PricePlaceholder>
        </PriceCardBox>
      )
    }

    return null
  })()

  return (
    <Panel>
      <Wrap>
        <PanelHeader title={t('board.form.title')} right={<Hint>{t('board.form.hint')}</Hint>} />
        <Form onSubmit={(e) => { void handleSubmit(e) }} onKeyDown={handleKeyDown} noValidate>
          {/* Phone + Name on one row */}
          <Row>
            <RowCol>
              <Field>
                <Lbl htmlFor="order-phone">{t('board.form.phone')}</Lbl>
                <Ctrl
                  id="order-phone"
                  type="tel"
                  value={values.phone}
                  onChange={(v) => setField('phone', v)}
                  error={errors.phone ? t(errors.phone) : undefined}
                  autoComplete="tel"
                />
              </Field>
            </RowCol>
            <RowCol>
              <Field>
                <Lbl htmlFor="order-name">{t('board.form.name')}</Lbl>
                <Ctrl
                  id="order-name"
                  type="text"
                  value={values.name}
                  onChange={(v) => setField('name', v)}
                  autoComplete="off"
                />
              </Field>
            </RowCol>
          </Row>

          {/* Pickup + Places chips */}
          <Field>
            <AddressInput
              id="order-pickup"
              label={t('board.form.pickup')}
              value={values.pickup.address}
              placeholder={t('board.form.pickupPlaceholder')}
              leadingIcon={<Icon name="pin" size={16} />}
              onChange={val => setAddressField('pickup', { address: val, lat: null, lng: null })}
              onSelect={item =>
                setAddressField('pickup', { address: item.name, lat: item.lat, lng: item.lng })
              }
              onClear={() => setAddressField('pickup', { address: '', lat: null, lng: null })}
              error={errors.pickup ? t(errors.pickup) : undefined}
            />
            <ChipsRow aria-label={t('board.form.placesFallbackNote')}>
              {chips.map(chip => (
                <PlaceChip
                  key={chip.label}
                  type="button"
                  tabIndex={-1}
                  onClick={() => handleChipClick(chip)}
                >
                  {chip.label}
                </PlaceChip>
              ))}
            </ChipsRow>
          </Field>

          {/* Dropoff */}
          <Field>
            <AddressInput
              id="order-dropoff"
              label={t('board.form.dropoff')}
              value={values.dropoff.address}
              placeholder={t('board.form.dropoffPlaceholder')}
              onChange={val => setAddressField('dropoff', { address: val, lat: null, lng: null })}
              onSelect={item =>
                setAddressField('dropoff', { address: item.name, lat: item.lat, lng: item.lng })
              }
              onClear={() => setAddressField('dropoff', { address: '', lat: null, lng: null })}
            />
          </Field>

          {/* When + Passengers */}
          <Row>
            <RowCol $grow={1}>
              <Field>
                <Lbl htmlFor="order-when">{t('board.form.when')}</Lbl>
                <div id="order-when">
                  <DeskSegmented
                    ariaLabel={t('board.form.when')}
                    value={values.asap ? 'asap' : 'scheduled'}
                    onChange={(v) => setField('asap', v === 'asap')}
                    options={[
                      { value: 'asap', label: t('board.form.asap') },
                      { value: 'scheduled', label: t('board.form.scheduled') },
                    ]}
                  />
                </div>
              </Field>
            </RowCol>
            <RowCol $grow={0} $basis="90px">
              <Field>
                <Lbl htmlFor="order-passengers">{t('board.form.passengers')}</Lbl>
                <Ctrl
                  id="order-passengers"
                  type="number"
                  value={String(values.passengers)}
                  onChange={(v) => setField('passengers', Math.max(1, parseInt(v, 10) || 1))}
                  error={errors.passengers ? t(errors.passengers) : undefined}
                  inputMode="numeric"
                />
              </Field>
            </RowCol>
          </Row>

          {/* Scheduled datetime — only when "Na čas" is selected */}
          {!values.asap && (
            <Field>
              <Lbl htmlFor="order-scheduled-at">{t('board.form.scheduledAt')}</Lbl>
              <Ctrl
                id="order-scheduled-at"
                type="datetime-local"
                value={values.scheduledAt}
                onChange={(v) => setField('scheduledAt', v)}
                error={errors.scheduledAt ? t(errors.scheduledAt) : undefined}
              />
            </Field>
          )}

          {/* Note */}
          <Field>
            <Lbl htmlFor="order-note">{t('board.form.note')}</Lbl>
            <Ctrl
              id="order-note"
              type="text"
              value={values.note}
              onChange={(v) => setField('note', v)}
            />
          </Field>

          {/* Price preview card (F-03) */}
          {priceCard}

          {/* Submit */}
          <DeskButton
            type="submit"
            variant="primary"
            disabled={blocked}
            loading={createOrder.isPending}
            loadingLabel={t('board.form.creating')}
          >
            {t('board.form.submit')}
          </DeskButton>
        </Form>
      </Wrap>
    </Panel>
  )
}
