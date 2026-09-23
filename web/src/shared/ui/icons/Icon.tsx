import { type SVGProps } from 'react'

/**
 * The inline stroke-SVG icon set for the redesigned customer app (handoff §2).
 * One 24×24 viewBox, 2px stroke, `currentColor` — colour and size come from CSS
 * (`color`, `width`/`height`), so icons inherit ink/accent and dark mode for free.
 * No unicode glyphs, no emoji anywhere in the UI.
 */
export type IconName =
  | 'search'
  | 'locate'
  | 'phone'
  | 'menu'
  | 'back'
  | 'close'
  | 'clock'
  | 'person'
  | 'note'
  | 'chevron'
  | 'star'
  | 'car'
  | 'check'
  | 'bell'
  | 'wifi-off'
  | 'map'
  | 'history'
  | 'train'
  | 'hospital'
  | 'pin'
  | 'globe'
  | 'shield'
  | 'logout'
  | 'plus'
  | 'minus'
  | 'calendar'

/** SVG inner markup per glyph (paths only — the <svg> wrapper is shared). */
const PATHS: Record<IconName, JSX.Element> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  locate: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  phone: (
    <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L19 17l2 3v0a2 2 0 0 1-2 2 16 16 0 0 1-15-15 2 2 0 0 1 1-2z" />
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  back: <path d="M15 5l-7 7 7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  note: (
    <>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 9h6M9 13h6M9 17h3" />
    </>
  ),
  chevron: <path d="M9 6l6 6-6 6" />,
  star: (
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.8 6.6 20l1-6.1L3.2 9.5l6.1-.9z" />
  ),
  car: (
    <>
      <path d="M4 16l1.5-5A3 3 0 0 1 8.4 9h7.2a3 3 0 0 1 2.9 2L20 16" />
      <path d="M3 16h18v3h-2v-1H5v1H3z" />
      <circle cx="7.5" cy="16.5" r="1.2" />
      <circle cx="16.5" cy="16.5" r="1.2" />
    </>
  ),
  check: <path d="M5 12l4 4 10-10" />,
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  'wifi-off': (
    <>
      <path d="M3 3l18 18" />
      <path d="M9 17a4 4 0 0 1 6 0" />
      <path d="M5.5 12.5a10 10 0 0 1 4-2.6M2.5 9.5a14 14 0 0 1 5-3.2M21.5 9.5a14 14 0 0 0-6.7-3.6" />
    </>
  ),
  map: (
    <>
      <path d="M9 4L4 6v14l5-2 6 2 5-2V4l-5 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  history: (
    <>
      <path d="M4 12a8 8 0 1 1 2.3 5.6" />
      <path d="M4 12v-4M4 12h4" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  train: (
    <>
      <rect x="6" y="4" width="12" height="12" rx="2" />
      <path d="M6 10h12" />
      <path d="M8 20l-1.5 1.5M16 20l1.5 1.5" />
      <circle cx="9" cy="13" r="0.6" />
      <circle cx="15" cy="13" r="0.6" />
    </>
  ),
  hospital: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.5 2.5 2.5 13 0 16M12 4c-2.5 2.5-2.5 13 0 16" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" />
      <path d="M18 15l3-3-3-3M21 12H9" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </>
  ),
}

/** Props for the shared icon. `title` makes it a labelled graphic; omit it for decorative use. */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  /** Which glyph to render. */
  name: IconName
  /** Pixel size for width and height (default 24). */
  size?: number
  /** Accessible name. When set, the icon is `role="img"`; when omitted it is `aria-hidden`. */
  title?: string
}

/** Renders one glyph from the design icon set (2px stroke, currentColor). */
export function Icon({ name, size = 24, title, ...rest }: IconProps): JSX.Element {
  const labelled = title !== undefined
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      {...rest}
    >
      {labelled && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  )
}
