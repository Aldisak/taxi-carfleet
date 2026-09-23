import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from '../../test/axe'
import { Stat } from './Stat'

describe('Stat', () => {
  it('renders the label and value', () => {
    render(<Stat label="Tržby dnes" value="4 200 Kč" />)
    expect(screen.getByText('Tržby dnes')).toBeInTheDocument()
    expect(screen.getByText('4 200 Kč')).toBeInTheDocument()
  })

  it('renders an up delta with its value and an arrow-up glyph', () => {
    const { container } = render(
      <Stat label="Jízdy" value="42" delta={{ value: '+12 %', direction: 'up' }} />,
    )
    expect(screen.getByText('+12 %')).toBeInTheDocument()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders a down delta', () => {
    render(<Stat label="Zrušené" value="3" delta={{ value: '-2', direction: 'down' }} />)
    expect(screen.getByText('-2')).toBeInTheDocument()
  })

  it('renders a flat delta without a directional arrow', () => {
    const { container } = render(
      <Stat label="Průměr" value="180" delta={{ value: '0', direction: 'flat' }} />,
    )
    expect(screen.getByText('0')).toBeInTheDocument()
    // flat delta has no arrow glyph
    expect(container.querySelector('svg')).toBeNull()
  })

  it('omits the delta when none is given', () => {
    const { container } = render(<Stat label="Řidiči" value="4" />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <Stat label="Tržby" value="4 200 Kč" delta={{ value: '+12 %', direction: 'up' }} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
