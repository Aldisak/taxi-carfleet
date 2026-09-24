import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useLanguage } from './useLanguage'
import { SUPPORTED_LOCALES, type LocaleCode } from './locales'

/**
 * Relative wrapper that draws the dropdown chevron with CSS (so it recolours with
 * the theme and needs no icon-direction assumptions). `pointer-events: none` lets
 * clicks fall through to the native `<select>` underneath.
 */
const Wrapper = styled.span`
  position: relative;
  display: inline-flex;
  align-items: center;

  &::after {
    content: '';
    position: absolute;
    right: 14px;
    width: 7px;
    height: 7px;
    border-right: 2px solid var(--ink-2);
    border-bottom: 2px solid var(--ink-2);
    transform: translateY(-2px) rotate(45deg);
    pointer-events: none;
  }
`

const Select = styled.select`
  appearance: none;
  min-height: 48px;
  padding: 0 34px 0 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  font-family: inherit;
  font-size: var(--fs-body);
  color: var(--ink);
  background: var(--surface);
  cursor: pointer;

  &:hover {
    background: var(--surface-2);
  }

  &:focus-visible {
    outline: none;
    border-color: var(--ink);
    box-shadow: 0 0 0 2px var(--ink);
  }
`

/**
 * Shared UI-language switcher (spec §4): a native `<select>` sized for touch (48px),
 * one option per registered locale (`nativeName`). Placed in all three clients
 * (dispatcher/admin nav, driver settings, customer chrome). Iterates the registry so a
 * seventh locale needs no edit here (AC#8). Styling reads the GlobalStyle CSS custom
 * properties (`--surface`, `--ink`, `--line`, `--r-sm`, `--fs-body`) so it matches the
 * desk kit and flips correctly under `[data-theme="dark"]`. The accessible name comes
 * from `common.language`; selecting an option switches i18n, persists, and updates
 * `<html lang>` via `useLanguage().setLanguage`.
 */
export function LanguageSelector() {
  const { t } = useTranslation()
  const { current, setLanguage } = useLanguage()

  return (
    <Wrapper>
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
    </Wrapper>
  )
}
