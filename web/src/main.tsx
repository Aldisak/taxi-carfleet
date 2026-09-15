import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Providers } from './app/providers'
import { reportWebVitals } from './shared/perf/reportWebVitals'
import { applyInitialLanguage } from './shared/i18n/applyInitialLanguage'

// Detect + apply the UI language before the first render (AC#3/#5). Startup-only;
// unit tests keep the static cs-CZ baseline from index.ts (this is never called there).
applyInitialLanguage()

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <Providers />
  </StrictMode>,
)

reportWebVitals()
