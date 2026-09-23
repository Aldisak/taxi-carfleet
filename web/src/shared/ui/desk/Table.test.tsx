import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from '../../test/axe'
import { Table, Thead, Tbody, Tr, Th, Td } from './Table'

function SampleTable() {
  return (
    <Table>
      <Thead>
        <Tr>
          <Th>Kód</Th>
          <Th $num>Cena</Th>
        </Tr>
      </Thead>
      <Tbody>
        <Tr>
          <Td>K4F7</Td>
          <Td $num>180 Kč</Td>
        </Tr>
        <Tr>
          <Td>K5A2</Td>
          <Td $num>240 Kč</Td>
        </Tr>
      </Tbody>
    </Table>
  )
}

describe('Table', () => {
  it('renders a semantic table', () => {
    render(<SampleTable />)
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('renders column headers', () => {
    render(<SampleTable />)
    expect(screen.getByRole('columnheader', { name: 'Kód' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Cena' })).toBeInTheDocument()
  })

  it('renders body rows and cells', () => {
    render(<SampleTable />)
    // 1 header row + 2 body rows
    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getByRole('cell', { name: 'K4F7' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '180 Kč' })).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = render(<SampleTable />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
