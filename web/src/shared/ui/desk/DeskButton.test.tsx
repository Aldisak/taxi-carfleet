import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from '../../test/axe'
import { DeskButton, type DeskButtonVariant } from './DeskButton'

describe('DeskButton', () => {
  it('renders its label as a button', () => {
    render(<DeskButton>Přiřadit</DeskButton>)
    expect(screen.getByRole('button', { name: 'Přiřadit' })).toBeInTheDocument()
  })

  it('defaults to type="button"', () => {
    render(<DeskButton>Uložit</DeskButton>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('fires onClick when pressed', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<DeskButton onClick={onClick}>Detail</DeskButton>)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it.each<DeskButtonVariant>(['primary', 'secondary', 'outline', 'danger'])(
    'renders the %s variant',
    (variant) => {
      render(<DeskButton variant={variant}>Akce</DeskButton>)
      expect(screen.getByRole('button', { name: 'Akce' })).toBeInTheDocument()
    },
  )

  it('is disabled when disabled', () => {
    render(<DeskButton disabled>Nedostupné</DeskButton>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('is disabled and busy while loading', () => {
    render(
      <DeskButton loading loadingLabel="Ukládám…">
        Uložit
      </DeskButton>,
    )
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Ukládám…')).toBeInTheDocument()
  })

  it('does not fire onClick while loading', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <DeskButton loading loadingLabel="…" onClick={onClick}>
        Uložit
      </DeskButton>,
    )
    await user.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('has no axe violations', async () => {
    const { container } = render(<DeskButton variant="danger">Zrušit</DeskButton>)
    expect(await axe(container)).toHaveNoViolations()
  })
})
