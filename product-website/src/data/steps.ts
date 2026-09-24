// "How it works" steps (reference #how). CSS counter renders the number.
// Czech verbatim; WI-6 extracts to i18n.

export interface Step {
  title: string
  body: string
}

export const steps: Step[] = [
  {
    title: 'Zavoláte nám.',
    body: 'Projdeme, jak dnes jezdíte: kolik aut, jaké ceny, kde.',
  },
  {
    title: 'Nastavíme vaši flotilu.',
    body: 'Barva, logo, telefon, pevné trasy, řidiči. Obvykle do týdne.',
  },
  {
    title: 'Zákazníci objednávají sami.',
    body: 'Odkaz dáte na web, na vizitky, do SMS. Telefon vám zůstává – jen zvoní méně.',
  },
]
