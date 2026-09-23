import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import { Plate } from './Plate'

describe('Plate', () => {
  it('renders the plate text', () => {
    renderWithProviders(<Plate>1AB 2345</Plate>)
    expect(screen.getByText('1AB 2345')).toBeInTheDocument()
  })

  it('renders at md size', () => {
    renderWithProviders(<Plate size="md">1AB 2345</Plate>)
    expect(screen.getByText('1AB 2345')).toBeInTheDocument()
  })

  it('renders at lg size', () => {
    renderWithProviders(<Plate size="lg">1AB 2345</Plate>)
    expect(screen.getByText('1AB 2345')).toBeInTheDocument()
  })
})
