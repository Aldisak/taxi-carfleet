/**
 * Tenant-accent helpers (customer-app redesign). The fleet's `primaryColorHex` drives every
 * CTA, pin and link. To stay readable on any fleet colour, text/icons placed ON the accent use
 * `onAccent()`, and the accent used AS text on a surface (links) uses `accentText()` (lightened
 * in dark mode). These map to the `--accent` / `--on-accent` / `--accent-text` CSS custom
 * properties applied at the customer surface root, so the kit and map markers pick them up
 * through the cascade with no React re-render.
 */
import type { CSSProperties } from 'react'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** The default fleet accent (matches GlobalStyle's `:root` default). */
export const DEFAULT_ACCENT = '#0E7A4A'

/** Returns the hex if it is a valid `#RRGGBB` string, otherwise the default accent. */
export function normalizeAccent(hex: string | null | undefined): string {
  return hex && HEX_COLOR.test(hex) ? hex : DEFAULT_ACCENT
}

function toRgb(hex: string): [number, number, number] {
  const h = normalizeAccent(hex).slice(1)
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase()
}

/** WCAG relative luminance (0 = black, 1 = white) of an `#RRGGBB` colour. */
export function relativeLuminance(hex: string): number {
  const channel = (v: number): number => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = toRgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/**
 * The readable ink/white to place ON the accent (button labels, pin glyphs).
 * Bright accents (luminance > 0.36) get near-black ink; darker accents get white.
 */
export function onAccent(hex: string): string {
  return relativeLuminance(hex) > 0.36 ? '#141414' : '#FFFFFF'
}

/** Linearly mixes two `#RRGGBB` colours; `weight` is how much of `b` to blend in (0–1). */
export function mixHex(a: string, b: string, weight: number): string {
  const [ar, ag, ab] = toRgb(a)
  const [br, bg, bb] = toRgb(b)
  const w = Math.max(0, Math.min(1, weight))
  return toHex(ar + (br - ar) * w, ag + (bg - ag) * w, ab + (bb - ab) * w)
}

/**
 * The accent used AS text on a surface (links, "Změnit"). On dark surfaces the raw accent is
 * often too dim, so it is lightened toward white by 35%; on light it is used as-is.
 */
export function accentText(hex: string, isDark: boolean): string {
  return isDark ? mixHex(hex, '#FFFFFF', 0.35) : normalizeAccent(hex)
}

/**
 * The three accent CSS custom properties for a fleet colour + current theme mode. Extends
 * `CSSProperties` so it can be passed directly to a React `style` prop (custom-property keys
 * are otherwise rejected by the CSSProperties type).
 */
export interface AccentVars extends CSSProperties {
  '--accent': string
  '--on-accent': string
  '--accent-text': string
}

/**
 * Computes the accent CSS custom properties to apply (as an inline `style`) at the customer
 * surface root. Falls back to the default accent for a null/absent/malformed colour.
 */
export function accentCssVars(hex: string | null | undefined, isDark: boolean): AccentVars {
  const accent = normalizeAccent(hex)
  return {
    '--accent': accent,
    '--on-accent': onAccent(accent),
    '--accent-text': accentText(accent, isDark),
  }
}
