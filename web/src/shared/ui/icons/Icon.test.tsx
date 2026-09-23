import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from '../../test/axe'
import { Icon } from './Icon'

describe('Icon', () => {
  it('is decorative (aria-hidden, no role) when no title is given', () => {
    const { container } = render(<Icon name="search" />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).not.toHaveAttribute('role')
  })

  it('is a labelled graphic when a title is given', () => {
    const { getByRole } = render(<Icon name="phone" title="Zavolat" />)
    const svg = getByRole('img', { name: 'Zavolat' })
    expect(svg).toBeInTheDocument()
  })

  it('renders at the requested size', () => {
    const { container } = render(<Icon name="menu" size={32} />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('width', '32')
    expect(svg).toHaveAttribute('height', '32')
  })

  it('has no axe violations when labelled', async () => {
    const { container } = render(<Icon name="star" title="Hodnocení" />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
