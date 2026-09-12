/** Validation for vehicle create/edit forms — mirrors the C# CreateVehicleValidator. */

export interface VehicleFormValues {
  plate: string
  make: string
  model: string
  color: string
  seats: string
}

export interface VehicleFormErrors {
  plate?: string
  make?: string
  model?: string
  color?: string
  seats?: string
}

/**
 * Validates vehicle form values.
 * Rules mirror Taxi.Api CreateVehicleValidator:
 *   plate: NotEmpty, MaximumLength(20)
 *   make, model, color: NotEmpty
 *   seats: GreaterThanOrEqualTo(1)
 */
export function validateVehicleForm(
  values: VehicleFormValues,
  t: (k: string) => string,
): VehicleFormErrors {
  const errors: VehicleFormErrors = {}
  if (!values.plate.trim()) {
    errors.plate = t('settings.vehicles.validation.plateRequired')
  } else if (values.plate.length > 20) {
    errors.plate = t('settings.vehicles.validation.plateTooLong')
  }
  if (!values.make.trim()) errors.make = t('settings.vehicles.validation.makeRequired')
  if (!values.model.trim()) errors.model = t('settings.vehicles.validation.modelRequired')
  if (!values.color.trim()) errors.color = t('settings.vehicles.validation.colorRequired')
  if (!values.seats || Number(values.seats) < 1) errors.seats = t('settings.vehicles.validation.seatsMin')
  return errors
}
