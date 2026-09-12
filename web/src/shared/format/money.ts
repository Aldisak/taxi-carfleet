/**
 * cs-CZ number formatter for integer CZK. Money is integer CZK end-to-end
 * (rules/web-react-style.md#dates-and-money) — no floats, no decimal conversion.
 * Formats the number only (not currency style) and appends " Kč" with a plain space,
 * matching the spec's "110 Kč" display and the driver HistoryPage precedent.
 */
const czkNumber = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 })

/** Formats an integer CZK amount as e.g. "110 Kč" / "1 200 Kč". */
export function formatCzk(amountCzk: number): string {
  return `${czkNumber.format(amountCzk)} Kč`
}
