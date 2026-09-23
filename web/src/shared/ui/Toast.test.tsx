import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/renderWithProviders'
import { axe } from '../test/axe'
import { Toast } from './Toast'

describe('Toast', () => {
  it('renders its message', () => {
    renderWithProviders(<Toast>Objednávka vytvořena</Toast>)
    expect(screen.getByText('Objednávka vytvořena')).toBeInTheDocument()
  })

  it('has the status role for polite announcement', () => {
    renderWithProviders(<Toast>Uloženo</Toast>)
    expect(screen.getByRole('status')).toHaveTextContent('Uloženo')
  })

  it('renders no dismiss button without onDismiss', () => {
    renderWithProviders(<Toast>Bez zavření</Toast>)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders a dismiss button with an accessible name and fires onDismiss', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    renderWithProviders(
      <Toast onDismiss={onDismiss} dismissLabel="Zavřít">
        Zpráva
      </Toast>,
    )
    const button = screen.getByRole('button', { name: 'Zavřít' })
    await user.click(button)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('has no axe violations with a dismiss button', async () => {
    const { container } = renderWithProviders(
      <Toast onDismiss={() => {}} dismissLabel="Zavřít">
        Přístupný toast
      </Toast>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
