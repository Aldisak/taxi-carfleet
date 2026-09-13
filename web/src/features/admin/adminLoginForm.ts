export interface AdminLoginFormValues {
  email: string
  password: string
}

export interface AdminLoginFormErrors {
  email?: string
  password?: string
}

/**
 * Validates the SuperAdmin login form and returns i18n keys for invalid fields.
 * The caller translates the keys via t(). Shape mirrors the staff login schema (email + password),
 * minus the fleet slug — a SuperAdmin is fleetless.
 */
export function validateAdminLoginForm(values: AdminLoginFormValues): AdminLoginFormErrors {
  const errors: AdminLoginFormErrors = {}

  if (!values.email.trim()) {
    errors.email = 'admin.login.validation.emailRequired'
  } else if (!values.email.includes('@')) {
    errors.email = 'admin.login.validation.emailInvalid'
  }

  if (!values.password) {
    errors.password = 'admin.login.validation.passwordRequired'
  }

  return errors
}
