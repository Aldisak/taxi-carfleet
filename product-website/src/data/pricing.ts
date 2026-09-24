// Pricing section (reference #pricing). Czech verbatim; WI-6 extracts to i18n.

export interface PricingData {
  features: string[]
  terms: string[]
  cta: string
}

export const pricing: PricingData = {
  features: [
    'Zákaznická, řidičská i dispečerská aplikace',
    'Vaše značka a barvy',
    'Pevné trasy a zóny',
    'Reporty a analytika',
    'Aktualizace a podpora',
    'SMS a mapy za skutečnou cenu, s měsíčním limitem, který si nastavíte',
  ],
  terms: ['První měsíc zdarma', 'Bez smlouvy na dobu určitou', 'Bez poplatku za zavedení'],
  cta: 'Zavolejte nám a řekneme vám cenu pro vaši flotilu',
}
