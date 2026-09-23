import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from '../../test/axe'
import { Timeline } from './Timeline'

describe('Timeline', () => {
  it('renders each item title', () => {
    render(
      <Timeline
        items={[
          { title: 'Vytvořeno' },
          { title: 'Přiřazeno', caption: 'Karel Šimek · před 2 min' },
        ]}
      />,
    )
    expect(screen.getByText('Vytvořeno')).toBeInTheDocument()
    expect(screen.getByText('Přiřazeno')).toBeInTheDocument()
  })

  it('renders captions when provided', () => {
    render(<Timeline items={[{ title: 'Dokončeno', caption: 'před 1 min' }]} />)
    expect(screen.getByText('před 1 min')).toBeInTheDocument()
  })

  it('renders as a list with one item per entry', () => {
    render(<Timeline items={[{ title: 'A' }, { title: 'B' }, { title: 'C' }]} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('renders an empty list without crashing', () => {
    render(<Timeline items={[]} />)
    expect(screen.getByRole('list')).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <Timeline
        items={[
          { title: 'Vytvořeno', caption: 'před 5 min' },
          { title: 'Přiřazeno', caption: 'před 2 min', accent: true },
        ]}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
