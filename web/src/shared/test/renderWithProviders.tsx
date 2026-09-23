import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { type ReactElement, type ReactNode } from 'react'
import i18n from '../i18n'
import { theme } from '../theme/theme'

/**
 * Renders a UI element inside the app's styled-components ThemeProvider + i18n provider.
 *
 * The redesigned `shared/ui` kit styles itself from global CSS custom properties
 * (`var(--accent)`, `var(--surface)`, …) rather than the theme object, so the ThemeProvider
 * is here for legacy components and for any consumer that still reads theme tokens; the
 * i18n provider lets callers pass translated strings. jsdom does not apply the CSS vars from
 * GlobalStyle, so tests assert on roles/text/accessibility, not computed colours
 * (rules/web-accessibility.md#jsdom-limits).
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return (
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
      </ThemeProvider>
    )
  }
  return render(ui, { wrapper: Wrapper, ...options })
}
