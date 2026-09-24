// Micro-copy for the bespoke Hero mockups (PhoneMockup + DispatchBoard).
// Czech verbatim from reference/index.html (data-i18n `mock.*` keys). WI-6 will
// extract these into the cs.json/en.json dictionaries and swap in t().
//   is a non-breaking space (the reference uses &nbsp; before "Kč").

/** Copy for the interactive phone mockup (PhoneMockup.astro). */
export interface PhoneMockupCopy {
  fleet: string
  ride: string
  edit: string
  pickupPlace: string
  pickup: string
  destPlace: string
  dest: string
  price: string
  note: string
  fixed: string
  now: string
  pax: string
  noteChip: string
  order: string
  orderPrice: string
  eta: string
}

/** Copy for the dispatch board mockup (DispatchBoard.astro). */
export interface DispatchBoardCopy {
  board: string
  live: string
  rows: { route: string; badge: string; badgeVariant: 'info' | 'warning' | 'success'; detail: string }[]
  drivers: { initials: string; name: string; statusVar: string }[]
}

export const phoneMockup: PhoneMockupCopy = {
  fleet: 'Taxi Kolín',
  ride: 'Vaše jízda',
  edit: 'Upravit',
  pickupPlace: 'Kolín, nádraží',
  pickup: 'Vyzvednutí',
  destPlace: 'Masarykovo náměstí 12',
  dest: 'Cíl',
  price: '100 Kč',
  note: 'Cena je konečná. Platíte řidiči na konci jízdy.',
  fixed: 'Pevná cena',
  now: 'Hned',
  pax: '1 cestující',
  noteChip: 'Poznámka',
  order: 'Objednat',
  orderPrice: '100 Kč',
  eta: '12 min · 4,2 km',
}

export const dispatchBoard: DispatchBoardCopy = {
  board: 'Dispečink · dnes',
  live: '3 auta online',
  rows: [
    {
      route: 'Nádraží → Masarykovo nám.',
      badge: 'Přiřazeno',
      badgeVariant: 'info',
      detail: 'Hned · 1 cestující · 100 Kč pevná cena · Jan N.',
    },
    {
      route: 'Kutná Hora → Kolín',
      badge: 'Nová',
      badgeVariant: 'warning',
      detail: 'Na čas 14:30 · 2 cestující · 300 Kč pevná cena',
    },
    {
      route: 'Sídliště → Nemocnice',
      badge: 'Dokončeno',
      badgeVariant: 'success',
      detail: '13:05 · 1 cestující · 110 Kč · hotově',
    },
  ],
  drivers: [
    { initials: 'JN', name: 'Jan', statusVar: 'var(--info)' },
    { initials: 'PS', name: 'Petr', statusVar: 'var(--success)' },
    { initials: 'KD', name: 'Karel', statusVar: 'var(--warning)' },
  ],
}
