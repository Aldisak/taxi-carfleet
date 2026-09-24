import cs from './cs.json';
import en from './en.json';

/** Supported UI locales for the product website. Czech is the default. */
export type Locale = 'cs' | 'en';

type Dict = Record<string, string>;

const dictionaries: Record<Locale, Dict> = {
  cs: cs as Dict,
  en: en as Dict,
};

/**
 * Keys whose values contain HTML markup (e.g. `<br>`) and must be rendered
 * with Astro's `set:html` rather than as plain text. Derived from the cs/en
 * dicts by scanning every value for a `<` character.
 */
export const HTML_KEYS: readonly string[] = Object.freeze(
  Array.from(
    new Set(
      (Object.entries(cs as Dict) as [string, string][])
        .concat(Object.entries(en as Dict) as [string, string][])
        .filter(([, value]) => value.includes('<'))
        .map(([key]) => key),
    ),
  ).sort(),
);

/**
 * Translate a dot-notation key for the given locale. Returns the localized
 * string, or the key itself (with a dev-visible warning) when it is missing.
 */
export function t(locale: Locale, key: string): string {
  const value = dictionaries[locale][key];
  if (value === undefined) {
    console.warn(`[i18n] missing key "${key}" for locale "${locale}"`);
    return key;
  }
  return value;
}
