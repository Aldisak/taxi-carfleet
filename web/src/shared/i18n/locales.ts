/**
 * Single source of truth for the supported UI locales.
 *
 * Adding a language is exactly:
 *  1. drop in an `xx-YY.json` with the same key set as `cs-CZ.json`,
 *  2. add one entry to `SUPPORTED_LOCALES`,
 *  3. add one `import` + resources line in `index.ts`.
 * The selector, i18n config, detection, and parity test all derive from this list.
 */
export const SUPPORTED_LOCALES = [
  { code: 'cs-CZ', nativeName: 'Čeština' },
  { code: 'en-US', nativeName: 'English' },
  { code: 'ru-RU', nativeName: 'Русский' },
  { code: 'uk-UA', nativeName: 'Українська' },
  { code: 'fil-PH', nativeName: 'Filipino' },
  { code: 'de-DE', nativeName: 'Deutsch' },
] as const

/** Culture code of a supported locale, e.g. `'cs-CZ'`. */
export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]['code']

/** The default UI language — formatting stays `cs-CZ`/Europe/Prague regardless of UI language. */
export const DEFAULT_LOCALE: LocaleCode = 'cs-CZ'
