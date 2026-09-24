import { useState, useEffect, type FormEvent } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { Panel, Lbl, Ctrl, DeskButton } from '../../shared/ui/desk'
import { Callout } from '../../shared/ui'
import { useAdminLogin } from './useAdminLogin'
import { validateAdminLoginForm, type AdminLoginFormErrors } from './adminLoginForm'

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
  background: var(--ink);
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

/**
 * SuperAdmin login screen (/admin/login — UC-007 A7b). A fleetless login: email + password only,
 * posting to /auth/admin/login. AdminGuard redirects tokenless/non-SuperAdmin users here (never to
 * the fleet-scoped /dispatcher/login, which structurally cannot mint a SuperAdmin token). On success
 * the hook stores tokens and navigates to /admin.
 *
 * E2E contract: `web/e2e/analytics.spec.ts` drives this via `#admin-email` / `#admin-password` and a
 * `button[type="submit"]` — those ids and the submit button MUST be preserved.
 */
export function AdminLoginPage() {
  const { t } = useTranslation()
  const { login, isPending, errorMessageKey } = useAdminLogin()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<AdminLoginFormErrors>({})
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (submitted) {
      setFieldErrors(validateAdminLoginForm({ email, password }))
    }
  }, [email, password, submitted])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    const errors = validateAdminLoginForm({ email, password })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    login({ email, password })
  }

  return (
    <Page>
      <CardWrap>
        <Panel>
          <Head>
            <Dot aria-hidden="true" />
            <Title>{t('admin.login.title')}</Title>
          </Head>
          <Form onSubmit={handleSubmit} noValidate>
            {errorMessageKey && (
              <Callout tone="danger" role="alert">
                {t(errorMessageKey)}
              </Callout>
            )}
            <Field>
              <Lbl htmlFor="admin-email">{t('admin.login.email')}</Lbl>
              <Ctrl
                id="admin-email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder={t('admin.login.emailPlaceholder')}
                autoComplete="email"
                error={fieldErrors.email ? t(fieldErrors.email) : undefined}
              />
            </Field>
            <Field>
              <Lbl htmlFor="admin-password">{t('admin.login.password')}</Lbl>
              <Ctrl
                id="admin-password"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                error={fieldErrors.password ? t(fieldErrors.password) : undefined}
              />
            </Field>
            <DeskButton type="submit" variant="primary" disabled={isPending}>
              {isPending ? t('admin.login.loading') : t('admin.login.submit')}
            </DeskButton>
          </Form>
        </Panel>
      </CardWrap>
    </Page>
  )
}
