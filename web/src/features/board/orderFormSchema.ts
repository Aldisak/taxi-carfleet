import { normalizePhone } from './phoneNormalization'

export interface AddressField {
  address: string
  lat: number | null
  lng: number | null
}

export interface OrderFormValues {
  phone: string
  name: string
  pickup: AddressField
  dropoff: AddressField
  asap: boolean
  scheduledAt: string // ISO datetime string, empty when asap=true
  passengers: number
  note: string
}

export interface OrderFormErrors {
  phone?: string
  pickup?: string
  scheduledAt?: string
  passengers?: string
}

/**
 * Validates the order form and returns i18n keys for invalid fields.
 * The caller is responsible for translating the keys via t().
 */
export function validateOrderForm(values: OrderFormValues): OrderFormErrors {
  const errors: OrderFormErrors = {}

  if (!values.phone.trim()) {
    errors.phone = 'board.form.validation.phoneRequired'
  } else if (!normalizePhone(values.phone)) {
    errors.phone = 'board.form.validation.phoneInvalid'
  }

  if (!values.pickup.address.trim()) {
    errors.pickup = 'board.form.validation.pickupRequired'
  } else if (values.pickup.lat === null || values.pickup.lng === null) {
    errors.pickup = 'board.form.validation.pickupNoCoords'
  }

  if (!values.asap && values.scheduledAt) {
    const scheduledDate = new Date(values.scheduledAt)
    if (isNaN(scheduledDate.getTime())) {
      errors.scheduledAt = 'board.form.validation.scheduledAtInvalid'
    } else if (scheduledDate <= new Date()) {
      errors.scheduledAt = 'board.form.validation.scheduledAtPast'
    }
  }

  if (values.passengers < 1) {
    errors.passengers = 'board.form.validation.passengersMin'
  }

  return errors
}
