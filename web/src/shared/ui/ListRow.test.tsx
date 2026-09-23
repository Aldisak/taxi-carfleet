import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/renderWithProviders'
import { axe } from '../test/axe'
import { ListRow, ListIcon } from './ListRow'

describe('ListIcon', () => {
  it('renders its icon slot', () => {
    renderWithProviders(<ListIcon icon={<span>ICON</span>} />)
    expect(screen.getByText('ICON')).toBeInTheDocument()
  })
})

describe('ListRow', () => {
  it('renders the title, caption and trailing slot', () => {
    renderWithProviders(
      <ListRow title="Platba" caption="Hotově" trailing={<span>Změnit</span>} />,
    )
    expect(screen.getByText('Platba')).toBeInTheDocument()
    expect(screen.getByText('Hotově')).toBeInTheDocument()
    expect(screen.getByText('Změnit')).toBeInTheDocument()
  })

  it('renders as a button with the title as accessible name and fires onClick', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    renderWithProviders(<ListRow title="Platba" caption="Hotově" onClick={onClick} />)

    const button = screen.getByRole('button', { name: /Platba/ })
    await user.click(button)

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('has no axe violations in the clickable variant', async () => {
    const { container } = renderWithProviders(
      <ListRow
        icon={<ListIcon icon={<span aria-hidden="true">•</span>} />}
        title="Platba"
        caption="Hotově"
        trailing={<span>Změnit</span>}
        onClick={() => {}}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
