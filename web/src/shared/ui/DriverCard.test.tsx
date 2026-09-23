import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import { DriverCard } from './DriverCard'

describe('DriverCard', () => {
  it('renders the driver name, vehicle line and plate', () => {
    renderWithProviders(
      <DriverCard
        name="Jan Novák"
        vehicle="Škoda Octavia · bílá"
        plate="1AB 2345"
      />,
    )
    expect(screen.getByText('Jan Novák')).toBeInTheDocument()
    expect(screen.getByText('Škoda Octavia · bílá')).toBeInTheDocument()
    expect(screen.getByText('1AB 2345')).toBeInTheDocument()
  })

  it('derives avatar initials from the name when none are given', () => {
    renderWithProviders(<DriverCard name="Jan Novák" />)
    expect(screen.getByText('JN')).toBeInTheDocument()
  })

  it('shows explicit initials over the derived ones', () => {
    renderWithProviders(<DriverCard name="Jan Novák" initials="XY" />)
    expect(screen.getByText('XY')).toBeInTheDocument()
    expect(screen.queryByText('JN')).not.toBeInTheDocument()
  })
})
