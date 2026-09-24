// Feature pillars (reference #features). Each pillar has a tag, title, body,
// a 5-item check list, and a bespoke MiniMockup keyed by `visual`.
// Czech verbatim; WI-6 extracts to i18n.

export type MiniMockupType = 'rider' | 'driver' | 'dispatch'

export interface Pillar {
  tag: string
  title: string
  body: string
  items: string[]
  visual: MiniMockupType
}

export const features: Pillar[] = [
  {
    tag: 'Zákazník',
    title: 'Objednávka na tři ťuknutí',
    body: 'Otevřít, vybrat cíl, objednat. Cena je vidět předem – pevná, nebo odhad. Zákazník sleduje auto na mapě, ví, jaké přijede a kdy, a na konci jízdy ohodnotí řidiče.',
    items: [
      'Přihlášení SMS kódem, žádné heslo',
      'Sledování jízdy i bez přihlášení, přes odkaz',
      'Šest jazyků včetně ukrajinštiny a ruštiny',
      'Funguje i na levném telefonu se slabým signálem',
      'Tlačítko Zavolat na každé obrazovce',
    ],
    visual: 'rider',
  },
  {
    tag: 'Řidič',
    title: 'Řidič vidí jen to, co teď potřebuje',
    body: 'Nabídka jízdy přes celou obrazovku, s cenou a vzdáleností. Jedno velké tlačítko pro každý krok: přijmout, jsem na místě, zahájit, ukončit. Navigace jedním ťuknutím.',
    items: [
      'Pevná cena předvyplněná, změna jen s důvodem',
      'Hotově, kartou, na fakturu',
      'Denní přehled jízd a tržeb',
      'Nic neinstalujete, otevře se jako aplikace',
      'Po výpadku signálu pokračuje tam, kde skončil',
    ],
    visual: 'driver',
  },
  {
    tag: 'Dispečink a majitel',
    title: 'Auta, objednávky a mapa na jedné obrazovce',
    body: 'Dispečer přijme telefonickou objednávku a přiřadí auto během pár vteřin. Objednávky z aplikace přibývají samy. Majitel vidí, jak se dařilo, kdo jezdil a kolik to stálo.',
    items: [
      'Objednávky z telefonu i z aplikace v jednom seznamu',
      'Pevné trasy a zóny: nádraží – centrum 100 Kč nastavíte jednou',
      'Reporty, analytika a export do CSV',
      'Kdo co změnil, je v auditu',
      'Dispečink otevřete v prohlížeči, bez instalace',
    ],
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
