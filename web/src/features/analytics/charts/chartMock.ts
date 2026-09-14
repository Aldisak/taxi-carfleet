/**
 * Chart.js / react-chartjs-2 mock helpers for jsdom tests.
 *
 * react-chartjs-2 components render a <canvas> and call Chart.js APIs that
 * require a real browser rendering context.  jsdom does not implement
 * HTMLCanvasElement.getContext(), so any test that renders a real Line/Bar/
 * Doughnut component will throw.
 *
 * Usage pattern (put this near the top of the test file):
 *
 *   import { chartMockModule } from '@/features/analytics/charts/chartMock'
 *   vi.mock('react-chartjs-2', chartMockModule)
 *
 * Or inline via the factory shorthand:
 *
 *   vi.mock('react-chartjs-2', () => chartMockFactory())
 *
 * Each mocked chart component renders a <div data-testid="chart-mock"> with
 * the chart type as a data attribute, so tests can assert on rendered output
 * without needing a real canvas.
 */

import { vi } from 'vitest'
import type { ComponentProps } from 'react'
import { createElement } from 'react'

type AnyProps = Record<string, unknown>

/** Creates a stub React component that renders a testable div instead of canvas. */
function makeChartStub(displayName: string) {
  const stub = (props: AnyProps) =>
    createElement('div', {
      'data-testid': 'chart-mock',
      'data-chart-type': displayName.toLowerCase(),
      'role': 'img',
      'aria-label': (props['aria-label'] as string | undefined) ?? displayName,
    })
  stub.displayName = `Mock${displayName}`
  return stub
}

/** Factory compatible with vi.mock('react-chartjs-2', chartMockModule). */
export const chartMockModule = () => ({
  Line: makeChartStub('Line'),
  Bar: makeChartStub('Bar'),
  Doughnut: makeChartStub('Doughnut'),
})

// Re-export the factory under an alias for direct vi.mock factory use.
export const chartMockFactory = chartMockModule

// Type helpers so mock props match the original types when needed.
export type MockChartProps = ComponentProps<ReturnType<typeof makeChartStub>>

// Declare vi in module scope only for the mock setup helper below.
/** Sets up the react-chartjs-2 mock. Call this inside a vi.mock() factory. */
export function setupChartMocks() {
  return chartMockModule()
}

// Suppress the "HTMLCanvasElement is not defined" console error that appears
// when chart.js is imported in jsdom even without rendering.
export function suppressChartJsCanvasError() {
  vi.spyOn(console, 'error').mockImplementation((msg: unknown, ...args: unknown[]) => {
    if (typeof msg === 'string' && msg.includes('Canvas')) return
    console.error(msg, ...args)
  })
}
