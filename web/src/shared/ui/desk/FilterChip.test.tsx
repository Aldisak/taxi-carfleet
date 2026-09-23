import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from '../../test/axe'
import { FilterChip } from './FilterChip'

describe('FilterChip', () => {
  it('renders its label as a button', () => {
    render(<FilterChip>Nová</FilterChip>)
    expect(screen.getByRole('button', { name: 'Nová' })).toBeInTheDocument()
  })

  it('reflects the off state with aria-pressed=false by default', () => {
    render(<FilterChip>Vše</FilterChip>)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')
  })

  it('reflects the on state with aria-pressed=true', () => {
    render(<FilterChip selected>Vše</FilterChip>)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  })

  it('fires onClick when pressed', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<FilterChip onClick={onClick}>Zrušená</FilterChip>)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('has no axe violations', async () => {
    const { container } = render(<FilterChip selected>Probíhá</FilterChip>)
    expect(await axe(container)).toHaveNoViolations()
  })
})
