import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import cs from './cs.json'
import en from './en.json'

i18n.use(initReactI18next).init({
  lng: 'cs',
  fallbackLng: 'en',
  resources: {
    cs: { translation: cs },
    en: { translation: en },
  },
  interpolation: {
    escapeValue: false, // React already escapes values
  },
})

export default i18n
