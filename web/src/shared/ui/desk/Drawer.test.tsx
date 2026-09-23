import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from '../../test/axe'
import { Drawer } from './Drawer'

/** Stateful harness: a trigger opens the drawer; onClose closes it (drives focus restore). */
function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <Drawer
        open={open}
        title="Objednávka #K4F7"
        closeLabel="Zavřít"
        onClose={() => setOpen(false)}
        status={<span>Nová</span>}
      >
        <button type="button">první</button>
        <button type="button">druhá</button>
      </Drawer>
    </>
  )
}

describe('Drawer', () => {
  it('does not render when closed', () => {
    render(
      <Drawer open={false} title="X" closeLabel="Zavřít" onClose={vi.fn()}>
        <p>obsah</p>
      </Drawer>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders a modal dialog with the title as its accessible name', () => {
    render(
      <Drawer open title="Objednávka #K4F7" closeLabel="Zavřít" onClose={vi.fn()}>
        <p>obsah</p>
      </Drawer>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Objednávka #K4F7' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('renders the status slot and the close button', () => {
    render(
      <Drawer
        open
        title="Objednávka"
        closeLabel="Zavřít"
        onClose={vi.fn()}
        status={<span>Nová</span>}
      >
        <p>obsah</p>
      </Drawer>,
    )
    expect(screen.getByText('Nová')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zavřít' })).toBeInTheDocument()
  })

  it('renders children inside the dialog', () => {
    render(
      <Drawer open title="X" closeLabel="Zavřít" onClose={vi.fn()}>
        <p>tělo zásuvky</p>
      </Drawer>,
    )
    expect(within(screen.getByRole('dialog')).getByText('tělo zásuvky')).toBeInTheDocument()
  })

  it('moves focus into the drawer when it opens', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'open' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('closes on Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'open' })
    await user.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('fires onClose when the close button is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Drawer open title="X" closeLabel="Zavřít" onClose={onClose}>
        <p>obsah</p>
      </Drawer>,
    )
    await user.click(screen.getByRole('button', { name: 'Zavřít' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('fires onClose when the scrim is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Drawer open title="X" closeLabel="Zavřít" onClose={onClose}>
        <p>obsah</p>
      </Drawer>,
    )
    await user.click(screen.getByTestId('drawer-scrim'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('traps focus: Tab from the last focusable wraps to the first', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'open' }))
    const close = screen.getByRole('button', { name: 'Zavřít' })
    const first = screen.getByRole('button', { name: 'první' })
    const second = screen.getByRole('button', { name: 'druhá' })
    // focus order: close, první, druhá; Tab from last wraps to first
    second.focus()
    await user.tab()
    expect(close).toHaveFocus()
    // Shift+Tab from first wraps to last
    close.focus()
    await user.tab({ shift: true })
    expect(second).toHaveFocus()
    expect(first).not.toHaveFocus()
  })

  it('has no axe violations', async () => {
    const { baseElement } = render(
      <Drawer
        open
        title="Objednávka #K4F7"
        closeLabel="Zavřít"
        onClose={vi.fn()}
        status={<span>Nová</span>}
      >
        <button type="button">akce</button>
      </Drawer>,
    )
    expect(await axe(baseElement)).toHaveNoViolations()
  })
})
