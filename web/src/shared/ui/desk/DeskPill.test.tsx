import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from '../../test/axe'
import { DeskPill, type DeskPillTone } from './DeskPill'

describe('DeskPill', () => {
  it('renders its content', () => {
    render(<DeskPill>Nová</DeskPill>)
    expect(screen.getByText('Nová')).toBeInTheDocument()
  })

  it.each<DeskPillTone>(['neutral', 'success', 'warning', 'danger', 'info', 'accent'])(
    'renders the %s tone',
    (tone) => {
      render(<DeskPill tone={tone}>Stav</DeskPill>)
      expect(screen.getByText('Stav')).toBeInTheDocument()
    },
  )

  it('does not uppercase the accessible text in the DOM', () => {
    render(<DeskPill>Přiřazená</DeskPill>)
    expect(screen.getByText('Přiřazená').textContent).toBe('Přiřazená')
  })

  it('has no axe violations', async () => {
    const { container } = render(<DeskPill tone="success">Dokončeno</DeskPill>)
    expect(await axe(container)).toHaveNoViolations()
  })
})
