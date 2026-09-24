// Pricing section (reference #pricing). Typed model for the redesigned pricing
// block: four tier cards, the interactive calculator constants, the "in every
// plan" checklist + terms. Copy is referenced by i18n key and resolved per
// locale in HomeSections via t(locale, key); money ("… Kč") and numeric
// constants stay literal in every locale per rules/web-react-style.md#dates-and-money.

export type TierCode = 'small' | 'medium' | 'large' | 'custom'

export interface PricingTier {
  /** Stable tier code — matches the calculator's TIERS + the data-tier attribute. */
  code: TierCode
  /** Upper car-count bound (inclusive) for this tier; the calculator picks the first tier with n <= max. */
  max: number
  /** Monthly price in whole CZK, or null for the custom (individually-quoted) tier. */
  price: number | null
  /** Pill label i18n key (cars descriptor for small/large/custom, "popular" for medium). */
  pillKey: string
  /** Tier title i18n key. */
  titleKey: string
  /** Rendered price string (literal money, "… Kč") — null tiers render customPriceKey instead. */
  priceText: string | null
  /** For the custom tier: the i18n key that replaces the money string ("individuálně"/"individually"). */
  customPriceKey?: string
  /** Caption i18n key list — joined with " · " when more than one. */
  captionKeys: string[]
  /** Per-tier CTA i18n key. */
  ctaKey: string
  /** Whether this tier is visually highlighted (primary CTA + strong border). */
  highlighted: boolean
}

/** Non-breaking space + Kč formatter for whole-CZK integers (mirror of the reference kc()). */
function kc(n: number): string {
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} Kč`
}

export const pricingTiers: PricingTier[] = [
  {
    code: 'small',
    max: 3,
    price: 1490,
    pillKey: 'tier.smallCars',
    titleKey: 'tier.small',
    priceText: kc(1490),
    captionKeys: ['tier.perMonth'],
    ctaKey: 'tier.cta',
    highlighted: false,
  },
  {
    code: 'medium',
    max: 6,
    price: 2490,
    pillKey: 'tier.popular',
    titleKey: 'tier.medium',
    priceText: kc(2490),
    captionKeys: ['tier.mediumCars', 'tier.perMonth2'],
    ctaKey: 'tier.cta2',
    highlighted: true,
  },
  {
    code: 'large',
    max: 10,
    price: 3490,
    pillKey: 'tier.largeCars',
    titleKey: 'tier.large',
    priceText: kc(3490),
    captionKeys: ['tier.perMonth3', 'tier.largeExtra'],
    ctaKey: 'tier.cta3',
    highlighted: false,
  },
  {
    code: 'custom',
    max: 99,
    price: null,
    pillKey: 'tier.customCars',
    titleKey: 'tier.custom',
    priceText: null,
    customPriceKey: 'tier.customPrice',
    captionKeys: ['tier.customNote'],
    ctaKey: 'tier.cta4',
    highlighted: false,
  },
]

/** Calculator constants (reference: LIC per driver + APPFEE for the customer app). */
export interface CalculatorConstants {
  min: number
  max: number
  step: number
  initial: number
  licPerDriver: number
  appFee: number
}

export const calculatorConstants: CalculatorConstants = {
  min: 1,
  max: 15,
  step: 1,
  initial: 3,
  licPerDriver: 599,
  appFee: 1500,
}

/** "In every plan" checklist i18n keys (reference price.l1…l6). */
export const includedFeatureKeys: string[] = [
  'price.l1',
  'price.l2',
  'price.l3',
  'price.l4',
  'price.l5',
  'price.l6',
]

/** Term-pill i18n keys (reference price.t1…t3). */
export const termKeys: string[] = ['price.t1', 'price.t2', 'price.t3']
