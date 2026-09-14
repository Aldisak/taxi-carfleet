/**
 * Back-compat re-export. The canonical implementation now lives in
 * `src/shared/date/analyticsRange.ts` which was promoted in WI-11 to allow
 * the analytics feature (WI-13+) to use it without cross-feature imports.
 *
 * All existing callers (`ReportsPage.tsx`, `reportDateRange.test.ts`) continue
 * to import from this path — no behavior change.
 */
export type { DateRange } from '../../shared/date/analyticsRange'
export { defaultThisMonthRange } from '../../shared/date/analyticsRange'
