// Brand-band tiny phones (reference #brand .trio). Three colour variants.
// Czech verbatim; WI-6 extracts to i18n. "order"/"orderPrice" mirror mock.order.

export interface TinyPhoneData {
  variant: 'a' | 'b' | 'c'
  fleet: string
  route: string
  price: string
  order: string
  orderPrice: string
}

export const brandPhones: TinyPhoneData[] = [
  {
    variant: 'a',
    fleet: 'Taxi Kolín',
    route: 'Kolín, nádraží → centrum',
    price: '100 Kč',
    order: 'Objednat',
    orderPrice: '100 Kč',
  },
  {
    variant: 'b',
    fleet: 'Taxi Poděbrady',
    route: 'Lázně → nádraží',
    price: '90 Kč',
    order: 'Objednat',
    orderPrice: '90 Kč',
  },
  {
    variant: 'c',
    fleet: 'Taxi Čáslav',
    route: 'Náměstí → nemocnice',
    price: '80 Kč',
    order: 'Objednat',
    orderPrice: '80 Kč',
  },
]
