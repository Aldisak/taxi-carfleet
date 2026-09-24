// FAQ items (reference #faq). Native <details>/<summary> disclosure.
// Czech verbatim; WI-6 extracts to i18n.

export interface FaqEntry {
  question: string
  answer: string
}

export const faq: FaqEntry[] = [
  {
    question: 'Proč ne Bolt nebo Liftago?',
    answer:
      'Zprostředkovatel vlastní zákazníka, určuje cenu a bere si provizi. Vaše aplikace vlastní vás: cenu i zákazníka. Jezdit pro ně můžete dál, vedle toho.',
  },
  {
    question: 'Není to v App Storu. Nevadí to?',
    answer:
      'Zákazník otevře odkaz a přidá si ikonu na plochu – dvě ťuknutí. Nečekáte na schválení, aktualizace jsou okamžité a aplikace je pod vaším jménem, ne pod účtem dodavatele.',
  },
  {
    question: 'Potřebuji někoho na dispečinku?',
    answer:
      'Ne nutně. Objednávky z aplikace přicházejí samy a přiřadit auto zvládne majitel z notebooku nebo tabletu. Když dispečink máte, dostane přehlednou obrazovku místo sešitu.',
  },
  {
    question: 'Co když vypadne internet?',
    answer:
      'Zákazník vidí tlačítko Zavolat a vaše číslo. Řidič má jízdu uloženou v telefonu a pokračuje, jakmile se připojí.',
  },
  {
    question: 'Jak dlouho trvá zavedení?',
    answer:
      'Obvykle do týdne od telefonátu. Nastavíme barvu, logo, telefon, pevné trasy a řidiče; vy rozdáte odkaz.',
  },
  {
    question: 'Kde jsou data?',
    answer:
      'Na serverech v EU, každá taxislužba odděleně. Objednávky, zákazníky i reporty si kdykoli stáhnete v CSV.',
  },
  {
    question: 'Můžu odejít?',
    answer: 'Ano, kdykoli. Bez smlouvy na dobu určitou, data si odnesete.',
  },
]
