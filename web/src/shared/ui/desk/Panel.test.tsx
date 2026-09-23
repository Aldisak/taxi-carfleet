import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { axe } from '../../test/axe'
import { Panel, PanelHeader } from './Panel'

describe('PanelHeader', () => {
  it('renders the title', () => {
    render(<PanelHeader title="Objednávky" />)
    expect(screen.getByText('Objednávky')).toBeInTheDocument()
  })

  it('renders the count pill when a count is given', () => {
    render(<PanelHeader title="Objednávky" count={7} />)
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('omits the count pill when count is undefined', () => {
    render(<PanelHeader title="Řidiči" />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('renders the right-meta slot', () => {
    render(<PanelHeader title="Objednávky" right={<span>obnoveno</span>} />)
    expect(screen.getByText('obnoveno')).toBeInTheDocument()
  })

  it('does not uppercase the accessible title text in the DOM', () => {
    render(<PanelHeader title="Objednávky" />)
    // uppercasing is CSS-only; the DOM text stays as passed
    expect(screen.getByText('Objednávky').textContent).toBe('Objednávky')
  })
})

describe('Panel', () => {
  it('renders its children', () => {
    render(
      <Panel>
        <p>obsah panelu</p>
      </Panel>,
    )
    expect(screen.getByText('obsah panelu')).toBeInTheDocument()
  })

  it('renders a header when title is provided and shows children below it', () => {
    render(
      <Panel title="Objednávky" count={3}>
        <p>řádek</p>
      </Panel>,
    )
    expect(screen.getByText('Objednávky')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('řádek')).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <Panel title="Objednávky" count={3} right={<span>meta</span>}>
        <p>obsah</p>
      </Panel>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('renders custom header content via a PanelHeader child', () => {
    render(
      <Panel>
        <PanelHeader title="Ručně" />
        <div>tělo</div>
      </Panel>,
    )
    const header = screen.getByText('Ručně')
    expect(header).toBeInTheDocument()
    expect(within(document.body).getByText('tělo')).toBeInTheDocument()
  })
})
