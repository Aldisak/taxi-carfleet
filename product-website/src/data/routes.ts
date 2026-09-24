// Origin section fixed-route mockup (reference #origin .origin-map).
//   is a non-breaking space (reference uses &nbsp; before "Kč").
// Localizable route descriptors are stored as i18n KEY references (resolved per
// locale in HomeSections via t(locale, key) and passed down as props); the
// town→town row keeps a literal string (both towns are proper nouns → cs == en,
// so no key). Prices stay literal money ("… Kč") in every locale.

export interface OriginRouteData {
  /** i18n key for the route descriptor, when common nouns need localizing. */
  fromKey?: string
  /** Literal route descriptor, when the whole string is proper nouns (cs == en). */
  from?: string
  /** Literal price (money stays cs-CZ). */
  price: string
}

/** A route row after HomeSections resolves keys to strings. */
export interface OriginRoute {
  from: string
  price: string
}

export const originRoutes: OriginRouteData[] = [
  { fromKey: 'origin.route1', price: '100 Kč' },
  { fromKey: 'origin.anywhereKH', price: '110 Kč' },
  { from: 'Kutná Hora → Kolín', price: '300 Kč' },
]
