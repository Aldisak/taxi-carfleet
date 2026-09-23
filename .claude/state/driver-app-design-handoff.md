# Driver app UI redesign — implementation handoff (v1, 2026-09-24)

Design canvas: https://claude.ai/artifact/Eyoq4WBCbbzkQhMdJtwz5E → row **„Řidič“** (15 artboards; `Driver*.dc.html`, the last two are the light variants).
Tokens, typography and the shared kit are defined in `design/customer-app-design-handoff.md` §1–2 — this doc only adds what the driver app needs on top. Copy voice: `design/customer-app-copy-deck.md` §1 (the fleet speaks as *my*; buttons are infinitives; in-progress labels end with `…`).

Direction: **dark theme is the default for drivers** (night shifts, phone in a cradle); light is a user choice in Nastavení → Vzhled. One action per screen, 64 px primary buttons, everything readable at arm's length. The tenant accent still drives CTAs; the driver app is otherwise unbranded today — the fleet chip in the top bar fixes that.

---

## 1. Shell (`DriverLayout`)

| part | spec |
|---|---|
| Top bar (over the map) | `StatusChip` left (dot + Offline / Online / Na cestě / Na místě / Obsazen / Připojuji…), `FleetChip` right. Replaces the orphaned `ConnectionDot`: the dot lives inside the status chip (`success` connected, `warning` reconnecting, `ink-3` offline). |
| Tab bar | 84 px, surface + top line, **icon + label** (car / history / menu icons from the kit — today it is text-only). Active = `accent-text`. Hidden while a ride is active (keep). |
| Sheet | same `BottomSheet` as the customer app; sits above the tab bar (`bottom: 84px`) when the bar is visible. |
| Banners | `OfflineBanner` (warning tone) for no connection; **danger tone** for "Poloha se neodesílá" (`StalePositionBanner`), since the driver will not get offers. Both under the safe area, above the map. |
| Pending badge | `Pill warning` with clock icon "čeká na odeslání" in the sheet header (replaces `PendingBadge` / `DriverQueueBar`). |
| Toast | ink-on-bg toast at top 116 px for "Hotovo ✓" / "Odešle se po připojení" / "Objednávka byla přeřazena" (`useRouteToast`). |

Theme: `data-theme` default `dark` for `/driver/*`; persist the choice next to language. `prefers-color-scheme` is ignored here on purpose — the driver picks.

## 2. Driver-only components

| component | spec |
|---|---|
| `StatusChip` | 44 px pill, 10 px dot with 3 px halo, 15/800 |
| `ShiftSummary` | 4-cell grid (Jízd · Hotovost · Karta · Online), surface-2 cells, 18/800 value, 11/700 uppercase label — mounts `useMySummary`, which is built but unused |
| `VehicleField` | `Field` with car icon + "Škoda Octavia · 5SK 4821" + chevron; opens a native select / sheet list |
| `OfferScreen` | full-screen surface (not a card over the map): header = `CountdownRing` 96 px (8 px track, warning stroke, seconds 32/800) + price pill + payment hint; body = **Nástup** label with distance/time, address 22/800, meta line (street · customer · passengers), **Cíl** with km, note callout; **map preview** 200 px (route, pickup pin, own position); footer = `Přijmout` 64 px primary, `Odmítnout` secondary |
| `DeclineReasons` | full-width 56 px option rows (`Daleko` / `Mám pauzu` / `Jiný důvod`), selected = surface + 2 px ink border; footer swaps to **danger** `Odmítnout` + secondary `Zpět k nabídce` — fixes today's green-Decline inconsistency |
| `NavButton` | `btn nav`: info-bg / info text, 48 px, navigate icon — "Navigovat k nástupu" / "Navigovat k cíli"; builds geo:/Google/Mapy.cz/Waze links per `NavAppPreference` |
| `RideButton` | 64 px primary `xl`: `Jsem na místě` → `Zahájit jízdu` → `Ukončit jízdu`; always the last element in the sheet |
| `NoShowButton` | `danger-ghost`, disabled with countdown "Zákazník nepřišel · dostupné za 1:48" until the 5-min wait passes |
| `NumericKeypad` | 3×4 grid, 60 px keys 26/700, surface-2; keys 1–9, **C** (clear — the string exists, the key did not), 0, ⌫ |
| `PaymentToggles` | 3 equal 56 px buttons Hotově / Kartou / Faktura, selected = surface + ink border |
| `PriceLock` | price card with `Pevná cena` pill, 40/800 price, "Změnit cenu" link → `Override` screen; keypad rendered at 45 % opacity behind the lock so the driver sees it is there |
| Settings rows | `dia` rows 44 px (label · value/pill/toggle), `radio` rows 44 px for nav app, `Toggle` 52×32 |

