import type { LocaleCode } from './locales'

/**
 * Curated set of non-brand, full-sentence i18n keys (3 dispatcher, 3 customer).
 *
 * Parity alone can go GREEN with Czech placeholder copies, giving no observable
 * RED that a locale was actually translated. Each enforced locale must have a
 * value for every one of these keys that DIFFERS from the `cs-CZ` value — proving
 * the copy was overwritten with real translation.
 *
 * These are deliberately full sentences (login/validation/dialog text), never
 * brand tokens, so the "brand tokens legitimately match" objection does not apply.
 */
export const SENTINEL_KEYS = [
  'login.invalidCredentials',
  'board.form.validation.phoneInvalid',
  'settings.accessDenied',
  'customer.order.loginPrompt',
  'customer.tracking.cancelDialogBody',
  'customer.login.codeMismatch',
] as const

/**
 * Locales whose sentinel values are enforced to differ from `cs-CZ`.
 *
 * Seeded EMPTY: WI-1 stays GREEN (the sentinel test iterates this list, so an
 * empty list passes vacuously). Each language WI (WI-3…6) appends its own code
 * here — an observable RED against the placeholder seed, GREEN after real
 * translation lands. Do NOT harden this to all four in WI-1.
 */
export const ENFORCED_LOCALES: LocaleCode[] = ['ru-RU', 'uk-UA', 'fil-PH', 'de-DE']
