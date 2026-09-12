/** Validation for staff invite/edit forms — mirrors the C# CreateStaffValidator. */

export interface InviteFormValues {
  email: string
  displayName: string
  role: string
  phone: string
}

export interface InviteFormErrors {
  email?: string
  displayName?: string
  role?: string
}

/**
 * Validates staff invite form values.
 * Rules mirror Taxi.Api CreateStaffValidator:
 *   email: NotEmpty, valid email format
 *   displayName: NotEmpty
 *   role: NotEmpty
 */
export function validateInviteForm(
  values: InviteFormValues,
  t: (k: string) => string,
): InviteFormErrors {
  const errors: InviteFormErrors = {}
  if (!values.email.trim()) {
    errors.email = t('settings.people.validation.emailRequired')
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = t('settings.people.validation.emailInvalid')
  }
  if (!values.displayName.trim()) {
    errors.displayName = t('settings.people.validation.displayNameRequired')
  }
  if (!values.role) {
    errors.role = t('settings.people.validation.roleRequired')
  }
  return errors
}
