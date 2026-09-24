# Assignment 10 — Product website → Astro app

Read `00-PROJECT-CONTEXT.md` first. **Standalone add-on**: this assignment does not depend on
assignments 01–09 and does not touch `web/` or `api/`. It only *consumes* the shared design
tokens. Lane: **web** throughout (no backend).

## Goal

Rebuild the hand-authored marketing site `product-website/index.html` (one 63 KB file: inline
`<style>` + inline `<script>` + ~12 sections) as a maintainable, **component-based, statically
generated [Astro](https://astro.build) site** — with **no visual or behavioral regression** and
reusing the app's shared design tokens. The current file is preserved as the reference to port from.

## Scope

**In:**
- An Astro SSG project rooted at `product-website/`.
- Decompose the single HTML into: a base layout, chrome (nav/footer), primitive components,
  section components, typed data modules, i18n dictionaries, and extracted styles.
- **CS (default) + EN**, via Astro's built-in **i18n routing** (`/` = cs, `/en/` = en). Built so a
  third locale is a config + one JSON file (mirrors the app's registry-driven i18n discipline).
- Preserve all `<head>` SEO: `<title>`, meta description, canonical, `hreflang`, Open Graph,
  `theme-color`, JSON-LD (`Organization` + `SoftwareApplication` + `FAQPage`), `favicon.svg`, fonts.
- Preserve light/dark behavior (`prefers-color-scheme` + `[data-theme]`) and the same responsive
  breakpoints (900 / 860 / 700 / 480 / 420 px) and `clamp()` fluid type.
- Port the contact-form **client-side stub** (validation + clipboard-copy + toast) as-is.

**Out:**
- **Any backend work.** The contact form stays a client stub; a real lead endpoint
  (`POST /api/v1/public/leads`) is a documented follow-up, NOT part of this assignment.
- The 6-locale app registry — this site is **CS + EN only** (the reference already ships only these
  two; the JSON-LD `inLanguage` list is metadata and may stay as-is).
- Deploy / CI wiring beyond a documented follow-up (the site is static; no CI step added now).
- Any change to `web/`, `api/`, or the site's **visual language** — this is a faithful port, not a
  redesign. Do not restyle; match the reference pixel-for-pixel.

## Reference & preservation

- The source of truth to port from is the current `product-website/index.html`. **Move it to
  `product-website/reference/index.html`** and keep it there untouched — every acceptance check
  diffs against it. `product-website/` currently has **no `package.json`**; this assignment creates one.

## Deliverables

### 1. Project scaffold (`product-website/`)
- `npm create astro@latest` — minimal/empty template, **TypeScript strict**, Node ≥ 20 (match
  `web/package.json` engines). Add `package.json` (`dev`/`build`/`preview`/`astro check` scripts).
- `astro.config.mjs` with the built-in i18n:
  ```js
  i18n: { defaultLocale: 'cs', locales: ['cs', 'en'], routing: { prefixDefaultLocale: false } }
  ```
  → `/` renders Czech, `/en/` renders English (matches the existing `hreflang` intent; replaces the
  old `#en` hash toggle).
- `public/favicon.svg` (port the referenced icon).

### 2. Styles (`src/styles/`)
Extract the two inline `<style>` blocks (~260 lines) into:
- `tokens.css` — the CSS custom properties from the reference `:root` (light), the
  `@media (prefers-color-scheme:dark)` block, and `:root[data-theme="dark"]`. **Reuse the exact
  token names already shared with the app** (`web/src/shared/theme/GlobalStyle.tsx`): `--bg`,
  `--surface`, `--surface-2/3`, `--ink`, `--ink-2/3`, `--line`, `--line-strong`, `--success`/`-bg`,
  `--warning`/`-bg`, `--danger`/`-bg`, `--info`/`-bg`, `--accent` (`#AD4F09`), `--on-accent`,
  `--accent-text`, `--accent-soft`, `--shadow-card/float/sheet`, `--r-sm/md/lg/pill`, `--font`,
  and the site-only `--map`/`--map-road`/`--map-road-2` mockup vars. **Do not fork or rename the
  palette.**
- `global.css` — reset (`box-sizing`, `img`, `[hidden]`), `body` (bg/ink/font/size 15/weight 500),
  `h1..h3`/`p` resets, `a{color:var(--accent-text)}`, the `:focus-visible` ring, `.wrap` container,
  and the type-ramp helpers (`.eyebrow`, `.h-title`, `.h-section`, `.h-card`, `.lead`, `.caption`).
- Component-specific rules live in each `.astro` file's scoped `<style>`. No CSS framework (Tailwind
  is banned repo-wide, decision 2026-09-11); no palette duplication.

### 3. Layout & chrome (`src/layouts/`, `src/components/`)
- `Base.astro` — owns `<head>`: charset/viewport, `<title>`/description (per locale), canonical +
  `hreflang` (now `/` and `/en/`), OG tags (per-locale `og:locale`), `theme-color`, JSON-LD graph,
  favicon, font preconnect + Manrope stylesheet (self-host note kept as a comment). Renders the
  skip-link, `<Navigation>`, a `<slot />`, and `<Footer>`.
- `Navigation.astro` — sticky `.nav`: brand (`brand-dot` SVG + "Taxi Fleet"), section anchor links
  (`#features`/`#how`/`#pricing`/`#faq`), the **CS/EN toggle rendered as links** to `/` and `/en/`
  (with `aria-pressed`/`aria-current` on the active locale), and the primary "Zavolat" CTA → `#contact`.
- `Footer.astro` — company line, Privacy/Terms links, "Built in Kolín. Maps by Mapy.com." attribution.

### 4. Primitive components (`src/components/`)
- `Button.astro` — `variant: 'primary' | 'secondary'`, `size?: 'sm'`, optional leading icon slot
  (ports `.btn`/`.btn-primary`/`.btn-secondary`/`.btn-sm`).
- `Pill.astro` — `variant: 'accent' | 'info' | 'warning' | 'success' | 'neutral'` (ports `.pill*`).
- `SectionHead.astro` — `eyebrow`, `title`, optional `lead` (ports `.sec-head`).
- `Icon.astro` — `name` prop over an inline-SVG set extracted from the reference (nav car, phone,
  feature/list/pricing check icons, map pins, FAQ chevron, form-submit). `aria-hidden` by default.
- `FormField.astro` — `label`, `type`, `name`, `required?`, `id` (ports `.field`; keeps label↔input
  association and focus/`aria-invalid` states).

### 5. Section components (`src/components/`)
- `Hero.astro` (headline/lead/2 CTAs/caption) composing the two bespoke CSS-only mockups
  `PhoneMockup.astro` (`.phone/.screen/.map/.route/.topbar/.sheet/.iconbtn`) and
  `DispatchBoard.astro` (`.board/.orow/.drivers`). These are custom, content-specific — keep their
  markup faithful.
- `Card.astro` (the 3 "Why" cards: icon + title + body).
- `Pillar.astro` (the 3 Feature pillars: `tag`/`title`/`body`/`items[]` + a `visual` slot; the
  even/odd flip is a CSS/scoped concern) composing `MiniMockup.astro`
  (`type: 'rider' | 'driver' | 'dispatch'`).
- `TinyPhone.astro` (the 3 Brand color variants: `title`/`route`/`price`/`accent`).
- `Step.astro` (the 3 How steps; CSS counter for the number).
- `PricingList.astro` (the 6-item feature checklist + terms `Pill`s + CTA).
- `FaqItem.astro` (native `<details>`/`<summary>`; `question`/`answer`).
- `ContactForm.astro` — the copy-number button + the 5-field form (`f-name`, `f-phone`, `f-fleet`,
  `f-cars`, `f-note`, submit `f-submit`, `form-msg`), porting the vanilla-JS validation +
  `navigator.clipboard` copy (with range-selection fallback) + `toast` via a scoped `<script>`.
  **Keep the demo `setTimeout` submit stub** and its "wire to POST /api/v1/public/leads before
  launch" comment.

### 6. Data (`src/data/*.ts`, typed)
Extract hardcoded, repeated content into typed modules the sections map over:
`whyCards` (3), `features` (3 pillars, each with a 5-item list), `faq` (7 Q&A), `pricingFeatures`
(6), `routes` (3 origin routes), `steps` (3). Values are **i18n keys**, not literal copy (copy lives
in the dictionaries — §7).

### 7. i18n (`src/i18n/`)
- `cs.json` + `en.json` — the ~100 strings currently split between the HTML `data-i18n` innerHTML
  (Czech) and the JS `EN` object (English), plus the `MSG` dict (form/toast: `sending`/`ok`/`err`/
  `req`/`copied`/`copyFail`). Keys keep the reference's dot notation (`nav.*`, `hero.*`, `p1.l1`,
  `faq.q1`, `contact.*`, …). **Note:** a few values contain inline HTML (e.g. `hero.title` has
  `<br>`) — render those specific keys with Astro `set:html`; everything else is plain text.
