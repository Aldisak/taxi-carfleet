# Dispatcher app UI redesign — implementation handoff (v1, 2026-09-24)

Design canvas: https://claude.ai/artifact/Eyoq4WBCbbzkQhMdJtwz5E → row **„Dispečink“** (`DispatchLogin`, `Board`, `BoardPicker`, `BoardDrawer`, `BoardOffline`, `Orders`, `BoardDark`).
Tokens and the mobile kit: `design/customer-app-design-handoff.md`. This doc adds the **desktop kit** (shared with the owner and admin pages) and the dispatcher screens. The board keeps its Form | Orders | Map | Drivers layout — this is a restyle plus hierarchy and density fixes, not a new information architecture.

Roles: Dispečer sees Dispečink · Objednávky. FleetAdmin (owner) additionally sees Reporty · Analytika · Audit · Nastavení — covered in `design/owner-app-design-handoff.md`.

---

## 1. Desktop shell (`AppLayout`)

| part | spec |
|---|---|
| Header | 56 px, surface, bottom line. Left: **fleet dot + fleet name** (replaces the static "Taxi Dispečink"). Nav: 36 px pill links, active = surface-2 (`Dispečink`, `Objednávky`, then FleetAdmin items). Right: connection status (dot + Připojeno), icon buttons for sound mute (bell icon, never the 🔔/🔇 emoji), language (globe), theme (moon/sun), user line "Marie D. · dispečer", outline `Odhlásit se` 32 px. |
| Offline | `OfflineBanner` strip under the header (`BoardOffline`): "Offline – zobrazuji poslední známý stav. Akce jsou dočasně vypnuté." All mutating buttons disabled (keep `disconnectDisable`). |
| Page | 24×28 px padding, 20 px gaps, `page-h` title row 26/800 with controls inline and the primary action right-aligned. |
| Theme | light default; dark available (`BoardDark`) — dispatchers on evening shifts asked for it, and the map recolours through the same `--map-*` vars. |
| Breakpoints | ≥ 1600: 4 columns (340 \| 360 \| flex map \| 300). 1280–1599: map replaces the orders column with a `Zobrazit mapu / Skrýt mapu` toggle in the panel header (as today). Minimum 1280. |

## 2. Desktop kit → `web/src/shared/ui/desk/`

| component | spec |
|---|---|
| `Panel` + `PanelHeader` | surface, 1 px line, r-md 14; header 12/800 uppercase ink-2 with optional count pill and right meta |
| `Ctrl` (desktop field) | 40 px, surface-2, r-sm 8; focus = surface + 2 px ink; icon slot; `Lbl` 12/700 above |
| `Button` sizes `md` 40 / `xs` 32, variants primary / secondary / outline / danger text | same tones as mobile, r-sm |
| `Table` | 14 px, th 12/800 uppercase, td 12 px padding, `num` columns right-aligned tabular; row hover surface-2 |
| `Stat` (KPI card) | label 12/700, value 26/800, delta 12/700 in success/danger/ink-2 with ▲/▼ glyph from the icon set |
| `Pill` | 22 px desktop size (11/800) |
| `Chip` filter | 36 px, `on` = surface + ink border |
| `Segmented` | 3 px padding, 30–32 px buttons |
| `Tabs` | 40 px, active = ink text + 2 px ink underline |
| `Timeline` | dot + title 13/700 + caption; accent dot = current/latest event |
| `Drawer` | 480 px right panel from header down, scrim 45 %; header title + status pill + close |
| `MapPanel` | driver marker = 30 px surface circle with 3 px status-colour ring + heading wedge + name label; order pin = danger drop pin + code label; legend bottom-left; © Mapy.com top-right. **Colours from `--success / --info / --warning / --danger` — replaces the Tailwind hexes in `driverMarker.ts`.** |

## 3. Board [Board / BoardPicker / BoardDrawer / BoardOffline]

**Order form (340 px)** — header "Nová objednávka" + hint "F2 · Enter odešle". Telefon (focused on F2) + Jméno on one row; Nástup with pin icon and **quick chips from fleet Places** (`PlacesTab` data, not the hardcoded `quickChips.ts`); Cíl; Kdy as `Segmented` Co nejdříve / Na čas (datetime appears when Na čas) + Cestující 90 px; Poznámka; price preview card (price 20/700 + `Pevná` pill + "14 km · 18 min"); 44 px `Vytvořit objednávku`. The form never scrolls at 900 px height.

**Orders column (360 px)** — header with total count + "obnoveno před 3 s" (the 10 s refetch made visible). Sections as today (Nové · Přiřazené / Čekají na přijetí · Probíhající · Naplánované · Dokončené dnes) as `sec-h` rows with chevron + count; Dokončené collapsed by default.

