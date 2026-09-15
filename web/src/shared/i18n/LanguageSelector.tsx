import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useLanguage } from './useLanguage'
import { SUPPORTED_LOCALES, type LocaleCode } from './locales'

const Select = styled.select`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.surface};
  appearance: auto;
  cursor: pointer;
`

/**
 * Shared UI-language switcher (spec §4): a native `<select>` sized for touch,
 * one option per registered locale (`nativeName`). Placed in all three clients
 * (dispatcher nav, driver settings, customer header). Iterates the registry so a
 * seventh locale needs no edit here (AC#8). The accessible name comes from
 * `common.language`; selecting an option switches i18n, persists, and updates
 * `<html lang>` via `useLanguage().setLanguage`.
 */
export function LanguageSelector() {
  const { t } = useTranslation()
  const { current, setLanguage } = useLanguage()

  return (
    <Select
      aria-label={t('common.language')}
      value={current}
      onChange={e => void setLanguage(e.target.value as LocaleCode)}
    >
      {SUPPORTED_LOCALES.map(locale => (
        <option key={locale.code} value={locale.code}>
          {locale.nativeName}
        </option>
      ))}
    </Select>
  )
}
