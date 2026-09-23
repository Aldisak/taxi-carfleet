# Customer app UI redesign — implementation handoff (v1, 2026-09-23)

Design canvas: https://claude.ai/artifact/Eyoq4WBCbbzkQhMdJtwz5E (Design artifact, 23 artboards).
Scope of this pass: **customer app (`/customer`)** + shared design system. Driver and dispatcher apps keep the current UI until their own pass; the tokens below are written so they can adopt them without changes.

Direction: neutral UI (warm-grey ground, near-black ink) with the **tenant accent** (`fleet.primaryColorHex`) driving CTAs, pins and links — Bolt/Uber-style map-first layout with a bottom sheet. One typeface (Manrope), light + dark from one token set.

---

## 1. Tokens → `web/src/shared/theme/theme.ts`

Replace the flat Material-ish palette with semantic tokens. Keep the `DefaultTheme` shape (styled-components) but expose them as CSS custom properties too — dark mode and tenant accent are then a class/attribute flip, not a React re-render.

```css
/* Light (default) */
--bg:#F3F3F1; --surface:#FFFFFF; --surface-2:#EFEFEC; --surface-3:#E6E6E2;
--ink:#141414; --ink-2:#5E5E5A; --ink-3:#767672;
--line:#E6E6E2; --line-strong:#CFCFCA;
--success:#0E7A4A; --success-bg:#E4F3EB;
--warning:#8A5300; --warning-bg:#FFF4D6;
--danger:#C8362A;  --danger-bg:#FDECEA;
--info:#1E5EDC;    --info-bg:#E7EEFC;
--scrim:rgba(20,20,20,.45);
--shadow-card:0 1px 2px rgba(20,20,20,.06),0 4px 12px rgba(20,20,20,.06);
--shadow-sheet:0 -6px 28px rgba(20,20,20,.14);
--shadow-float:0 6px 20px rgba(20,20,20,.16);
--r-sm:8px; --r-md:14px; --r-lg:22px; --r-pill:999px;

/* Dark ([data-theme="dark"]) */
--bg:#0E0E0E; --surface:#1A1A1A; --surface-2:#262624; --surface-3:#30302E;
--ink:#F4F4F1; --ink-2:#A6A6A0; --ink-3:#8A8A85;
--line:#2C2C2A; --line-strong:#3E3E3B;
--success:#3DBB78; --success-bg:#12301F;
--warning:#F0B33C; --warning-bg:#3A2C0E;
--danger:#F0625A;  --danger-bg:#3B1917;
--info:#6E9BFF;    --info-bg:#172444;
--scrim:rgba(0,0,0,.6);
--shadow-card:0 1px 2px rgba(0,0,0,.4),0 4px 14px rgba(0,0,0,.35);
--shadow-sheet:0 -6px 28px rgba(0,0,0,.5);
--shadow-float:0 6px 20px rgba(0,0,0,.5);
```

All text pairs above were checked ≥ 4.5:1 (ink-2 on surface 6.5, warning on warning-bg 5.8, danger on danger-bg 4.6, dark ink-2 on surface 7.1).

### Tenant accent (the multi-tenant rule)
```
--accent      = fleet.primaryColorHex (default #0E7A4A)
--on-accent   = relativeLuminance(accent) > 0.36 ? '#141414' : '#FFFFFF'
--accent-text = theme === 'dark' ? mix(accent, #FFF, 35%) : accent   // accent used AS text on dark surfaces
```
Put `onAccent()` / `accentText()` in `shared/theme/` next to `fleetBranding.ts`; the customer `ThemeProvider` override currently sets only `colors.primary` — it should set these three vars on the app root instead. Reject accents with < 3:1 against both white and black in `AdminTenantSettingsPage` (colour picker validation) so every fleet gets a readable CTA.

### Old key → new token
| theme.ts today | new |
|---|---|
| `primary` / `primaryDark` | `accent` / `color-mix(accent 88%, black)` |
| `background` / `surface` / `border` | `bg` / `surface` / `line` |
| `text` / `textSecondary` | `ink` / `ink-2` |
| `error` / `warning` / `success` | `danger` / `warning` / `success` (+ `*-bg`) |
| `statusFree/EnRoute/Busy/Offline` | `success / info / warning / ink-3` |
| `orderNew/Assigned/InProgress/Completed/Cancelled` | pills: `info / warning / info / success / danger` (Accepted = info, Arrived = success) |
| `borderRadius.sm/md/lg` 4/8/12 | `r-sm/md/lg` **8/14/22** |
| `touchTargets.primary` 64 | primary button **56px**, secondary 48, icon 48 |
| `shadows.sm/md/lg` | `shadow-card / shadow-float / shadow-sheet` |

Typography (Manrope, self-host the woff2 in `web/public/fonts/`, `font-display: swap`; **Inter is declared today but never loaded — drop it**):

