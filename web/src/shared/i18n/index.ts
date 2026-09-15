import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import csCZ from './cs-CZ.json'
import enUS from './en-US.json'
import ruRU from './ru-RU.json'
import ukUA from './uk-UA.json'
import filPH from './fil-PH.json'
import deDE from './de-DE.json'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './locales'

/**
 * i18n resources keyed by culture code. Parity/registry consumers read this map
 * rather than re-importing individual JSONs, so adding a locale touches only
 * this file + `locales.ts` (AC#8).
 */
export const resources = {
  'cs-CZ': { translation: csCZ },
  'en-US': { translation: enUS },
  'ru-RU': { translation: ruRU },
  'uk-UA': { translation: ukUA },
  'fil-PH': { translation: filPH },
  'de-DE': { translation: deDE },
}

i18n.use(initReactI18next).init({
  lng: DEFAULT_LOCALE, // static default; browser detection lives in applyInitialLanguage() (main.tsx only)
  fallbackLng: 'en-US',
  resources,
  supportedLngs: SUPPORTED_LOCALES.map(l => l.code),
  interpolation: {
    escapeValue: false, // React already escapes values
  },
})

export default i18n
