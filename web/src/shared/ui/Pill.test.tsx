import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import { Pill } from './Pill'

describe('Pill', () => {
  it('renders its children', () => {
    renderWithProviders(<Pill tone="success">Volný</Pill>)
    expect(screen.getByText('Volný')).toBeInTheDocument()
  })

  it('renders as a span (non-interactive)', () => {
    renderWithProviders(<Pill>Čeká</Pill>)
    const el = screen.getByText('Čeká')
    expect(el.tagName).toBe('SPAN')
  })
})
