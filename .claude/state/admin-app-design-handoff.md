# SuperAdmin (/admin) UI redesign — implementation handoff (v1, 2026-09-24)

Design canvas: https://claude.ai/artifact/Eyoq4WBCbbzkQhMdJtwz5E → row **„Správa systému“** (`AdminFleets`, `AdminTenant`, `AdminPlatform`).
Shell and desktop kit: `design/dispatcher-app-design-handoff.md` §1–2 (same components, own header). Tokens: `design/customer-app-design-handoff.md`.

SuperAdmin has no fleet, so the app is **unbranded**: the header dot is ink ("CF · Carfleet · Správa systému"), the accent is the platform default (`#0E7A4A`) and never a tenant's colour — except inside a tenant's settings page, where the fleet's own dot/colour appears in the title row so it is obvious whose settings are being edited.

---

## 1. Shell

Header: brand (ink dot CF + "Carfleet · Správa systému"), nav **Flotily · Přehled platformy**, right: language, theme, "superadmin", `Odhlásit se`. No connection status (no hub). Login [`AdminLoginPage`]: same centred card as the dispatcher login with the ink dot and "Přihlášení správce systému".

## 2. Flotily [AdminFleets]

Title "Flotily" + "4 flotily · 3 aktivní" + `Vytvořit flotilu` primary (scrolls to / focuses the form).
Left `Panel` table: Flotila (fleet dot in the fleet's colour + name + slug · phone) · Řidiči · Jízdy / měsíc · **12 týdnů sparkline** (accent = growing, ink-3 = stable, danger = declining — same rule as the platform page) · Trend pill (Roste success / Stabilní neutral / Klesá warning / Neaktivní danger) · Stav pill · `Nastavení` xs button → tenant settings.
Right `Panel` **Vytvořit novou flotilu**: Kód (slug) with ".carfleet.cz" suffix hint, Název, Telefon flotily, E-mail správce flotily, warning callout "Dočasné heslo správce se zobrazí jen jednou po vytvoření.", 44 px `Vytvořit flotilu`. After creation the one-time password shows in a success callout with `Kopírovat` (same pattern as Lidé in the owner handoff).

## 3. Nastavení flotily [AdminTenant]

Title row: back button, fleet dot, fleet name 26/800 + caption "slug · vytvořeno · n řidičů", `Aktivní` pill, right: `Deaktivovat` (danger text) + `Uložit vše` primary — one save for the whole page, with a sticky footer if the page scrolls.
2-column grid of `Panel`s, each a 2-column `form`:
- **Flotila** — Název, Telefon, Měna, Časové pásmo, Barva značky (swatch + hex), Aktivní toggle.
- **Dispečink** — Časový limit nabídky (s), Max. poloměr nabídky (km), Automatické přidělování toggle + explanation, Zpoždění auto-přidělení (s). (This is where auto-dispatch is actually enabled; the owner page shows it disabled with "Brzy" until it ships for tenants.)
- **SMS** — Odesílatel, Měsíční limit (Kč), Cena za SMS (Kč), Uvítací text; header meta "212 SMS · 318 Kč tento měsíc".
- **Mapa a Mapy.com** — API klíč (masked, `Zobrazit` link), Střed mapy (lat, lon), Výchozí zoom, Měsíční rozpočet kreditů; header meta "6 420 / 10 000 kreditů".
Validation inline under the field (danger caption); keep `adminTenantSettingsForm.ts` rules.

## 4. Přehled platformy [AdminPlatform]

Title + period chips (Tento měsíc · 12 týdnů) + `Exportovat CSV`.
KPI grid 4×2 (`Stat`): Aktivní flotily, Jízdy tento měsíc, Tržby flotil, SMS náklady, Řidiči online teď, Mapové kredity, Chybovost API (24 h), Průměrné přiřazení (p50).
**Flotily · 12 týdnů** table: Flotila · Jízdy · Tržby · SMS · Kredity · sparkline (140×28) · Trend pill; legend in the panel header explains the three sparkline colours (roste / stabilní / klesá — `healthBand.ts`).
Neutral callout at the bottom: "SuperAdmin nevidí osobní údaje zákazníků – jen agregáty. Přístup k detailu flotily se loguje do jejího auditu." — make that true: no customer phone numbers anywhere in `/admin`.

## 5. Migration order

1. `AdminGuard` shell with its own header (reuse `AppLayout` header component with an `unbranded` prop).
2. Fleets table + sparkline (`sparklinePath.ts` already exists — colour by `healthBand`) + create form + one-time password callout.
3. Tenant settings page: 4 panels, one save, sticky footer.
4. Platform overview: `Stat` grid + table; CSV unchanged.
