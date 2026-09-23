import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import { PriceCard } from './PriceCard'

describe('PriceCard', () => {
  it('renders the price, type slot and note', () => {
    renderWithProviders(
      <PriceCard price="100 Kč" type={<span>Pevná cena</span>} note="Konečná cena jízdy" />,
    )
    expect(screen.getByText('100 Kč')).toBeInTheDocument()
    expect(screen.getByText('Pevná cena')).toBeInTheDocument()
    expect(screen.getByText('Konečná cena jízdy')).toBeInTheDocument()
  })

  it('renders content in the warning tone', () => {
    renderWithProviders(
      <PriceCard price="120 Kč" tone="warning" note="Orientační odhad" />,
    )
    expect(screen.getByText('120 Kč')).toBeInTheDocument()
    expect(screen.getByText('Orientační odhad')).toBeInTheDocument()
  })
})
