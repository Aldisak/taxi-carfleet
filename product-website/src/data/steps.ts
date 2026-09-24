// "How it works" steps (reference #how). CSS counter renders the number. Copy is
// referenced by i18n key; resolved per locale in HomeSections via t(locale, key).

export interface Step {
  titleKey: string
  bodyKey: string
}

export const steps: Step[] = [
  { titleKey: 'how.s1t', bodyKey: 'how.s1b' },
  { titleKey: 'how.s2t', bodyKey: 'how.s2b' },
  { titleKey: 'how.s3t', bodyKey: 'how.s3b' },
]