`OrderCard` — line 1: code 13/800 · time/ASAP · status pill · **elapsed pill** (danger tone at ≥ 120 s, as today) · price right; line 2: phone bold + name; route block with accent dot / ink square; driver line with car icon ("Karel Šimek · čeká 0:18" for Assigned); action row of 32 px buttons — first action primary (`Přiřadit` / `Přeřadit`), then `Zrušit`, `Detail`. Highlight state (`hot`): accent border + 2 px accent halo, used for the newest order (`useNewOrderHighlight`) and for the card whose pin is hovered. "⚠ bez souřadnic" becomes a warning pill "Bez souřadnic"; the failed-SMS glyph becomes a danger pill "SMS selhala".

`DriverPicker` [BoardPicker] — popover card anchored to the action row (300 px, shadow-float): title "Vyberte řidiče" + "podle vzdálenosti"; rows dot · name · plate · distance; busy drivers listed last with "obsazen". Keyboard: ↑↓ Enter Esc.

Cancel inline form (unchanged behaviour): `Ctrl` select Důvod zrušení + text field for Jiný, `Potvrdit` primary xs / `Zavřít` secondary xs.

**Map panel** — see `MapPanel`; header shows "3 řidiči · 2 nové objednávky". Clicking a card highlights the pin, clicking a driver focuses the marker (keep `useMapHighlight`, `useDriverFocusStore`).

**Drivers column (300 px)** — header "Řidiči · 3 / 4 online"; rows: status dot · name 13/700 · plate · age · current order code · status pill · ⋯ menu (Nastavit stav: Volný / Obsazen / Offline). Sort unchanged (Free → EnRoute/Busy → Offline). Footer hint "Kliknutím na řidiče ho zvýrazníte na mapě."

**Order drawer [BoardDrawer]** — header "Objednávka #K4F7" + created line (time · source · actor) + status pill + close. Two `Stat` cards: **Zákazník** (phone, name, passengers) and **Cena** (amount, type, matched route) — both missing from the drawer today. Route block with addresses + secondary lines; note callout; action row from server-allowed actions (labels move from `transitionButtons.ts` into i18n: Přiřadit, Přeřadit, Zrušit, Přijmout, Na místě, Zahájit jízdu, Dokončit, Odmítnout) + `Upravit` (editable only in Nová/Přiřazená — show the reason as a caption, not an inline-styled div). Tabs **Historie** (timeline, newest first, "Actor · relative time", reason under) and **Notifikace** (rows: event · channel pill SMS/Push · status pill Odesláno/Selhalo/Ve frontě/Přeskočeno · time · recipient · error). Conflict "Objednávku mezitím změnil někdo jiný" → danger callout with `Načíst znovu`.

## 4. Orders search [Orders]

Title "Objednávky" + result count + `Exportovat CSV` right. Filter row: search `Ctrl` 280 px (Kód, telefon nebo jméno), date-range `Ctrl`, status `Chip` group (Vše · Nová · Probíhá · Dokončená · Zrušená — Přiřazená/Přijatá/Na místě fold into Probíhá for the filter, the column still shows the exact status), driver select. Table columns unchanged (Kód · Vytvořeno · Kdy · Zákazník · Trasa · Cena · Řidič · Stav); row click opens the drawer over the table (same `OrderDrawer`). Footer: "Strana 1 / 32", Předchozí / Další outline xs.

## 5. Login [DispatchLogin]

Centred 420 px card: fleet dot + "Dispečink" + fleet name; E-mail / Heslo 48 px fields; primary `Přihlásit se`; caption "Heslo vám nastaví správce flotily v Nastavení → Lidé."

## 6. Keyboard & density

F2 → phone field, Enter → submit (keep). Add: `/` focuses search on Objednávky, Esc closes drawer/picker, `J/K` move card focus in the orders column, `A` assigns focused card (opens picker). Card text 13 px, rows 40–44 px — the board is a dense tool; the 48 px touch rule does not apply on desktop, focus rings do.

## 7. Migration order

1. Desk kit + `AppLayout` header (fleet name, icons, theme toggle).
2. `OrderCard` + sections + `DriverPicker` popover; map marker colours to tokens.
3. `OrderForm` restyle, Places-driven chips, price preview card.
4. `OrderDrawer`: customer/price cards, tabs, i18n for transition labels.
5. `SearchPage` filters + table; `LoginPage`.
6. Dark theme pass on the map (`--map-*`) and the drawer.
