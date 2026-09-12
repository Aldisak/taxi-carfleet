export interface LoginFormValues {
  fleetSlug: string
  email: string
  password: string
}

export interface LoginFormErrors {
  fleetSlug?: string
  email?: string
  password?: string
}

/**
 * Validates the login form and returns i18n keys for invalid fields.
 * The caller is responsible for translating the keys via t().
 */
export function validateLoginForm(values: LoginFormValues): LoginFormErrors {
  const errors: LoginFormErrors = {}

  if (!values.fleetSlug.trim()) {
    errors.fleetSlug = 'login.validation.fleetSlugRequired'
  }

  if (!values.email.trim()) {
    errors.email = 'login.validation.emailRequired'
  } else if (!values.email.includes('@')) {
    errors.email = 'login.validation.emailInvalid'
  }

  if (!values.password) {
    errors.password = 'login.validation.passwordRequired'
  }

  return errors
}

/**
 * Parses the fleet slug from the current hostname's subdomain.
 * Returns null for localhost, IP addresses, or apex domains (no subdomain).
 */
export function parseSubdomainSlug(host: string): string | null {
  // Strip port
  const hostname = host.split(':')[0]

  // Reject localhost
  if (hostname === 'localhost') return null

  // Reject IP addresses (simple check: all parts are numeric)
  const parts = hostname.split('.')
  if (parts.every(p => /^\d+$/.test(p))) return null

  // Need at least 3 parts for a subdomain (subdomain.domain.tld)
  if (parts.length < 3) return null

  return parts[0]
}
