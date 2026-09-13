# Demo & manual verification

## Lighthouse accessibility (manual, per UC)

The Definition of Done requires Lighthouse accessibility ≥ 90 on every client. Axe assertions
in the component tests cover jsdom-computable rules; contrast and full-layout a11y are verified
manually with Lighthouse (jsdom cannot compute contrast — see `rules/web-accessibility.md`).

Run against a production build:

```bash
cd web && npm run build && npm run preview   # serves dist on http://localhost:4173
npx lighthouse http://localhost:4173/x            --only-categories=accessibility --quiet
npx lighthouse "http://localhost:4173/c?fleet=demo" --only-categories=accessibility --quiet
```

### UC-007 screens to check

- **`/admin` (SuperAdmin fleets)** — the create-fleet form + fleet list. One-time-password
  panel uses `role="status"`/`aria-live`; every field has a `<label>`; errors use `role="alert"`.
- **`/x/settings` → Fleet tab** — the self-service form (name, phone, color, logo, welcome,
  offer timeout, SMS cap, disabled auto-dispatch toggle). Color input has an `aria-label`; the
  disabled toggle is `aria-disabled`.
- **`/c?fleet={slug}` (customer runtime branding)** — second-fleet name + color + welcome +
  logo render from `GET /public/fleet` with no rebuild; the gdpr footer link is present.

| Screen | Lighthouse a11y | Date | Notes |
|--------|-----------------|------|-------|
| `/admin` | _pending manual run_ | | SuperAdmin fleets |
| `/x/settings` (Fleet tab) | _pending manual run_ | | self-service form |
| `/c?fleet=…` (customer branding) | _pending manual run_ | | runtime branding |

Record the scores above after running Lighthouse; all must be ≥ 90.
