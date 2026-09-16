import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../i18n'
import { theme } from '../theme/theme'
import { axe } from '../test/axe'
import { BottomSheet } from './BottomSheet'

function wrap(ui: React.ReactNode) {
  return (
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
    </ThemeProvider>
  )
}

/**
 * Stateful harness exercising the real controlled contract: a trigger button toggles `open`,
 * and `onClose` flips it back to false — so the open→false transition drives focus restore.
 */
function Harness({ ariaLabelKey = 'customer.sheet.label' }: { ariaLabelKey?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <BottomSheet
        open={open}
        expanded
        ariaLabelKey={ariaLabelKey}
        onClose={() => setOpen(false)}
      >
        <button type="button">inner action</button>
        <p>obsah panelu</p>
      </BottomSheet>
    </>
  )
}

describe('BottomSheet', () => {
  it('moves focus into the sheet when it opens', async () => {
    const user = userEvent.setup()
    render(wrap(<Harness />))

    await user.click(screen.getByRole('button', { name: 'open' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('collapses/closes on Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup()
    render(wrap(<Harness />))

    const trigger = screen.getByRole('button', { name: 'open' })
    await user.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('fires onClose when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      wrap(
        <BottomSheet open expanded ariaLabelKey="customer.sheet.label" onClose={onClose}>
          <p>obsah</p>
        </BottomSheet>,
      ),
    )

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('exposes a dialog role with the i18n aria-label', () => {
    render(
      wrap(
        <BottomSheet open expanded ariaLabelKey="customer.sheet.label" onClose={vi.fn()}>
          <p>obsah</p>
        </BottomSheet>,
      ),
    )

    expect(
      screen.getByRole('dialog', { name: i18n.t('customer.sheet.label') }),
    ).toBeInTheDocument()
  })

  it('renders children inside the scrollable content region', () => {
    render(
      wrap(
        <BottomSheet open expanded ariaLabelKey="customer.sheet.label" onClose={vi.fn()}>
          <p>dlouhý obsah</p>
        </BottomSheet>,
      ),
    )

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('dlouhý obsah')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(
      wrap(
        <BottomSheet open={false} expanded ariaLabelKey="customer.sheet.label" onClose={vi.fn()}>
          <p>obsah</p>
        </BottomSheet>,
      ),
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = render(
      wrap(
        <BottomSheet open expanded ariaLabelKey="customer.sheet.label" onClose={vi.fn()}>
          <button type="button">akce</button>
        </BottomSheet>,
      ),
    )

    expect(await axe(container)).toHaveNoViolations()
  })
})
