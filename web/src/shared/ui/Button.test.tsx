import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/renderWithProviders'
import { axe } from '../test/axe'
import { Button } from './Button'

describe('Button', () => {
  it('renders its label', () => {
    renderWithProviders(<Button>Objednat</Button>)
    expect(screen.getByRole('button', { name: 'Objednat' })).toBeInTheDocument()
  })

  it('fires onClick when clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    renderWithProviders(<Button onClick={onClick}>Objednat</Button>)

    await user.click(screen.getByRole('button', { name: 'Objednat' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled and does not fire onClick when disabled', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    renderWithProviders(
      <Button disabled onClick={onClick}>
        Objednat
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Objednat' })
    expect(button).toBeDisabled()
    await user.click(button)

    expect(onClick).not.toHaveBeenCalled()
  })

  it('is disabled and shows loadingLabel while loading, and does not fire onClick', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    renderWithProviders(
      <Button loading loadingLabel="Objednávám…" onClick={onClick}>
        Objednat
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Objednávám…' })
    expect(button).toBeDisabled()
    expect(screen.queryByText('Objednat')).not.toBeInTheDocument()

    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders the price slot alongside the label', () => {
    renderWithProviders(<Button price="100 Kč">Objednat</Button>)

    const button = screen.getByRole('button', { name: /Objednat/ })
    expect(button).toHaveTextContent('Objednat')
    expect(button).toHaveTextContent('100 Kč')
  })

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<Button>Objednat</Button>)
    expect(await axe(container)).toHaveNoViolations()
  })
})
