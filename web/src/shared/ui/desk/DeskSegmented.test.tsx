import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from '../../test/axe'
import { DeskSegmented } from './DeskSegmented'

const options = [
  { value: 'asap', label: 'Co nejdříve' },
  { value: 'scheduled', label: 'Na čas' },
]

describe('DeskSegmented', () => {
  it('renders one button per option', () => {
    render(
      <DeskSegmented options={options} value="asap" onChange={vi.fn()} ariaLabel="Kdy" />,
    )
    expect(screen.getByRole('button', { name: 'Co nejdříve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Na čas' })).toBeInTheDocument()
  })

  it('marks the selected segment as pressed', () => {
    render(
      <DeskSegmented options={options} value="scheduled" onChange={vi.fn()} ariaLabel="Kdy" />,
    )
    expect(screen.getByRole('button', { name: 'Na čas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Co nejdříve' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('emits the chosen value on click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <DeskSegmented options={options} value="asap" onChange={onChange} ariaLabel="Kdy" />,
    )
    await user.click(screen.getByRole('button', { name: 'Na čas' }))
    expect(onChange).toHaveBeenCalledWith('scheduled')
  })

  it('exposes the group accessible name', () => {
    render(
      <DeskSegmented options={options} value="asap" onChange={vi.fn()} ariaLabel="Kdy" />,
    )
    expect(screen.getByRole('group', { name: 'Kdy' })).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <DeskSegmented options={options} value="asap" onChange={vi.fn()} ariaLabel="Kdy" />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