## 3. Screen-by-screen

**Login [DriverLogin]** — fleet dot + "Přihlášení řidiče" + fleet name; fields Kód flotily / E-mail / Heslo; **Toggle** "Zůstat přihlášen" (was a checkbox); 64 px `Přihlásit se`; footer "Verze · Problém s přihlášením? Zavolejte dispečink." Remove the inline `style={{marginTop}}`.

**Home – offline [DriverHome]** — map with own position; sheet: "Začít směnu" + hint, `VehicleField`, permission callout (warning) "Povolte polohu pro zahájení směny · **Povolit**" — this replaces the orphaned `PermissionPriming` cards: ask inline, at the moment it blocks the action. `InstallBanner` shows once above the sheet on first visit (same callout style, info tone).

**Home – online [DriverOnline]** — "Čekám na objednávku", meta "Online od 14:02 · vozidlo", pill `Volný`, `ShiftSummary`, secondary `Ukončit směnu`.

**Home – degraded [DriverDegraded]** — danger banner "Poloha se neodesílá – zkontrolujte GPS", status chip "Připojuji…", toast "Hotovo ✓ · Odešle se po připojení", pending pill in the header, neutral callout explaining the queue, `Ukončit směnu` disabled while offline.

**Offer [DriverOffer] / Decline [DriverDecline]** — see `OfferScreen`. Sound + vibration unless silent mode. States: expired → ring stops, headline "Nabídka vypršela", single secondary `Zavřít`; unavailable → danger callout "Nabídka již není dostupná"; no connection → warning callout "Bez připojení, zkuste znovu" and `Přijmout` becomes `Zkusit znovu`. Show `customerName`, `note`, `scheduledAt` (all in the DTO, none rendered today).

**Ride – accepted [DriverRide]** — headline "Příjezd za 4 min" + price pill; pickup row with call icon button (`tel:` to the customer); callout with customer · passengers · note; `NavButton` then `Jsem na místě`.

**Ride – arrived [DriverArrived]** — "Čekáte na zákazníka" + elapsed pill; info callout "Zákazníkovi jsme poslali SMS, že jste na místě."; `Zahájit jízdu`; `NoShowButton`.

**Ride – in progress [DriverRiding]** — "Cíl za 16 min" + `Probíhá` pill; destination row (square marker); callout customer · passengers · price; `Navigovat k cíli` then `Ukončit jízdu`. When there is no dropoff (meter ride) the nav button is hidden and the row says "Cíl řekne zákazník".

**Complete [DriverComplete]** — header with back + order code; `PriceLock` for fixed price (keypad directly for estimate/meter); `PaymentToggles`; 64 px `Dokončit · 350 Kč hotově` (the button repeats price + method so the driver confirms what they enter).

**Override [DriverOverride]** — "Změnit cenu" + pill "Původně 350 Kč"; live price 40/800; keypad; reason field with caption "Min. 5 znaků. Dispečer změnu uvidí v historii objednávky."; payment; `Dokončit · 420 Kč hotově`. Error strings unchanged (`Zadejte cenu větší než 0.` …).

**History [DriverHistory]** — title + date chip (calendar icon, opens native date input); `ShiftSummary` reused for day totals (Jízd · Hotovost · Karta · Faktura); rows route / time · payment / price, active ride shows `Probíhá` pill. Empty state "Žádné jízdy v tento den."

**Settings [DriverSettings]** — profile row (avatar initials, name, fleet · role, online pill); card: Jazyk, **Vzhled** (new: Světlý / Tmavý), Tichý režim toggle; Navigace radio group; Diagnostika card (Oprávnění polohy / oznámení as pills Povoleno / Zamítnuto / Nevyžádáno, last position age, connection with dot); `Odhlásit se · verze` danger-ghost.

## 4. Migration order

1. Theme default dark for `/driver`, `StatusChip` + icon tab bar in `DriverLayout`; mount `ShiftSummary`, `InstallBanner`, inline permission callout (delete `PermissionPriming`, `ConnectionDot`, `StatusButton` — orphaned).
2. `OfferCard` → `OfferScreen` full-screen with map preview; fix decline colour semantics.
3. `RideSheet` per-status layout above; `NavButton`; `NoShowButton` countdown label.
4. `CompletePage` → `PriceLock` + keypad + toggles; `Override` as its own route (`/driver/ride/complete/override`) so the back gesture is predictable.
5. History and Settings restyle; add Vzhled.
6. Keep the 360 px minimum width and the size-limit budget; the map preview on the offer reuses the existing Leaflet instance (no second map).