- A small typed `t(locale, key)` helper (keyed by locale) used by every component — **no hardcoded
  user-facing strings anywhere** in components/pages.
- A **parity check** (a tiny test or `astro check`-time assertion) that fails if the `cs` and `en`
  key sets differ — mirrors `web/src/shared/i18n/locales.parity.test.ts`.

### 8. Pages (`src/pages/`)
- `index.astro` (cs) and `en/index.astro` (en) — each wraps `Base` and composes the section
  components in document order (Hero → Why → Features → Brand → How → Pricing → Origin → FAQ →
  Contact), passing the locale to `t()`. Keep the two pages thin (a shared `<Sections locale=.../>`
  composition component is acceptable to avoid duplication).

## Work Items (lane: web)

| id | title | depends_on | files_scope |
|----|-------|-----------|-------------|
| WI-1 | Scaffold Astro at `product-website/` (move `index.html` → `reference/`, config + i18n routing, TS, favicon) + extract `tokens.css`/`global.css` (reuse app token names) | — | `product-website/**` |
| WI-2 | `Base.astro` (head/SEO/OG/JSON-LD/hreflang/fonts/skip-link) + `Navigation.astro` (locale-link toggle) + `Footer.astro` | WI-1 | `product-website/src/layouts/**`, `src/components/Navigation.astro`, `Footer.astro` |
| WI-3 | Primitives: `Button`, `Pill`, `SectionHead`, `Icon`, `FormField` | WI-1 | `product-website/src/components/**` |
| WI-4 | `Hero` + `PhoneMockup` + `DispatchBoard` | WI-2, WI-3 | `product-website/src/components/Hero*.astro`, `PhoneMockup.astro`, `DispatchBoard.astro` |
| WI-5 | Data-driven sections (`Card`/Why, `Pillar`+`MiniMockup`/Features, `TinyPhone`/Brand, `Step`/How, `PricingList`, Origin, `FaqItem`, `ContactForm` stub) + `src/data/*.ts` | WI-2, WI-3 | `product-website/src/components/**`, `src/data/**` |
| WI-6 | i18n dictionaries `cs.json`/`en.json` + `MSG` + `t()` helper + parity check; wire all copy; `index.astro` (cs) + `en/index.astro` | WI-4, WI-5 | `product-website/src/i18n/**`, `src/pages/**` |
| WI-7 | Verify: `astro build` + `astro check`, visual diff vs `reference/`, a11y (axe/Lighthouse), responsive + light/dark check | WI-6 | — |

