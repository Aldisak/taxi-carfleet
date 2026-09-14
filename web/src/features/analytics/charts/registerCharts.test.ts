import { describe, it, expect, vi, beforeEach } from 'vitest'

// Chart.js is real in this unit test because we are testing that the
// registration module correctly imports and registers Chart.js components.
// No canvas is created here — Chart.register() is a pure side-effect call.

describe('registerCharts', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('registers Line, Bar, and Doughnut chart types', async () => {
    const { Chart } = await import('chart.js')

    await import('./registerCharts')

    // Chart.registry.controllers.items contains the registered controller ids.
    // chart.js/auto registers all by default; tree-shaken builds register only what
    // registerCharts explicitly calls Chart.register() with.
    // The TypedRegistry type does not expose `items` but it exists at runtime.
    const registry = Chart.registry.controllers as unknown as { items: Record<string, unknown> }
    const controllerIds = Object.keys(registry.items)
    expect(controllerIds).toContain('line')
    expect(controllerIds).toContain('bar')
    expect(controllerIds).toContain('doughnut')
  })

  it('is idempotent — calling registerCharts multiple times does not throw', async () => {
    await import('./registerCharts')
    // Second import is deduplicated by ESM module cache (singleton)
    // We directly call the exported function to verify idempotency
    const { registerCharts } = await import('./registerCharts')
    expect(() => registerCharts()).not.toThrow()
    expect(() => registerCharts()).not.toThrow()
  })
})