| class | size / weight | use |
|---|---|---|
| display | 34 / 800, ls −0.02em | price on price sheet |
| title | 24 / 800 | sheet headlines ("Řidič přijede za ~4 min") |
| headline | 20 / 700 | section titles |
| body-lg | 17 / 600 | addresses, list titles, buttons |
| body | 15 / 500 | paragraphs |
| label | 13 / 700 | field labels, "Změnit" |
| caption | 12 / 600, ink-2 | meta lines |

Motion: sheet snap 320 ms `cubic-bezier(.2,.8,.2,1)`; button press `scale(.98)` 120 ms; car marker interpolation 1 s linear (already in `markerInterpolation.ts`); honour `prefers-reduced-motion` globally, not only in `SearchingLoader`.

Add a `createGlobalStyle` (there is none today): box-sizing reset, `body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font)}`, focus-visible ring `0 0 0 3px var(--accent)`, `[data-theme]` switch, `prefers-color-scheme` default with a user override stored in the same place as language.

---

## 2. Shared component kit → `web/src/shared/ui/`

Today every feature file re-declares its own `styled.button`; ~10 button variants, three radii, 49 hard-coded `#fff`. Replace with one kit (each maps 1:1 to a CSS class on the "Komponenty" artboard):

| component | spec |
|---|---|
| `Button` variant `primary \| secondary \| ghost \| danger \| dangerGhost`, size `md(56) \| sm(44)` | r-md, 17/800, optional right-aligned `price` slot ("Objednat · 100 Kč"), `loading` swaps label ("Objednávám…"), disabled = surface-3/ink-3 |
| `IconButton` 48px round, `accent` variant | surface + shadow-card; used for menu, locate, call |
| `FleetChip` | 44px pill, 28px accent dot with initials or logo, fleet name — replaces the plain white "fleet name pill" |
| `Field` states default/focus/error, leading icon, prefix slot (+420) | 56px, surface-2 → surface + 2px ink border on focus; error border danger + caption |
| `CodeInput` 6 boxes 60px | replaces current single input; auto-advance, auto-submit |
| `Segmented` | "Hned / Na čas" |
| `Stepper` | 48px round ± buttons |
| `Chip` (`on` state) | 40px pill, 13/700 — option summary on the price sheet |
| `Pill` tone `neutral \| success \| warning \| danger \| info \| accent` | 28px, 12/800 uppercase — order status, price type, order code |
| `Plate` | bordered SPZ, 17/800, letter-spacing .08em (48px/24px variant when it is the main thing to look for) |
| `ListRow` + `ListIcon` | 60px min, 40px round icon, title + caption + trailing slot |
| `RouteSummary` | accent dot (pickup) → ink square (dropoff), 2px connector — Uber convention, same on the map |
| `PriceCard` | display price + price-type pill + one-line note |
| `DriverCard` | avatar initials, name, "Škoda Octavia · bílá", plate |
| `Callout` tone `neutral \| warning \| danger \| info` | replaces amber inline hints |
| `Toast` | ink on bg, top 116px, 15/700 |
| `OfflineBanner` | warning-bg strip under the safe area |
| `BottomSheet` (keep, restyle) | r-lg 22 top corners, 16px gutter, 40×5 handle, 28px bottom safe area, snap 30/70 dvh, `full` mode for search |
| `StarPicker` | 48px targets, filled star #E6A700 (dark #F0B33C) — replace unicode ★ with SVG |
| Map markers | pickup pin (accent circle on ink stem), pickup dot, dropoff square, car (surface rounded square, ink stroke), ETA label (ink bg) — move from hard-coded hexes in `trackingMarker.ts` / `centerPin.ts` to CSS vars |

Icons: inline stroke SVG set (24 viewBox, 2px stroke) — the canvas carries the full set (search, locate, phone, menu, back, close, clock, person, note, chevron, star, car, check, bell, wifi-off, map, history, train, hospital, pin, globe, shield, logout, plus, minus, calendar). No unicode glyphs, no emoji.

---

## 3. Screen-by-screen (customer)

Artboard names in brackets. Czech strings are the existing i18n keys unless marked **new**.

**Home [Main]** — map full-bleed; top row: menu IconButton · FleetChip (centered) · call IconButton(accent). Locate FAB right, above the sheet. Centre pin with "Vyzvednutí zde" label (**new**). Sheet (collapsed): pickup row (accent dot · reverse-geocoded address · "Změnit" link — pickup address is currently invisible), big "Kam to bude?" field (tap opens Search), **"Oblíbená místa"** list from **fleet Places** (`PlacesTab` is built but never consumed) with the fixed-route price pill when a route matches from the current pickup. Language selector moves to Menu.

**Search [Search]** — full sheet, back + "Kam to bude?", card with pickup + destination fields (destination focused, clear button), "Vybrat cíl na mapě" row (**new**, accent icon), suggestions with matched substring bold, meta line, price-type pill; "Návrhy poskytuje Mapy.com" footer keeps the attribution.

