// Origin section fixed-route mockup (reference #origin .origin-map).
//   is a non-breaking space (reference uses &nbsp; before "Kč").
// Czech verbatim; WI-6 extracts to i18n.

export interface OriginRoute {
  from: string
  price: string
}

export const originRoutes: OriginRoute[] = [
  { from: 'Nádraží → centrum', price: '100 Kč' },
  { from: 'Kdekoli po Kutné Hoře', price: '110 Kč' },
  { from: 'Kutná Hora → Kolín', price: '300 Kč' },
]
