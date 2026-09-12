import type { CommonRouteDto, MyActiveOrderDto } from '../../../shared/api/client'

/** Inputs for the Home content decision. */
export interface HomeContentInput {
  /** The caller's single active order, or null when none (204) / logged out. */
  activeOrder: MyActiveOrderDto | null
  /** Valid-now common routes (may be empty). */
  routes: CommonRouteDto[]
}

/**
 * What the Home screen should render as its primary content block. A discriminated
 * union — components render, this pure module decides (rules/web-architecture.md#pure-logic-modules).
 */
export type HomeContent =
  | { mode: 'activeOrder'; activeOrder: MyActiveOrderDto }
  | { mode: 'routes'; routes: CommonRouteDto[] }
  | { mode: 'empty' }

/**
 * Decides the Home primary block per spec §1: an active order's sticky banner replaces
 * the routes block; otherwise valid-now route cards render; when neither exists the
 * routes block is hidden entirely (no empty list). The active-order banner always wins.
 */
export function decideHomeContent({ activeOrder, routes }: HomeContentInput): HomeContent {
  if (activeOrder) {
    return { mode: 'activeOrder', activeOrder }
  }
  if (routes.length > 0) {
    return { mode: 'routes', routes }
  }
  return { mode: 'empty' }
}