**Topo order:** `WI-1 → WI-2 → WI-3 → {WI-4 || WI-5} → WI-6 → WI-7`.
(A conductor run would translate this table into `.claude/state/pipeline.json`.)

## Acceptance Criteria

1. `cd product-website && npm install && npm run build` succeeds; `astro check` is clean (TS strict,
   0 errors).
2. The build emits static `/` (Czech) and `/en/` (English), each containing **every section** present
   in `reference/index.html`, in the same document order.
3. **No hardcoded user-facing copy** in components or pages — all text flows through `t()` and the
   `cs.json`/`en.json` dictionaries; the **parity check passes** (cs ↔ en key sets identical).
4. The **shared design-token names are reused** (no duplicated/renamed palette); light and dark mode
   and the same breakpoints (900/860/700/480/420) behave as the reference.
5. `<head>` parity: title/description per locale, canonical + `hreflang` pointing at `/` and `/en/`,
   OG tags, `theme-color`, the JSON-LD graph, and `favicon.svg` are all present.
6. Accessibility preserved: skip link, semantic landmarks (`header`/`nav`/`main`/`footer`), visible
   focus rings, ≥ 48px touch targets, every form field labelled; a Lighthouse/axe a11y pass with no
   new violations vs the reference.
7. The contact form reproduces the reference stub behavior (required name+phone, `aria-invalid`,
   localized toast, clipboard copy with fallback, demo `setTimeout` submit) — **no real network call**.
8. `product-website/reference/index.html` is preserved unchanged.

## Verification

```bash
cd product-website
npm install
npm run build          # + npx astro check
npm run preview        # open / (cs) and /en/ (en)
```
Then: visually diff `/` and `/en/` against `reference/index.html` (both themes, mobile + desktop
widths); run Lighthouse (or `pa11y`/axe) for accessibility; confirm the i18n parity check is green.

## Notes / rationale

- **i18n routing over the client toggle.** The reference swaps `innerHTML` client-side via `data-i18n`
  + `localStorage` + a `#en` hash. Astro's built-in i18n routing (static per-locale pages) is the
  idiomatic, SSG- and SEO-correct choice and matches the existing `hreflang`. The client toggle is a
  valid alternative but is **not** recommended; prefer routing.
- **Tokens are reused, not redefined.** The reference already carries the app's token names, so the
  build mirrors them (ideally a shared `tokens.css`) rather than forking the palette — the site stays
  visually coherent with the dispatcher/driver/customer apps and inherits any future token changes.
- **Follow-up (out of scope):** wire `ContactForm` to a real anonymous, rate-limited
  `POST /api/v1/public/leads` (an api-lane assignment), and add a CI build/deploy step for the site.
