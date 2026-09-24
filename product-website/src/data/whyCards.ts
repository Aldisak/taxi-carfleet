// "Why now" cards (reference #why). Copy is referenced by i18n key; resolved per
// locale in HomeSections via t(locale, key).
import type { IconName } from '../components/Icon.astro'

export interface WhyCard {
  icon: IconName
  titleKey: string
  bodyKey: string
}

export const whyCards: WhyCard[] = [
  { icon: 'globe', titleKey: 'why.c1t', bodyKey: 'why.c1b' },
  { icon: 'device', titleKey: 'why.c2t', bodyKey: 'why.c2b' },
  { icon: 'currency', titleKey: 'why.c3t', bodyKey: 'why.c3b' },
]
