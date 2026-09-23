import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from '../../test/axe'
import { Ctrl, Lbl } from './Ctrl'

describe('Lbl', () => {
  it('renders a label associated with its control via htmlFor', () => {
    render(
      <>
        <Lbl htmlFor="phone">Telefon</Lbl>
        <Ctrl id="phone" value="" onChange={vi.fn()} />
      </>,
    )
    expect(screen.getByLabelText('Telefon')).toBeInTheDocument()
  })
})

describe('Ctrl', () => {
  it('renders a text input by default', () => {
    render(
      <>
        <Lbl htmlFor="name">Jméno</Lbl>
        <Ctrl id="name" value="Anna" onChange={vi.fn()} />
      </>,
    )
    const input = screen.getByLabelText('Jméno')
    expect(input).toHaveValue('Anna')
  })

  it('emits the new value on change', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <>
        <Lbl htmlFor="q">Hledat</Lbl>
        <Ctrl id="q" value="" onChange={onChange} />
      </>,
    )
    await user.type(screen.getByLabelText('Hledat'), 'K')
    expect(onChange).toHaveBeenCalledWith('K')
  })

  it('renders a select when as="select"', () => {
    render(
      <>
        <Lbl htmlFor="status">Stav</Lbl>
        <Ctrl id="status" as="select" value="new" onChange={vi.fn()}>
          <option value="new">Nová</option>
          <option value="done">Dokončená</option>
        </Ctrl>
      </>,
    )
    const select = screen.getByLabelText('Stav')
    expect(select.tagName).toBe('SELECT')
    expect(select).toHaveValue('new')
  })

  it('shows an error caption and wires aria-invalid + aria-describedby', () => {
    render(
      <>
        <Lbl htmlFor="email">E-mail</Lbl>
        <Ctrl id="email" value="x" onChange={vi.fn()} error="Neplatný e-mail" />
      </>,
    )
    const input = screen.getByLabelText('E-mail')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Neplatný e-mail')).toBeInTheDocument()
    expect(input).toHaveAccessibleDescription('Neplatný e-mail')
  })

  it('renders a leading icon slot', () => {
    render(
      <>
        <Lbl htmlFor="s">Hledat</Lbl>
        <Ctrl id="s" value="" onChange={vi.fn()} leadingIcon={<span>ic</span>} />
      </>,
    )
    expect(screen.getByText('ic')).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <>
        <Lbl htmlFor="a">Adresa</Lbl>
        <Ctrl id="a" value="" onChange={vi.fn()} placeholder="Ulice" />
      </>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
