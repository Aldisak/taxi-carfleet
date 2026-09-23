import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from '../../test/axe'
import { Tabs } from './Tabs'

const tabs = [
  { id: 'history', label: 'Historie' },
  { id: 'notifications', label: 'Notifikace' },
]

describe('Tabs', () => {
  it('renders a tablist with one tab per entry', () => {
    render(<Tabs tabs={tabs} activeId="history" onChange={vi.fn()} ariaLabel="Detail" />)
    expect(screen.getByRole('tablist', { name: 'Detail' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(2)
  })

  it('marks the active tab as selected', () => {
    render(<Tabs tabs={tabs} activeId="notifications" onChange={vi.fn()} ariaLabel="Detail" />)
    expect(screen.getByRole('tab', { name: 'Notifikace' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Historie' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('emits the tab id on click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Tabs tabs={tabs} activeId="history" onChange={onChange} ariaLabel="Detail" />)
    await user.click(screen.getByRole('tab', { name: 'Notifikace' }))
    expect(onChange).toHaveBeenCalledWith('notifications')
  })

  it('moves selection with the right arrow key', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Tabs tabs={tabs} activeId="history" onChange={onChange} ariaLabel="Detail" />)
    screen.getByRole('tab', { name: 'Historie' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith('notifications')
  })

  it('moves DOM focus to the newly-targeted tab on arrow nav', async () => {
    const user = userEvent.setup()
    render(<Tabs tabs={tabs} activeId="history" onChange={vi.fn()} ariaLabel="Detail" />)
    screen.getByRole('tab', { name: 'Historie' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Notifikace' }))
  })

  it('wraps to the first tab with the right arrow at the end', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Tabs tabs={tabs} activeId="notifications" onChange={onChange} ariaLabel="Detail" />)
    screen.getByRole('tab', { name: 'Notifikace' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith('history')
  })

  it('moves selection with the left arrow key', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Tabs tabs={tabs} activeId="notifications" onChange={onChange} ariaLabel="Detail" />)
    screen.getByRole('tab', { name: 'Notifikace' }).focus()
    await user.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenCalledWith('history')
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <Tabs tabs={tabs} activeId="history" onChange={vi.fn()} ariaLabel="Detail" />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