**Price sheet [Price / PriceEstimate]** — route drawn ink-black, camera fits both stops, "12 min · 4,2 km" label on the route. Sheet: RouteSummary (with "Upravit"), PriceCard (`Pevná cena` / `Odhad low–high` / `Orientační odhad` warning tone; Meter → non-orderable card "Cenu nelze spočítat, zavolejte nám." with call button), option chips **Hned · 1 cestující · Poznámka** (tap → Options), primary "Objednat" with price slot. Offline: button disabled + callout "Jste offline. Objednávku nyní nelze vytvořit – zavolejte nám prosím."

**Options [Options]** — sheet over scrim: "Možnosti jízdy"; "Kdy vás vyzvednout" Segmented Hned/Na čas + datetime Field + caption "Nejdříve za 20 minut, nejdéle 7 dní dopředu."; "Počet cestujících" Stepper with caption "Více než 4? Zavolejte nám."; note Field "Kde přesně vás vyzvedneme?"; "Hotovo". Replaces the +/− collapsible inside PriceSheet.

**Login [Login] / Code [Code]** — inline in the order flow (sheet over the route, order state preserved). Phone Field with +420 prefix, "Odeslat kód", privacy caption. Code: 6-box CodeInput, auto-submit, "Poslat kód znovu za 28 s" / "Změnit číslo".

**Tracking** — one page, headline + sheet content per status:
- New/Assigned [Searching]: pulsing accent rings around the pickup, "Hledáme řidiče…" + "Obvykle to trvá do 2 minut." (**new**), order-code pill, indeterminate progress bar, RouteSummary meta "Hned · 1 cestující · 100 Kč pevná cena", Zavolat + Zrušit objednávku. PushPrompt as a floating card under the top bar.
- Accepted [Coming]: car marker + route to pickup, "4 min" ETA label on the map; title "Řidič přijede za ~4 min", DriverCard, neutral callout "Sledujte bílou Škodu Octavia, SPZ 5SK 4821. Cena 100 Kč, platíte řidiči." (**new**).
- Arrived [Arrived]: toast "Řidič čeká u vchodu" (**new**, from driver note), pill "Na místě", plate shown at 48px — the one thing the customer needs to find on the street.
- InProgress [Riding]: "Jedete", "Cíl: …", pill "Probíhá", ETA label "Cíl za 6 min", price card, "Zavolat dispečink".
- Completed [Done]: success icon + "Hotovo – 100 Kč", "Ohodnoťte svoji jízdu" StarPicker, comment Field, "Odeslat hodnocení", ghost "Objednat znovu".
- Cancel [Cancel]: **bottom action sheet instead of a centred modal**; warning callout after Accepted; danger "Ano, zrušit" / secondary "Ne, ponechat".
- Cancelled [Cancelled]: danger icon + "Objednávka byla zrušena" + code/time, RouteSummary, "Objednat znovu" + "Zavolat".

**History [History]** — grouped by day, card per ride (status pill, route, price, "Objednat znovu" sm button), offline callout. **Reachable from Menu** (today it is URL-only).

**Menu [Menu]** — sheet: fleet identity (logo/initials, name, phone, signed-in number), rows: Historie jízd, Zavolat dispečink, Jazyk, Ochrana osobních údajů, Odhlásit se. Mount `OfflineGate` and `useMyActiveOrder` ("Máte aktivní objednávku … – sledovat") here/on Home — both exist but are orphaned.

**Offline [Offline]** — warning banner + sheet with call CTA and the search field disabled.

Dark artboards [DarkHome, DarkPrice, DarkComing, DarkDone] are the same files with `theme=dark`; every artboard has a `theme` and `accent` tweak in the properties panel to preview any fleet colour.

---

## 4. Migration order (suggested for Claude Code)

1. `theme.ts` tokens + CSS vars + global style + Manrope self-hosted; keep old keys as aliases for one release so driver/dispatcher still compile.
2. `shared/ui` kit (Button, IconButton, Field, Pill, Chip, ListRow, Callout, Toast, Plate, CodeInput, Segmented, Stepper, StarPicker, RouteSummary, PriceCard, DriverCard); restyle `BottomSheet`.
3. Map marker/pin SVGs → CSS vars (`centerPin.ts`, `trackingMarker.ts`, `driverMarker.ts`).
4. Customer screens in this order: shell/top bar + Menu → Home (+ Places quick list) → Search → Price/Options → Login/Code → Tracking states → History/Offline.
5. Tenant accent contrast rule + admin validation; dark-mode toggle (system default, override in Menu).
6. Keep the size-limit budget: Manrope 5 weights ≈ 60 KB brotli total — load 500/700/800 only if the budget is tight (400 and 600 are not used by the kit).

Not in this pass: driver app, dispatcher board, SuperAdmin. Their tokens are ready; a driver pass should start from the dark theme (night driving) and the 64px primary target.
