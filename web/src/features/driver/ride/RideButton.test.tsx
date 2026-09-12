import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import { RideButton } from './RideButton'
import { deriveRideButtons } from './rideButtonState'

function renderButton(
  status: string,
  opts: {
    noShowEnabled?: boolean
    noShowCountdownSeconds?: number | null
    hasDropoff?: boolean
    onPrimary?: () => void
    onNav?: () => void
    onSecondary?: () => void
    pending?: boolean
  } = {},
) {
  const state = deriveRideButtons(
    status,
    opts.noShowEnabled ?? false,
    opts.noShowCountdownSeconds ?? null,
    opts.hasDropoff ?? true,
  )
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider theme={theme}>
        <RideButton
          state={state}
          pending={opts.pending ?? false}
          onPrimary={opts.onPrimary ?? vi.fn()}
          onNav={opts.onNav ?? vi.fn()}
          onSecondary={opts.onSecondary ?? vi.fn()}
        />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

describe('RideButton', () => {
  it('Accepted shows Navigovat + Jsem na místě', () => {
    renderButton('Accepted')
    expect(screen.getByRole('button', { name: 'Navigovat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jsem na místě' })).toBeInTheDocument()
  })

  it('Arrived shows Zahájit jízdu and a disabled Zákazník nepřišel with countdown', () => {
    renderButton('Arrived', { noShowEnabled: false, noShowCountdownSeconds: 120 })
    expect(screen.getByRole('button', { name: 'Zahájit jízdu' })).toBeInTheDocument()
    const noShow = screen.getByRole('button', { name: /Zákazník nepřišel|Dostupné za/ })
    expect(noShow).toBeDisabled()
  })

  it('Arrived enables no-show once the timer elapses', () => {
    renderButton('Arrived', { noShowEnabled: true })
    expect(screen.getByRole('button', { name: 'Zákazník nepřišel' })).toBeEnabled()
  })

  it('InProgress shows Navigovat k cíli + Ukončit jízdu', () => {
    renderButton('InProgress')
    expect(screen.getByRole('button', { name: 'Navigovat k cíli' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ukončit jízdu' })).toBeInTheDocument()
  })

  it('InProgress without dropoff hides the nav button', () => {
    renderButton('InProgress', { hasDropoff: false })
    expect(screen.queryByRole('button', { name: 'Navigovat k cíli' })).not.toBeInTheDocument()
  })

  it('fires onPrimary when the primary button is tapped', async () => {
    const onPrimary = vi.fn()
    renderButton('Accepted', { onPrimary })
    await userEvent.click(screen.getByRole('button', { name: 'Jsem na místě' }))
    expect(onPrimary).toHaveBeenCalled()
  })

  it('fires onNav when the nav button is tapped', async () => {
    const onNav = vi.fn()
    renderButton('Accepted', { onNav })
    await userEvent.click(screen.getByRole('button', { name: 'Navigovat' }))
    expect(onNav).toHaveBeenCalled()
  })

  it('has no axe violations', async () => {
    const { container } = renderButton('Arrived', { noShowEnabled: true })
    expect(await axe(container)).toHaveNoViolations()
  })
})
