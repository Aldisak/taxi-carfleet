# Fleet owner (FleetAdmin) UI redesign — implementation handoff (v1, 2026-09-24)

Design canvas: https://claude.ai/artifact/Eyoq4WBCbbzkQhMdJtwz5E → row **„Majitel flotily“** (`Reports`, `Analytics`, `SettingsFleet`, `SettingsPeople`, `SettingsRoutes`, `Audit`).
These are the FleetAdmin-only pages inside the dispatcher shell (`/dispatcher/reports|analytics|settings|audit`). Shell and desktop kit: `design/dispatcher-app-design-handoff.md` §1–2. Tokens: `design/customer-app-design-handoff.md`.

The owner's questions are "how did we do, who drove, what does it cost me, is anything set up wrong". So every page opens with the answer (KPI cards), then the evidence (charts, tables), then the controls.

---

## 1. Charts — rules used on every page

- **Single hue.** One series = accent; the max/selected mark full accent, the rest `color-mix(accent 55 %, surface)`. Comparison series (previous period) = `ink-3` dashed line, never a second hue. Status colours are reserved for status.
- **One axis per chart.** Two measures = two charts.
- Thin marks: bars with 4 px rounded top and a 4 px baseline stub, 2 px lines, 5 px markers only on the highlighted point; grid lines `--line`, no axis lines except the baseline.
- Labels wear text tokens (ink / ink-2), never the series colour; direct label only on the max point.
- Legend for ≥ 2 series (line + dashed swatches in the panel header), none for one.
- Hover: crosshair + tooltip on lines (day · value · Δ vs. previous), per-bar tooltip on bars, cell tooltip on the heatmap. Keep the existing screen-reader table under each chart and the CSV export.
- Heatmap (Poptávka): one hue, `color-mix(accent 8–90 %, surface)`; row labels Po–Ne, column labels every 6 h.
- Funnel-style comparisons (Nabídky, Tržby podle platby) are horizontal bars with the value at the right — not pies.
- Dark mode uses the same formulas on dark surfaces (the mix stays readable because the base is `--surface`).

Chart.js stays for Analytika (already its own chunk); style it through the tokens above (`chartMock` / `registerCharts` defaults: font Manrope, colours from CSS vars). Reports keeps its hand-drawn SVG bar chart — restyle per the spec, do not add Chart.js to that chunk.

## 2. Reports [Reports]

Title row: "Reporty" + period chips (Dnes · Tento týden · Tento měsíc · Vlastní with calendar icon) + `Stáhnout CSV` right.
KPI grid 4×2 (`Stat`): Jízdy, Tržby, Průměrná cena, Čas do přiřazení (p50 · p90 caption), Čas k vyzvednutí, Míra zrušení (n z N), Z aplikace / telefonem, SMS (count · cost of limit). Deltas vs. previous period in success/danger.
Middle row (fixed 300 px): **Jízdy po dnech** bar chart · **Nejčastější trasy** list (route · count×) · **Hodnocení** (avg · count pill in header; rows stars · quote · driver · date).
**Report řidičů** table: Řidič · Jízdy · Tržby · Hotovost · Karta · Hodnocení · Hodiny online (all numeric right-aligned); driver + date filters above it; CSV.

## 3. Analytics [Analytics]

Title row: "Analytika" + period chips + granularity `Segmented` (Denně / Týdně / Měsíčně) + **Toggle** "Srovnat s předchozím obdobím" right. Tabs: Přehled · Poptávka · Provoz · Tržby · Řidiči · Zákazníci.

Přehled (designed): 4 `Stat` cards with deltas; row (330 px): **Jízdy po dnech** line chart (current accent, previous dashed) · **Poptávka · hodina × den** heatmap; row: **Nabídky · trychtýř** (Nabídnuto → Přijato → Dokončeno → Vypršelo → Odmítnuto bars) · **Řidiči · liga** top 3 with rating · **Tržby podle platby** bars.
Other tabs reuse the same panels: `Stat` row + 2-column chart rows; tables get the `Table` kit; drilldown (`DriverDrilldown`) opens as a page with `← Zpět na tabulku` in the `page-h`.

## 4. Settings

Tabs: **Flotila · Lidé · Vozidla · Trasy a zóny** (order changed: Flotila first — it is what an owner opens most).

**Flotila [SettingsFleet]** — left `Panel` form (2-column `form` grid): Název, Telefon, **Barva značky** (swatch + hex + live contrast pill "text bílý · 5,4:1" — reject < 3:1, see customer handoff), Logo (preview dot + file name + Nahrát jiné), Uvítací text (full width), Časový limit nabídky, Měsíční limit SMS, Automatické přidělování toggle disabled with "Brzy" pill and explanation. Footer `Zahodit změny` / `Uložit`. Right column: **Spotřeba mapových kreditů** (hero number · of budget · progress bar · run-rate caption, warning tone above 80 %, danger callout when exceeded), **SMS tento měsíc** (same pattern), info callout "Změny se zapisují do Auditu."

**Lidé [SettingsPeople]** — search + role chips + `Pozvat` primary. One-time password → **success callout** with the password in monospace and `Kopírovat` (replaces the separate panel; disappears on navigation). Table: Uživatel (avatar initials, name, e-mail) · Role pill (Správce flotily = accent, Dispečer = info, Řidič = neutral) · Telefon · Stav pill · Poslední přihlášení · actions `Upravit` / `Reset hesla` (Deaktivovat inside Upravit with confirm).

**Vozidla** — same table pattern: SPZ (as `Plate`), Značka, Model, Barva (swatch + name), Počet míst, Aktivní pill, `Upravit`; `Přidat vozidlo` primary.

**Trasy a zóny [SettingsRoutes]** — sub-navigation as chips with counts (Zóny 3 · Trasy 4 · Místa 6) + `Nová trasa` primary. Left: **Pevné trasy · podle priority** list (↑↓ reorder buttons, priority number, name + meta "type · direction · days", price, enable toggle; caption "první shoda vyhrává") and **Otestovat trasu** panel (pickup/dropoff `Ctrl`s, `Otestovat`, result pill "Pevná cena 100 Kč · trasa #1" / "Odhad …" / "Podle taximetru"). Right: **Upravit trasu** editor — 260 px map with pins and hint chip, then form: Název, Typ `Segmented` (Z bodu do bodu / Zóna / Mezi zónami), Cena, Poloměr, Platí ve dnech (7 day chips), Platí od / do, toggles Platí oběma směry + Zapnuto, footer Smazat (danger text) / Zrušit / Uložit trasu. Zóny: same split with Kruh / Mnohoúhelník segmented over the map. Místa: list with pin + name + address + enabled toggle — and Places now feed the customer "Oblíbená místa" and the dispatcher quick chips, so add the caption "Zobrazuje se zákazníkům a v dispečinku."

## 5. Audit [Audit]

Title + record count; filter row: Aktér select, Entita select, date range, search (order code), `Zrušit filtr`. Table: Čas (muted) · Aktér bold · Entita pill · Událost (human sentence incl. before → after and the reason, e.g. "Cena upravena 350 → 420 Kč · „Čekání 20 min“") · Objednávka code link. Paged.

## 6. Migration order

1. Desk kit (from the dispatcher handoff) → `Stat`, `Panel`, `Table`, `Tabs`, chips.
2. Reports: KPI grid, SVG bar restyle, tables.
3. Analytics: Chart.js theme from tokens, panel layout, heatmap, funnel bars.
4. Settings: tab order, Flotila form + usage panels + contrast check, Lidé table + one-time password callout, Vozidla, Trasy a zóny split editor.
5. Audit filters + table.
