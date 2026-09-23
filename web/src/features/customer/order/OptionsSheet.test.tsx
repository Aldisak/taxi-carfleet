import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import { OptionsSheet, type OptionsSheetProps } from './OptionsSheet'

function renderSheet(overrides: Partial<OptionsSheetProps> = {}) {
  const props: OptionsSheetProps = {
    open: true,
    whenMode: 'now',
    onWhenModeChange: vi.fn(),
    scheduledAt: '',
    onScheduledAtChange: vi.fn(),
    passengers: 1,
    onPassengersChange: vi.fn(),
    note: '',
    onNoteChange: vi.fn(),
    onDone: vi.fn(),
    ...overrides,
  }
  const utils = render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <OptionsSheet {...props} />
      </I18nextProvider>
    </ThemeProvider>,
  )
  return { ...utils, props }
}

describe('OptionsSheet', () => {
  it('renders nothing when closed', () => {
    renderSheet({ open: false })
    expect(screen.queryByText(/možnosti jízdy/i)).not.toBeInTheDocument()
  })

  it('shows the when toggle, passenger stepper, note field and a Hotovo button when open', () => {
    renderSheet()
    expect(screen.getByText(/kdy vás vyzvednout/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hned/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /přidat cestujícího/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/kde přesně vás vyzvedneme/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^hotovo$/i })).toBeInTheDocument()
  })

  it('reveals the datetime input only in the scheduled mode', () => {
    renderSheet({ whenMode: 'scheduled' })
    expect(screen.getByLabelText(/datum a čas/i)).toBeInTheDocument()
  })

  it('Hotovo fires onDone', async () => {
    const user = userEvent.setup()
    const { props } = renderSheet()
    await user.click(screen.getByRole('button', { name: /^hotovo$/i }))
    expect(props.onDone).toHaveBeenCalledTimes(1)
  })

  it('Escape fires onDone (closes the options)', async () => {
    const user = userEvent.setup()
    const { props } = renderSheet()
    await user.keyboard('{Escape}')
    expect(props.onDone).toHaveBeenCalledTimes(1)
  })

  it('note typing forwards each value to onNoteChange', async () => {
    const user = userEvent.setup()
    const { props } = renderSheet()
    await user.type(screen.getByLabelText(/kde přesně vás vyzvedneme/i), 'u vchodu')
    expect(props.onNoteChange).toHaveBeenCalled()
  })

  it('has no axe violations', async () => {
    const { container } = renderSheet()
    expect(await axe(container)).toHaveNoViolations()
  })
})
