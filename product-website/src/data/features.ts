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

// Micro-copy shown inside the three MiniMockups (reference `mock.*` keys).
export interface MiniMockupCopy {
  rider: {
    coming: string
    onway: string
    name: string
    car: string
    plate: string
    pay: string
    price: string
    call: string
  }
  driver: {
    offer: string
    pickup: string
    dest: string
    timer: string
    fixed: string
    price: string
    accept: string
    decline: string
  }
  dispatch: {
    week: string
    rides: string
    ridesValue: string
    ridesUp: string
    revenue: string
    revenueValue: string
    revenueUp: string
    assign: string
    assignValue: string
    fromApp: string
    fromAppValue: string
    byDay: string
  }
}

export const miniMockupCopy: MiniMockupCopy = {
  rider: {
    coming: 'Řidič přijede za ~4 min',
    onway: 'Na cestě',
    name: 'Jan Novák',
    car: 'Škoda Octavia · bílá',
    plate: '5SK 4821',
    pay: 'Platíte řidiči na konci jízdy.',
    price: '100 Kč',
    call: 'Zavolat',
  },
  driver: {
    offer: 'Nová jízda',
    pickup: 'Kolín, nádraží',
    dest: '→ Masarykovo náměstí 12 · 1,8 km',
    timer: '22 s',
    fixed: 'Pevná cena',
    price: '100 Kč',
    accept: 'Přijmout',
    decline: 'Odmítnout',
  },
  dispatch: {
    week: 'Reporty · tento týden',
    rides: 'Jízdy',
    ridesValue: '184',
    ridesUp: '+12 %',
    revenue: 'Tržby',
    revenueValue: '31 250 Kč',
    revenueUp: '+9 %',
    assign: 'Čas do přiřazení',
    assignValue: '1:40',
    fromApp: 'Z aplikace',
    fromAppValue: '61 %',
    byDay: 'Jízdy po dnech',
  },
}
