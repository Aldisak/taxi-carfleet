// Micro-copy for the bespoke Hero mockups (PhoneMockup + DispatchBoard).
// Localizable labels are stored as i18n KEY references (resolved per locale in
// HomeSections via t(locale, key) and threaded down as props through Hero);
// literal fields (fleet/place proper nouns, money "… Kč", driver names) stay
// verbatim in every locale per rules/web-react-style.md#dates-and-money.
//   is a non-breaking space (the reference uses &nbsp; before "Kč").

/** Copy for the interactive phone mockup (PhoneMockup.astro). */
export interface PhoneMockupCopy {
  /** Literal fleet proper noun. */
  fleet: string
  /** i18n key — mock.ride. */
  rideKey: string
  /** i18n key — mock.edit. */
  editKey: string
  /** Literal pickup place proper noun. */
  pickupPlace: string
  /** i18n key — mock.pickup. */
  pickupKey: string
  /** Literal destination place proper noun. */
  destPlace: string
  /** i18n key — mock.dest. */
  destKey: string
  /** Literal price (money stays cs-CZ). */
  price: string
  /** i18n key — mock.note. */
  noteKey: string
  /** i18n key — mock.fixed. */
  fixedKey: string
  /** i18n key — mock.now. */
  nowKey: string
  /** i18n key — mock.pax. */
  paxKey: string
  /** i18n key — mock.noteChip. */
  noteChipKey: string
  /** i18n key — mock.order. */
  orderKey: string
  /** Literal order price (money stays cs-CZ). */
  orderPrice: string
  /** i18n key — mock.eta. */
  etaKey: string
}

/** Copy for the dispatch board mockup (DispatchBoard.astro). */
export interface DispatchBoardCopy {
  /** i18n key — mock.board. */
  boardKey: string
  /** i18n key — mock.live. */
  liveKey: string
  rows: { routeKey: string; badgeKey: string; badgeVariant: 'info' | 'warning' | 'success'; detailKey: string }[]
  /** Driver initials + first names stay literal (proper nouns). */
  drivers: { initials: string; name: string; statusVar: string }[]
}

export const phoneMockup: PhoneMockupCopy = {
  fleet: 'Taxi Kolín',
  rideKey: 'mock.ride',
  editKey: 'mock.edit',
  pickupPlace: 'Kolín, nádraží',
  pickupKey: 'mock.pickup',
  destPlace: 'Masarykovo náměstí 12',
  destKey: 'mock.dest',
  price: '100 Kč',
  noteKey: 'mock.note',
  fixedKey: 'mock.fixed',
  nowKey: 'mock.now',
  paxKey: 'mock.pax',
  noteChipKey: 'mock.noteChip',
  orderKey: 'mock.order',
  orderPrice: '100 Kč',
  etaKey: 'mock.eta',
}

export const dispatchBoard: DispatchBoardCopy = {
  boardKey: 'mock.board',
  liveKey: 'mock.live',
  rows: [
    {
      routeKey: 'mock.row1route',
      badgeKey: 'mock.assigned',
      badgeVariant: 'info',
      detailKey: 'mock.row1detail',
    },
    {
      routeKey: 'mock.row2route',
      badgeKey: 'mock.new',
      badgeVariant: 'warning',
      detailKey: 'mock.row2detail',
    },
    {
      routeKey: 'mock.row3route',
      badgeKey: 'mock.done',
      badgeVariant: 'success',
      detailKey: 'mock.row3detail',
    },
  ],
  drivers: [
    { initials: 'JN', name: 'Jan', statusVar: 'var(--info)' },
    { initials: 'PS', name: 'Petr', statusVar: 'var(--success)' },
    { initials: 'KD', name: 'Karel', statusVar: 'var(--warning)' },
  ],
}
