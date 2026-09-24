# Assignment 11 — Product website: pricing overhaul + full i18n

Read `00-PROJECT-CONTEXT.md` first. **Follow-up to assignment 10** (`10-product-website-astro.md`,
which built the Astro SSG at `product-website/`). **Standalone add-on**: does not depend on
assignments 01–09 and does not touch `web/` or `api/`. Lane: **web** throughout (no backend).

## Goal

The owner updated the hand-authored reference (`product-website/reference/index.html`) with a
**redesigned pricing section** (an interactive price calculator, four tier cards, a restructured
"in every plan" footer, two new FAQ entries, and updated JSON-LD offers). Port those changes into the
component-based Astro site. **In the same pass, close a localization gap:** the decorative app-mockup
copy (phone, dispatch board, feature minis, brand phones) currently renders **literal Czech on the
`/en/` page** because the mockup components read literal strings from `src/data/*.ts` and never call
`t()` — even though most translations already exist as unused `mock.*` keys. Make **all** user-facing
copy on the site flow through `t()` so `/en/` is fully English.

This is a **redesign of the pricing section**, not a pixel-for-pixel port — assignment 10's
"no visual regression" constraint is superseded for `#pricing`. Everything else stays a faithful port.

## Reference & preservation

- The **new working-tree** `product-website/reference/index.html` is the source of truth to port from.
  Git state: the old tracked copy is deleted and the new file is untracked — **stage the new
  `reference/index.html`** as part of this work and keep it thereafter untouched; every acceptance
  check diffs against it.
- Do not re-scaffold. The Astro project, layout, primitives, i18n helper (`src/i18n/t.ts`), and parity
  script (`scripts/check-i18n-parity.mjs`, wired as `npm run check:i18n`) already exist — extend them.

## Background: why `/en/` shows Czech today

- `src/components/PhoneMockup.astro` reads `phoneMockup` from `src/data/hero.ts` (literal Czech);
  `MiniMockup.astro` reads `miniMockupCopy` from `src/data/features.ts`; `DispatchBoard.astro` reads
  `dispatchBoard` from `hero.ts`; `TinyPhone` is fed `brandPhones` from `src/data/brand.ts`. None of
  these go through `t(locale, …)`, so both locales render the Czech literals.
- The i18n dictionaries **already contain** `mock.*` values in cs.json **and** en.json (e.g.
  `mock.ride` = "Vaše jízda" / "Your ride", `mock.edit`, `mock.pickup`, `mock.dest`, `mock.fixed`,
  `mock.now`, `mock.pax`, `mock.order`, `mock.accept`, `mock.decline`, …). They are **dead keys** —
  authored but never wired. Parity passes because the key *sets* match; the render is still Czech.
  **The parity check is exactly what let this bug through** — it compares key sets, not rendered text.
- `HomeSections.astro` carries a comment stating the mockups are "kept literal in both locales on
  purpose." **That decision is reversed by this assignment** — remove/replace that comment.

## Localize-vs-literal rule (decision — confirm at Gate A)

Applies to every string inside the mockups and the pricing block. This is a **product decision the
owner approves when accepting the spec** (conductor Gate A), not a mid-run question.

- **Localize** (route through `t()`): all UI labels and common-noun descriptors — ride, edit, pickup,
  destination, fixed price, now, passenger(s), order, accept/decline, "on the way", the calculator and
  tier copy, and descriptor words inside sample routes/cars (`nádraží`→station, `centrum`→centre,
  `nemocnice`→hospital, `bílá`→white, `Lázně`→spa, etc.).
