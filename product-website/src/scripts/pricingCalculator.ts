// Client behaviour for the pricing calculator (PricingCalculator.astro).
//
// Authored as a standalone module (imported by the component's processed
// <script>) so Astro bundles it into an external same-origin /_astro/*.js file.
// That is CSP-safe under the site's strict `script-src 'self'` (an is:inline or
// inline `type=module` script would be refused). Per-locale config is read from
// the `.calc` element's `data-calc-config` attribute (JSON is not executable, so
// it passes CSP) instead of `define:vars`.

type TierCode = 'small' | 'medium' | 'large' | 'custom'

interface CalcConfig {
  locale: 'cs' | 'en'
  tierLabels: Record<TierCode, string>
  saveTemplate: string
  indiv: string
  min: number
  max: number
  licPerDriver: number
  appFee: number
}

const NBSP = String.fromCharCode(0xa0)

const root = document.querySelector<HTMLElement>('.calc')
const raw = root?.dataset.calcConfig

if (raw) {
  const V = JSON.parse(raw) as CalcConfig
  const TIERS: { code: TierCode; max: number; price: number | null }[] = [
    { code: 'small', max: 3, price: 1490 },
    { code: 'medium', max: 6, price: 2490 },
    { code: 'large', max: 10, price: 3490 },
    { code: 'custom', max: 99, price: null },
  ]
  const LIC = V.licPerDriver
  const APPFEE = V.appFee

  // Non-breaking-space (U+00A0) thousands + Kč, matching the SSR kc() in HomeSections.
  const kc = (n: number): string => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)}${NBSP}Kč`
  // Locale-specific car count (Czech auto/auta/aut vs English car/cars).
  const cars = (n: number): string =>
    V.locale === 'cs'
      ? `${n} ${n === 1 ? 'auto' : n < 5 ? 'auta' : 'aut'}`
      : `${n}${n === 1 ? ' car' : ' cars'}`
  const saving = (amount: string): string => V.saveTemplate.replace('{x}', amount)

  const range = document.getElementById('calc-cars') as HTMLInputElement | null
  const out = document.getElementById('calc-cars-out')

  const setText = (id: string, text: string): void => {
    const el = document.getElementById(id)
    if (el) el.textContent = text
  }
  const setHidden = (id: string, hidden: boolean): void => {
    const el = document.getElementById(id)
    if (el) el.hidden = hidden
  }

  if (range && out) {
    const calc = (): void => {
      const n = parseInt(range.value, 10)
      const t = TIERS.filter((x) => n <= x.max)[0]
      out.textContent = cars(n)
      range.setAttribute('aria-valuetext', cars(n))
      setText('calc-tier', V.tierLabels[t.code])
      const custom = t.price === null
      const cmp = LIC * n + APPFEE
      setText('calc-price', custom ? V.indiv : kc(t.price as number))
      setHidden('calc-per', custom)
      setHidden('calc-custom', !custom)
      setHidden('calc-cmp', custom)
      if (!custom) {
        setText('calc-cmp-price', kc(cmp))
        setText('calc-saving', saving(kc(cmp - (t.price as number)).replace(`${NBSP}Kč`, '')))
      }
      document
        .querySelectorAll<HTMLElement>('.tier')
        .forEach((el) => el.classList.toggle('is-active', el.getAttribute('data-tier') === t.code))
    }

    range.addEventListener('input', calc)
    document.getElementById('calc-minus')?.addEventListener('click', () => {
      range.value = String(Math.max(V.min, parseInt(range.value, 10) - 1))
      calc()
    })
    document.getElementById('calc-plus')?.addEventListener('click', () => {
      range.value = String(Math.min(V.max, parseInt(range.value, 10) + 1))
      calc()
    })
    calc()
  }
}

export {}
