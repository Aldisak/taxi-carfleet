// Brand-band tiny phones (reference #brand .trio). Three colour variants.
// Localizable copy is stored as i18n KEY references (resolved per locale in
// HomeSections via t(locale, key) and passed down as props); literal fields
// (fleet proper nouns, money "… Kč") stay verbatim in every locale.

export interface TinyPhoneData {
  variant: 'a' | 'b' | 'c'
  /** Literal fleet proper noun. */
  fleet: string
  /** i18n key — route descriptor (common nouns localized, towns kept). */
  routeKey: string
  /** Literal price (money stays cs-CZ). */
  price: string
  /** i18n key — mock.order. */
  orderKey: string
  /** Literal order price (money stays cs-CZ). */
  orderPrice: string
}

export const brandPhones: TinyPhoneData[] = [
  {
    variant: 'a',
    fleet: 'Taxi Kolín',
    routeKey: 'mock.brandRoute1',
    price: '100 Kč',
    orderKey: 'mock.order',
    orderPrice: '100 Kč',
  },
  {
    variant: 'b',
    fleet: 'Taxi Poděbrady',
    routeKey: 'mock.brandRoute2',
    price: '90 Kč',
    orderKey: 'mock.order',
    orderPrice: '90 Kč',
  },
  {
    variant: 'c',
    fleet: 'Taxi Čáslav',
    routeKey: 'mock.brandRoute3',
    price: '80 Kč',
    orderKey: 'mock.order',
    orderPrice: '80 Kč',
  },
]
