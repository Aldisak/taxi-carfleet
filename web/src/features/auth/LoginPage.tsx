import { useState, useEffect, type FormEvent } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { Panel, Lbl, Ctrl, DeskButton } from '../../shared/ui/desk'
import { Callout } from '../../shared/ui'
import { useLogin } from './useLogin'
import { validateLoginForm } from './loginSchema'
import { authStorage } from '../../shared/api/auth-storage'
import { parseSubdomainSlug } from './loginSchema'

const Page = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg);
`

const CardWrap = styled.div`
  width: 100%;
  max-width: 420px;
`

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 16px 0;
`

const Dot = styled.span`
  width: 12px;
  height: 12px;
  border-radius: var(--r-pill);
  background: var(--accent);
  flex-shrink: 0;
`

const Title = styled.h1`
  margin: 0;
  font-size: var(--fs-headline);
  font-weight: var(--fw-extra);
  color: var(--ink);
`

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
`

const Hint = styled.p`
  margin: 0;
  font-size: var(--fs-caption);
  color: var(--ink-3);
`

/**
 * Dispatcher (fleet-scoped) login screen (/dispatcher/login). Three fields — Kód flotily / E-mail /
 * Heslo — post to /auth/staff/login. Restyled onto the desk kit (dispatcher redesign §5).
 *
 * E2E contract: `web/e2e/dispatcher.spec.ts` fills `#fleetSlug` / `#email` / `#password` and clicks
 * the submit button — those input ids and the submit button MUST be preserved.
 */
export function LoginPage() {
  const { t } = useTranslation()
  const { login, isPending, errorMessageKey } = useLogin()

  // Prefill slug from subdomain or remembered value
  const detectedSlug = parseSubdomainSlug(window.location.host)
  const rememberedSlug = authStorage.getFleetSlug() ?? ''
  const initialSlug = detectedSlug ?? rememberedSlug

  const [fleetSlug, setFleetSlug] = useState(initialSlug)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{
    fleetSlug?: string
    email?: string
    password?: string
  }>({})
  const [submitted, setSubmitted] = useState(false)

  // Re-run validation on change after first submit
  useEffect(() => {
    if (submitted) {
      const errors = validateLoginForm({ fleetSlug, email, password })
      setFieldErrors(errors)
    }
  }, [fleetSlug, email, password, submitted])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    const errors = validateLoginForm({ fleetSlug, email, password })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    login({ fleetSlug, email, password })
  }

  return (
    <Page>
      <CardWrap>
        <Panel>
          <Head>
            <Dot aria-hidden="true" />
            <Title>{t('login.brandTitle')}</Title>
          </Head>
          <Form onSubmit={handleSubmit} noValidate>
            {errorMessageKey && (
              <Callout tone="danger" role="alert">
                {t(errorMessageKey)}
              </Callout>
            )}
            <Field>
              <Lbl htmlFor="fleetSlug">{t('login.fleetSlug')}</Lbl>
              <Ctrl
                id="fleetSlug"
                type="text"
                value={fleetSlug}
                onChange={setFleetSlug}
                placeholder={t('login.fleetSlugPlaceholder')}
                autoComplete="organization"
                error={fieldErrors.fleetSlug ? t(fieldErrors.fleetSlug) : undefined}
              />
            </Field>
            <Field>
              <Lbl htmlFor="email">{t('login.email')}</Lbl>
              <Ctrl
                id="email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder={t('login.emailPlaceholder')}
                autoComplete="email"
                error={fieldErrors.email ? t(fieldErrors.email) : undefined}
              />
            </Field>
            <Field>
              <Lbl htmlFor="password">{t('login.password')}</Lbl>
              <Ctrl
                id="password"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                error={fieldErrors.password ? t(fieldErrors.password) : undefined}
              />
            </Field>
            <DeskButton type="submit" variant="primary" disabled={isPending}>
              {isPending ? t('login.loading') : t('login.submit')}
            </DeskButton>
            <Hint>{t('login.passwordHint')}</Hint>
          </Form>
        </Panel>
      </CardWrap>
    </Page>
  )
}