- **Stay literal** in every locale: money (`… Kč` — per `rules/web-react-style.md#dates-and-money`,
  money stays `cs-CZ` in all UI languages), the product name "Taxi Fleet", sample fleet names
  ("Taxi Kolín/Poděbrady/Čáslav"), place proper nouns ("Kolín", "Kutná Hora", "Masarykovo náměstí 12"),
  sample driver names ("Jan Novák", "Jan N."), plates ("5SK 4821"), the car model brand ("Škoda
  Octavia"), and demo phone/email.

**Borderline items — owner may veto at Gate A** (default shown):

| String (cs) | Default | Rationale |
|---|---|---|
| `Kolín, nádraží` (pickup place) | keep proper noun, but the descriptor is a common noun | place name is a proper noun; splitting "nádraží" mid-string is awkward — default: **keep whole string literal**, revisit only if owner wants "Kolín, station" |
| `Škoda Octavia · bílá` | **decompose**: keep "Škoda Octavia", localize "bílá"→"white" | model is a brand; colour is a common noun |
| Route descriptors (`… → centrum`, `Lázně → nádraží`, `Náměstí → nemocnice`) | **localize the common nouns**, keep town/proper nouns | user explicitly flagged untranslated route text |
| Composite detail strings (board row `detail`, `driver.dest`) | **whole-string-per-locale key** (faithful, lowest risk) — one key per composite, translated as a sentence | mixing labels + sample data; decomposition adds churn for no gain |

## Deliverables

### 1. Wire + extend mockup i18n (fixes the `/en/` Czech render)

Make every mockup component resolve copy via `t(locale, key)`. The locale already reaches the
composition in `HomeSections.astro` (`const tr = (key) => t(locale, key)`); thread the resolved
strings down as props (preferred — keeps components locale-agnostic, matches the existing prop-passing
pattern for `PricingList`/`Origin`/`ContactForm`) rather than importing `t` inside the mockups.

- **`PhoneMockup.astro` / `src/data/hero.ts`** — route `ride/edit/pickup/dest/fixed/now/pax/noteChip/
  order/note` through the existing `mock.*` keys. Add **new** keys for anything without one:
  `mock.eta` ("12 min · 4,2 km"). Keep `fleet`, `pickupPlace`/`destPlace` (proper nouns), and the
  `price`/`orderPrice` (`… Kč`) literal per the rule above.
- **`DispatchBoard.astro` / `dispatchBoard` in `hero.ts`** — `board`/`live` use existing `mock.board`/
  `mock.live`; the three row `badge`s use existing `mock.assigned`/`mock.new`/`mock.done`. Add
  **new whole-string** keys for each row `route` and `detail`, and keep driver first names literal
  (proper nouns).
- **`MiniMockup.astro` / `miniMockupCopy` in `features.ts`** — rider `coming/onway/pay/call`, driver
  `offer/fixed/accept/decline`, dispatch `week/rides/revenue/assign/fromApp/byDay` reuse existing
  `mock.*`. Add **new** keys for the strings that lack one: rider `car` (decompose model+colour per
  rule), driver `pickup`/`dest`/`timer`, and the dispatch numeric captions if any label is missing
  (numeric **values** like `184`, `31 250 Kč`, `61 %`, `1:40` stay literal).
- **`TinyPhone` / `brandPhones` in `brand.ts`** — localize the route descriptors (keep towns/proper
  nouns and `… Kč`), and `order` via existing `mock.order`.
- Remove the "kept literal on purpose" comment in `HomeSections.astro`.
- **Build the add-list mechanically**, do not eyeball it: enumerate every literal in `hero.ts`,
  `features.ts`, `brand.ts`; diff against existing cs.json keys; every genuinely new label gets a new
  key added to **both** `cs.json` and `en.json` in the same change.

### 2. Pricing overhaul (`#pricing`) — port the new reference

Replace the current single `PricingList.astro` two-column block with the new structure from
`reference/index.html` `#pricing` (see the `.calc` / `.tiers` / `.price-foot` markup and the
`/* pricing */` CSS block, plus the `pricing calculator` `<script>`):

- **`SectionHead`** (eyebrow/title/lead) — updated copy (`price.eyebrow`, `price.title` = "Jedna
  částka za celou flotilu", `price.body`).
- **Interactive calculator** (`.calc`) — a new component, e.g. `PricingCalculator.astro`:
  - a labelled `<input type=range min=1 max=15>` with −/+ stepper `<button>`s and an `<output>` showing
    the car count; live "Vaše cena" panel (price + tier pill + custom-quote note for 11+) and a
    comparison panel (struck-through typical per-driver-licence price + savings pill).
  - **The reference JS cannot be ported verbatim.** It drives off the deleted client-side lang toggle
    (`lang-cs`/`lang-en` listeners, `CT[lang]`, `document.getElementById('lang-*')`). In the Astro
    routing model there is no runtime toggle — each locale is a static page. Port it as a **per-locale
    client `<script>`** that receives the page-locale strings via `define:vars` (or `data-*`
    attributes): tier labels (`Malá flotila · do 3 aut` / `Small fleet · up to 3 cars`), the
    savings template (`Ušetříte {x} Kč měsíčně` / `You save {x} Kč a month`), `individuálně`/
    `individually`, and the +/− `aria-label`s. **Czech pluralization** (`auto`/`auta`/`aut` vs
    `car`/`cars`) must be baked into the injected per-locale strings/logic — the reference's `cars(n)`
    function is locale-specific.
  - Pricing constants from the reference: tiers `small` ≤3 = 1490, `medium` ≤6 = 2490, `large` ≤10 =
    3490, `custom` >10 = individual; comparison `LIC = 599`/driver `+ APPFEE = 1500`. Keep the `kc()`
    thousands-with-`&nbsp;` + `Kč` formatting.
- **Tier cards** (`.tiers`, 4× `.tier`) — small/medium(popular)/large/custom, each a pill + title +
  price + caption + a `#contact` CTA button. `medium` is highlighted; the active tier syncs with the
  calculator (`is-active`). Prices are literal `… Kč`.
- **"In every plan" footer** (`.price-foot`) — `price.inclTitle` + the 6-item `incl` checklist
  (`price.l1`…`price.l6`, some copy changed vs the old list) + the three term pills
  (`price.t1`/`t2`/`t3`) + the SMS / switching / VAT notes (`price.sms`, `price.switch`, `price.note`).
- **Data module** — extend/replace `src/data/pricing.ts` with the typed tier + calculator model
  (tier codes, thresholds, prices, i18n key references) so the component maps over data, not inline
  literals. `price.cta` (the old single CTA key) is removed; per-tier CTAs use `tier.cta*`.
- **New i18n keys** (add to both locales — the EN values already exist in the reference's `EN` object,
  port them): `calc.label`, `calc.yours`, `calc.perMonth`, `calc.perMonth2`, `calc.custom`,
  `calc.compareLabel`, `calc.compareNote`; `tier.small`, `tier.smallCars`, `tier.medium`,
  `tier.mediumCars`, `tier.popular`, `tier.large`, `tier.largeCars`, `tier.largeExtra`, `tier.custom`,
  `tier.customCars`, `tier.customPrice`, `tier.customNote`, `tier.perMonth`, `tier.perMonth2`,
  `tier.perMonth3`, `tier.cta`…`tier.cta4`; `price.inclTitle`, `price.sms`, `price.switch`,
  `price.note`; and the calculator runtime strings (tier labels with `·` descriptor, savings template,
  `individuálně`/`individually`, minus/plus aria-labels).
- **Scoped CSS** — port the new `.calc*` / `.tiers` / `.tier*` / `.price-foot` / `.incl` / `.price-terms`
  rules and the new responsive breakpoints (`max-width:1000px` → 2-col tiers, `860px` → single col,
  `520px` → single-col tiers) into the component's scoped `<style>`; keep the shared token names.

### 3. Head / JSON-LD update (`Base.astro`)

- **`SoftwareApplication.offers`** changed from a single object to an **array of three priced offers**
  (Malá 1490 / Střední 2490 / Velká 3490 CZK, each "měsíčně bez DPH"). Port the exact shape from the
  new reference `<script type="application/ld+json">`.
- **`FAQPage.mainEntity`** gains the two new Q&A (q8 "Co když přidám auto?", q9 "Platím za řidiče?").
- Two new visible FAQ entries too: add `faq.q8/a8`, `faq.q9/a9` to both locale dictionaries and to the
  `src/data/faq.ts` list so they render in `#faq`.
- Verify the JSON-LD is emitted per-locale consistently with how `Base.astro` currently handles it.

### 4. Verify

- `npm run build` + `npm run check` (TS strict, 0 errors) + `npm run check:i18n` (parity green).
- Visual + behavioral diff of `#pricing` against the **new** `reference/index.html` (calculator drag,
  stepper, tier highlight, savings math, custom 11+ state), both themes, mobile + desktop widths.
- **Assert `/en/` is actually English** (see AC #3) — not just parity-green.

## Work Items (lane: web)

| id | title | depends_on | files_scope |
|----|-------|-----------|-------------|
| WI-1 | Wire mockup components to `t()` + extend `mock.*` (phone/board/mini/brand) so `/en/` renders English; add missing keys to both locales; drop the "kept literal" comment | — | `product-website/src/components/{PhoneMockup,DispatchBoard,MiniMockup,TinyPhone}.astro`, `src/data/{hero,features,brand}.ts`, `src/components/HomeSections.astro`, `src/i18n/{cs,en}.json` |
| WI-2 | Pricing overhaul: `PricingCalculator.astro` (localized client script + pluralization) + tier cards + `price-foot`; replace `PricingList.astro`; `src/data/pricing.ts` model; scoped CSS + new breakpoints; new `calc.*`/`tier.*`/`price.*` keys in both locales | WI-1 | `product-website/src/components/PricingCalculator.astro` (new), `PricingList.astro`, `src/components/HomeSections.astro`, `src/data/pricing.ts`, `src/i18n/{cs,en}.json` |
| WI-3 | Head/JSON-LD: `SoftwareApplication.offers` array + FAQPage q8/q9; add `faq.q8/a8/q9/a9` to dicts + `src/data/faq.ts` | WI-1 | `product-website/src/layouts/Base.astro`, `src/data/faq.ts`, `src/i18n/{cs,en}.json` |
| WI-4 | Verify: `npm run build` + `check` + `check:i18n`; `/en/`-is-English assertion + no-literal scan; visual/behavioral diff of `#pricing` vs new `reference/index.html`; stage the new `reference/index.html` | WI-1, WI-2, WI-3 | `product-website/**` |

**Topo order:** `WI-1 → {WI-2 ∥ WI-3} → WI-4`.

## Acceptance Criteria

1. `cd product-website && npm install && npm run build` succeeds; `npm run check` is clean (TS strict,
   0 errors); `npm run check:i18n` (cs ↔ en key-set parity) is green.
2. `#pricing` on both `/` and `/en/` matches the **new** `reference/index.html`: the interactive
   calculator (range + −/+ steppers + `<output>`), the four tier cards (medium highlighted, active
   tier synced to the calculator), and the "in every plan" footer (checklist + term pills + SMS/
   switch/VAT notes) are all present and behave as the reference (savings math, 11+ custom state).
3. **`/en/` is fully English.** Every previously-Czech mockup label (phone: "Vaše jízda"→"Your ride",
   "Upravit"→"Edit", "Vyzvednutí"→"Pickup", "Cíl"→"Destination", "Pevná cena"→"Fixed price",
   "Hned"→"Now", "1 cestující"→"1 passenger", "Poznámka"→"Note", "Objednat"→"Order"; board, feature
   minis, brand phones, and the calculator/tier copy) renders its English value on `/en/`. Verified by
   an explicit assertion on rendered `/en/` output (a scan that no localizable literal from the
   mockup/pricing components survives in English), **not** by the key-set parity check alone.
4. **No hardcoded localizable copy** in components/pages — all such text flows through `t()` and the
   `cs.json`/`en.json` dictionaries. Per the localize-vs-literal rule, money (`… Kč`), the product
   name, sample fleet/driver/place proper nouns, plates and the car model stay literal in every locale.
5. JSON-LD parity with the new reference: `SoftwareApplication.offers` is the three-offer array with
   correct prices, and `FAQPage.mainEntity` includes q8 and q9; the two new FAQ entries also render in
   the visible `#faq` list in both locales.
6. Accessibility of the new interactive calculator: the range input is labelled with a live
   `aria-valuetext`, the result panel is a polite live region, the −/+ steppers have localized
   `aria-label`s and ≥48×48px targets; no new axe/Lighthouse violations vs the rest of the site.
7. The new `product-website/reference/index.html` is staged and preserved unchanged; no changes to
   `web/`, `api/`, the shared design tokens, or any non-`#pricing` section's visual language.

## Verification

```bash
cd product-website
npm install
npm run build          # + npm run check, npm run check:i18n
npm run preview        # open / (cs) and /en/ (en)
```
Then: exercise the calculator on both locales (drag the slider 1→15, click −/+, confirm tier
highlight, savings and the 11+ "individuálně/individually" state); switch to `/en/` and confirm the
phone/board/mini/brand mockups and the whole pricing block are English; run Lighthouse/axe on
`#pricing`; confirm `npm run check:i18n` is green.

## Notes / rationale

- **Parity check is necessary but not sufficient.** It compares key sets; the mockup bug had matching
  keys in both locales and still rendered Czech. AC #3 adds a rendered-output assertion so the fix
  can't silently regress the same way.
- **Calculator is the hard part.** The reference JS is coupled to the old client-side language toggle
  that the Astro i18n-routing port removed. Re-implement as a per-locale `<script>` fed the page
  locale's strings (incl. Czech `auto/auta/aut` pluralization) — do not copy the `CT[lang]`/`lang-*`
  wiring.
- **This supersedes assignment 10's "no visual regression" for `#pricing` only** — that section is a
  deliberate redesign. Every other section stays a faithful port; the visual diff for them still
  anchors on the (now-updated) reference.
- **Follow-up (out of scope, unchanged from assignment 10):** wire `ContactForm` to a real anonymous,
  rate-limited `POST /api/v1/public/leads`, and add a CI build/deploy step for the site.
