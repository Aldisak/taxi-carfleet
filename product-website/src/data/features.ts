// Feature pillars (reference #features). Each pillar has a tag, title, body,
// a 5-item check list, and a bespoke MiniMockup keyed by `visual`. Copy is
// referenced by i18n key; resolved per locale in HomeSections via t(locale, key).

export type MiniMockupType = 'rider' | 'driver' | 'dispatch'

export interface Pillar {
  tagKey: string
  titleKey: string
  bodyKey: string
  itemKeys: string[]
  visual: MiniMockupType
}

export const features: Pillar[] = [
  {
    tagKey: 'p1.tag',
    titleKey: 'p1.title',
    bodyKey: 'p1.body',
    itemKeys: ['p1.l1', 'p1.l2', 'p1.l3', 'p1.l4', 'p1.l5'],
    visual: 'rider',
  },
  {
    tagKey: 'p2.tag',
    titleKey: 'p2.title',
    bodyKey: 'p2.body',
    itemKeys: ['p2.l1', 'p2.l2', 'p2.l3', 'p2.l4', 'p2.l5'],
    visual: 'driver',
  },
  {
    tagKey: 'p3.tag',
    titleKey: 'p3.title',
    bodyKey: 'p3.body',
    itemKeys: ['p3.l1', 'p3.l2', 'p3.l3', 'p3.l4', 'p3.l5'],
    visual: 'dispatch',
  },
]

// Micro-copy shown inside the three MiniMockups. Localizable labels are i18n KEY
// references (resolved per locale in HomeSections and threaded down as props);
// literal fields (driver name, plate, car model, money, numeric captions, the
// "Kolín, nádraží" pickup place, driver timer) stay verbatim in every locale.
export interface MiniMockupCopy {
  rider: {
    /** i18n key — mock.coming. */
    comingKey: string
    /** i18n key — mock.onway. */
    onwayKey: string
    /** Literal driver name (proper noun). */
    name: string
    /** Literal car model brand (proper noun). */
    carModel: string
    /** i18n key — mock.carColour (the colour common noun). */
    carColourKey: string
    /** Literal plate. */
    plate: string
    /** i18n key — mock.pay. */
    payKey: string
    /** Literal price (money stays cs-CZ). */
    price: string
    /** i18n key — mock.call. */
    callKey: string
  }
  driver: {
    /** i18n key — mock.offer. */
    offerKey: string
    /** Literal pickup place (identical in both locales per the borderline rule). */
    pickup: string
    /** i18n key — mock.driverDest (whole-string composite). */
    destKey: string
    /** Literal countdown timer. */
    timer: string
    /** i18n key — mock.fixed. */
    fixedKey: string
    /** Literal price (money stays cs-CZ). */
    price: string
    /** i18n key — mock.accept. */
    acceptKey: string
    /** i18n key — mock.decline. */
    declineKey: string
  }
  dispatch: {
    /** i18n key — mock.week. */
    weekKey: string
    /** i18n key — mock.rides. */
    ridesKey: string
    /** Literal numeric value. */
    ridesValue: string
    /** Literal numeric delta. */
    ridesUp: string
    /** i18n key — mock.revenue. */
    revenueKey: string
    /** Literal numeric value (money stays cs-CZ). */
    revenueValue: string
    /** Literal numeric delta. */
    revenueUp: string
    /** i18n key — mock.assign. */
    assignKey: string
    /** Literal numeric value. */
    assignValue: string
    /** i18n key — mock.fromApp. */
    fromAppKey: string
    /** Literal numeric value. */
    fromAppValue: string
    /** i18n key — mock.byDay. */
    byDayKey: string
  }
}

export const miniMockupCopy: MiniMockupCopy = {
  rider: {
    comingKey: 'mock.coming',
    onwayKey: 'mock.onway',
    name: 'Jan Novák',
    carModel: 'Škoda Octavia',
    carColourKey: 'mock.carColour',
    plate: '5SK 4821',
    payKey: 'mock.pay',
    price: '100 Kč',
    callKey: 'mock.call',
  },
  driver: {
    offerKey: 'mock.offer',
    pickup: 'Kolín, nádraží',
    destKey: 'mock.driverDest',
    timer: '22 s',
    fixedKey: 'mock.fixed',
    price: '100 Kč',
    acceptKey: 'mock.accept',
    declineKey: 'mock.decline',
  },
  dispatch: {
    weekKey: 'mock.week',
    ridesKey: 'mock.rides',
    ridesValue: '184',
    ridesUp: '+12 %',
    revenueKey: 'mock.revenue',
    revenueValue: '31 250 Kč',
    revenueUp: '+9 %',
    assignKey: 'mock.assign',
    assignValue: '1:40',
    fromAppKey: 'mock.fromApp',
    fromAppValue: '61 %',
    byDayKey: 'mock.byDay',
  },
}
