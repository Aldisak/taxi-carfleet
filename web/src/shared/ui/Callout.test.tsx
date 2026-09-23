import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import { axe } from '../test/axe'
import { Callout } from './Callout'

describe('Callout', () => {
  it('renders its children', () => {
    renderWithProviders(<Callout>Zadejte platné telefonní číslo</Callout>)
    expect(screen.getByText('Zadejte platné telefonní číslo')).toBeInTheDocument()
  })

  it('applies the requested tone to the root', () => {
    const { container } = renderWithProviders(<Callout tone="warning">Pozor</Callout>)
    const root = container.querySelector('[data-tone]')
    expect(root).not.toBeNull()
    expect(root).toHaveAttribute('data-tone', 'warning')
  })

  it('defaults to the neutral tone', () => {
    const { container } = renderWithProviders(<Callout>Info</Callout>)
    expect(container.querySelector('[data-tone]')).toHaveAttribute('data-tone', 'neutral')
  })

  it('renders the icon slot when provided', () => {
    renderWithProviders(
      <Callout icon={<svg data-testid="lead-icon" aria-hidden="true" />}>Text</Callout>,
    )
    expect(screen.getByTestId('lead-icon')).toBeInTheDocument()
  })

  it('passes through the role prop when provided', () => {
    renderWithProviders(
      <Callout tone="danger" role="alert">
        Chyba
      </Callout>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Chyba')
  })

  it('has no role by default', () => {
    const { container } = renderWithProviders(<Callout>Bez role</Callout>)
    expect(container.querySelector('[data-tone]')).not.toHaveAttribute('role')
  })

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(
      <Callout tone="info">Přístupný informační box</Callout>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
