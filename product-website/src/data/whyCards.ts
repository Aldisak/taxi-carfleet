// "Why now" cards (reference #why). Czech verbatim; WI-6 extracts to i18n.
import type { IconName } from '../components/Icon.astro'

export interface WhyCard {
  icon: IconName
  title: string
  body: string
}

export const whyCards: WhyCard[] = [
  {
    icon: 'globe',
    title: 'Bolt a Liftago jsou i ve vašem městě',
    body: 'Od jara 2026 objedná Bolt kdekoli v Česku. Když si zákazník zvykne na aplikaci, telefonní číslo vaší taxislužby si už nevyhledá.',
  },
  {
    icon: 'device',
    title: 'Konkurence ve vedlejším městě aplikaci má',
    body: 'Většinou pronajatou od dodavatele, pod jeho účtem a s jeho vzhledem. Vaše aplikace bude vaše: vaše barva, vaše logo, vaše číslo.',
  },
  {
    icon: 'currency',
    title: 'Provize se nevyplatí',
    body: 'Zprostředkovatel si bere z každé jízdy a určuje cenu. Stálí zákazníci, nádraží, pevné ceny a jízdy na letiště jsou vaše výhoda. Nechte si ji.',
  },
]
