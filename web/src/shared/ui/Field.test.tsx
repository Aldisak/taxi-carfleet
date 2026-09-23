import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/renderWithProviders'
import { axe } from '../test/axe'
import { Field } from './Field'

describe('Field', () => {
  it('associates the label with the input via htmlFor', () => {
    const { getByLabelText } = renderWithProviders(
      <Field id="phone" label="Telefon" value="" onChange={() => {}} />,
    )
    expect(getByLabelText('Telefon')).toBeInstanceOf(HTMLInputElement)
  })

  it('calls onChange with the typed value', async () => {
    const onChange = vi.fn()
    const { getByLabelText } = renderWithProviders(
      <Field id="name" label="Jméno" value="" onChange={onChange} />,
    )
    await userEvent.type(getByLabelText('Jméno'), 'A')
    expect(onChange).toHaveBeenCalledWith('A')
  })

  it('sets aria-invalid + aria-describedby and shows the error message when in error', () => {
    const { getByLabelText, getByText } = renderWithProviders(
      <Field
        id="email"
        label="E-mail"
        value="x"
        onChange={() => {}}
        error="Neplatný e-mail"
      />,
    )
    const input = getByLabelText('E-mail')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    const message = getByText('Neplatný e-mail')
    expect(message).toHaveAttribute('id', 'email-error')
    expect(input).toHaveAttribute('aria-describedby', 'email-error')
  })

  it('does not set aria-invalid when there is no error', () => {
    const { getByLabelText } = renderWithProviders(
      <Field id="ok" label="OK" value="" onChange={() => {}} />,
    )
    expect(getByLabelText('OK')).not.toHaveAttribute('aria-invalid')
  })

  it('renders the prefix and leading icon slots', () => {
    const { getByText } = renderWithProviders(
      <Field
        id="tel"
        label="Telefon"
        value=""
        onChange={() => {}}
        prefix={<span>+420</span>}
        leadingIcon={<span data-testid="lead">icon</span>}
      />,
    )
    expect(getByText('+420')).toBeInTheDocument()
    expect(getByText('icon')).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(
      <Field
        id="a11y"
        label="Adresa"
        value=""
        onChange={() => {}}
        error="Vyplňte adresu"
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
