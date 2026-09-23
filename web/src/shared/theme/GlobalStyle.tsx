import { createGlobalStyle } from 'styled-components'

/**
 * Global design-system foundation (customer-app redesign, 2026-09-23).
 *
 * This is strictly ADDITIVE to the styled-components `theme` object: it only
 * - registers the Manrope brand typeface (self-hosted woff2, `font-display: swap`),
 * - declares the semantic CSS custom properties from the design handoff (light on
 *   `:root`, dark under `:root[data-theme="dark"]`), including a default tenant accent,
 * - applies a minimal, low-blast-radius reset (box-sizing, `body{margin:0}` + brand font),
 * - honours `prefers-reduced-motion` globally, and adds a visible `:focus-visible` ring.
 *
 * The new `shared/ui` kit and the customer screens read these CSS vars (`var(--accent)`,
 * `var(--surface)`, `var(--r-md)`, …); the tenant accent and dark mode become a root-var /
 * `[data-theme]` flip with no React re-render. Legacy driver/dispatcher code keeps reading
 * the theme object and is unaffected — nothing here consumes the old tokens, and the
 * warm-grey "ground" (bg/ink) is applied at the customer surface roots, not globally, so
 * the other apps render unchanged. Only the brand font is a deliberate app-wide upgrade
 * (Inter was declared but never loaded, so today every app is on system fonts).
 */
/**
 * The raw global CSS as a plain string (exported for a robust token-contract test —
 * jsdom's CSSOM does not reliably round-trip custom properties, so the test asserts on
 * this source string rather than introspecting injected rules).
 */
export const globalCss = `
  @font-face {
    font-family: 'Manrope';
    font-style: normal;
    font-weight: 500;
    font-display: swap;
    src: url('/fonts/manrope-500.woff2') format('woff2');
  }
  @font-face {
    font-family: 'Manrope';
    font-style: normal;
    font-weight: 700;
    font-display: swap;
    src: url('/fonts/manrope-700.woff2') format('woff2');
  }
  @font-face {
    font-family: 'Manrope';
    font-style: normal;
    font-weight: 800;
    font-display: swap;
    src: url('/fonts/manrope-800.woff2') format('woff2');
  }

  :root {
    --font: 'Manrope', 'Segoe UI', system-ui, -apple-system, sans-serif;

    /* Ground + surfaces */
    --bg: #F3F3F1;
    --surface: #FFFFFF;
    --surface-2: #EFEFEC;
    --surface-3: #E6E6E2;

    /* Ink */
    --ink: #141414;
    --ink-2: #5E5E5A;
    --ink-3: #767672;

    /* Lines */
    --line: #E6E6E2;
    --line-strong: #CFCFCA;

    /* Semantic */
    --success: #0E7A4A; --success-bg: #E4F3EB;
    --warning: #8A5300; --warning-bg: #FFF4D6;
    --danger:  #C8362A; --danger-bg:  #FDECEA;
    --info:    #1E5EDC; --info-bg:    #E7EEFC;

    --scrim: rgba(20, 20, 20, .45);

    /* Tenant accent (default fleet colour; overridden per-fleet at the customer root). */
    --accent: #0E7A4A;
    --on-accent: #FFFFFF;
    --accent-text: #0E7A4A;

    /* Elevation */
    --shadow-card: 0 1px 2px rgba(20,20,20,.06), 0 4px 12px rgba(20,20,20,.06);
    --shadow-sheet: 0 -6px 28px rgba(20,20,20,.14);
    --shadow-float: 0 6px 20px rgba(20,20,20,.16);

    /* Radii */
    --r-sm: 8px;
    --r-md: 14px;
    --r-lg: 22px;
    --r-pill: 999px;

    /* Type ramp (sizes) */
    --fs-display: 34px;
    --fs-title: 24px;
    --fs-headline: 20px;
    --fs-body-lg: 17px;
    --fs-body: 15px;
    --fs-label: 13px;
    --fs-caption: 12px;

    /* Type ramp (weights — only 500/700/800 are self-hosted) */
    --fw-regular: 500;
    --fw-bold: 700;
    --fw-extra: 800;

    /* Motion */
    --ease-sheet: cubic-bezier(.2, .8, .2, 1);
    --dur-sheet: 320ms;
    --dur-press: 120ms;
  }

  :root[data-theme='dark'] {
    --bg: #0E0E0E;
    --surface: #1A1A1A;
    --surface-2: #262624;
    --surface-3: #30302E;

    --ink: #F4F4F1;
    --ink-2: #A6A6A0;
    --ink-3: #8A8A85;

    --line: #2C2C2A;
    --line-strong: #3E3E3B;

    --success: #3DBB78; --success-bg: #12301F;
    --warning: #F0B33C; --warning-bg: #3A2C0E;
    --danger:  #F0625A; --danger-bg:  #3B1917;
    --info:    #6E9BFF; --info-bg:    #172444;

    --scrim: rgba(0, 0, 0, .6);

    --shadow-card: 0 1px 2px rgba(0,0,0,.4), 0 4px 14px rgba(0,0,0,.35);
    --shadow-sheet: 0 -6px 28px rgba(0,0,0,.5);
    --shadow-float: 0 6px 20px rgba(0,0,0,.5);
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: var(--font);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  :focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: .001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .001ms !important;
      scroll-behavior: auto !important;
    }
  }
`

/** The global design-system stylesheet as a mountable styled-components component. */
export const GlobalStyle = createGlobalStyle`${globalCss}`
