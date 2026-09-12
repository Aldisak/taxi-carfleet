import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import { CancelDialog } from './CancelDialog'

function renderDialog(props: Partial<React.ComponentProps<typeof CancelDialog>> = {}) {
  const onConfirm = props.onConfirm ?? vi.fn()
  const onDismiss = props.onDismiss ?? vi.fn()
  const utils = render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <CancelDialog isPending={false} showAcceptedHint={false} {...props} onConfirm={onConfirm} onDismiss={onDismiss} />
      </I18nextProvider>
    </ThemeProvider>,
  )
  return { ...utils, onConfirm, onDismiss }
}

describe('CancelDialog', () => {
  it('renders a dialog with exactly two buttons', () => {
    renderDialog()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
  })

  it('shows the post-accepted hint when requested', () => {
    renderDialog({ showAcceptedHint: true })
    expect(screen.getByText(/řidič už jede/i)).toBeInTheDocument()
  })

  it('calls onConfirm when the confirm button is pressed', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog()
    await user.click(screen.getByRole('button', { name: /ano, zrušit/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onDismiss when the dismiss button is pressed', async () => {
    const user = userEvent.setup()
    const { onDismiss } = renderDialog()
    await user.click(screen.getByRole('button', { name: /ne, ponechat/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const { onDismiss } = renderDialog()
    await user.keyboard('{Escape}')
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('has no axe violations', async () => {
    const { container } = renderDialog()
    expect(await axe(container)).toHaveNoViolations()
  })
})
