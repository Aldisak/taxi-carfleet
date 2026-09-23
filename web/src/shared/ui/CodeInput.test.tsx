import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/renderWithProviders'
import { axe } from '../test/axe'
import { CodeInput } from './CodeInput'

/** Stateful wrapper so the controlled boxes reflect typed input across re-renders. */
function Harness({
  onComplete,
  length,
}: {
  onComplete?: (code: string) => void
  length?: number
}): JSX.Element {
  const [value, setValue] = useState('')
  return (
    <CodeInput
      value={value}
      onChange={setValue}
      onComplete={onComplete}
      length={length}
      ariaLabel="Ověřovací kód"
    />
  )
}

describe('CodeInput', () => {
  it('renders one labelled box per position', () => {
    const { getByLabelText } = renderWithProviders(<Harness length={6} />)
    expect(getByLabelText('Ověřovací kód 1')).toBeInstanceOf(HTMLInputElement)
    expect(getByLabelText('Ověřovací kód 6')).toBeInstanceOf(HTMLInputElement)
  })

  it('fills each box and advances focus as digits are typed', async () => {
    const { getByLabelText } = renderWithProviders(<Harness length={4} />)
    const first = getByLabelText('Ověřovací kód 1')
    first.focus()
    await userEvent.keyboard('12')
    expect(getByLabelText('Ověřovací kód 1')).toHaveValue('1')
    expect(getByLabelText('Ověřovací kód 2')).toHaveValue('2')
    // Focus advanced to the third box.
    expect(getByLabelText('Ověřovací kód 3')).toHaveFocus()
  })

  it('moves focus back and clears the previous box on Backspace in an empty box', async () => {
    const { getByLabelText } = renderWithProviders(<Harness length={4} />)
    getByLabelText('Ověřovací kód 1').focus()
    await userEvent.keyboard('12')
    // Focus is now on box 3 (empty). Backspace should clear box 2 and move to it.
    await userEvent.keyboard('{Backspace}')
    expect(getByLabelText('Ověřovací kód 2')).toHaveValue('')
    expect(getByLabelText('Ověřovací kód 2')).toHaveFocus()
  })

  it('fires onComplete once all boxes are filled', async () => {
    const onComplete = vi.fn()
    const { getByLabelText } = renderWithProviders(
      <Harness length={4} onComplete={onComplete} />,
    )
    getByLabelText('Ověřovací kód 1').focus()
    await userEvent.keyboard('1234')
    expect(onComplete).toHaveBeenCalledWith('1234')
  })

  it('distributes a pasted code across the boxes', async () => {
    const onComplete = vi.fn()
    const { getByLabelText } = renderWithProviders(
      <Harness length={4} onComplete={onComplete} />,
    )
    const first = getByLabelText('Ověřovací kód 1')
    first.focus()
    await userEvent.paste('9876')
    expect(getByLabelText('Ověřovací kód 1')).toHaveValue('9')
    expect(getByLabelText('Ověřovací kód 4')).toHaveValue('6')
    expect(onComplete).toHaveBeenCalledWith('9876')
  })

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<Harness length={6} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
