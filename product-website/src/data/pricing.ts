// Pricing section (reference #pricing). Copy is referenced by i18n key; resolved
// per locale in HomeSections via t(locale, key).

export interface PricingData {
  featureKeys: string[]
  termKeys: string[]
  ctaKey: string
}

export const pricing: PricingData = {
  featureKeys: ['price.l1', 'price.l2', 'price.l3', 'price.l4', 'price.l5', 'price.l6'],
  termKeys: ['price.t1', 'price.t2', 'price.t3'],
  ctaKey: 'price.cta',
}
