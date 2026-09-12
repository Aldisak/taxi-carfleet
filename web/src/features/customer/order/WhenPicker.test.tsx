import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import { WhenPicker, type WhenMode } from './WhenPicker'

function renderPicker(mode: WhenMode = 'now') {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <WhenPicker
          mode={mode}
          onModeChange={() => undefined}
          scheduledAt=""
          onScheduledAtChange={() => undefined}
          min="2026-09-12T12:20"
          max="2026-09-19T12:00"
        />
      </I18nextProvider>
    </ThemeProvider>,
  )
}

describe('WhenPicker', () => {
  it('marks the active mode with aria-pressed', () => {
    renderPicker('now')
    expect(screen.getByRole('button', { name: /hned/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /na čas/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reveals the datetime input only in the scheduled mode', () => {
    const { rerender } = renderPicker('now')
    expect(screen.queryByLabelText(/datum a čas/i)).not.toBeInTheDocument()

    rerender(
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <WhenPicker
            mode="scheduled"
            onModeChange={() => undefined}
            scheduledAt=""
            onScheduledAtChange={() => undefined}
            min="2026-09-12T12:20"
            max="2026-09-19T12:00"
          />
        </I18nextProvider>
      </ThemeProvider>,
    )
    expect(screen.getByLabelText(/datum a čas/i)).toBeInTheDocument()
  })

  it('has no axe violations (scheduled mode, input visible)', async () => {
    const { container } = renderPicker('scheduled')
    expect(await axe(container)).toHaveNoViolations()
  })
})
