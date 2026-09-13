import { useState, useEffect, type FormEvent } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useAdminLogin } from './useAdminLogin'
import { validateAdminLoginForm, type AdminLoginFormErrors } from './adminLoginForm'

const Page = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.colors.background};
`

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: ${({ theme }) => theme.shadows.md};
  padding: ${({ theme }) => theme.spacing.xl};
  width: 100%;
  max-width: 400px;
`

const Title = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 ${({ theme }) => theme.spacing.lg} 0;
  text-align: center;
`

const FormGroup = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
`

const Label = styled.label`
  display: block;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`

const Input = styled.input<{ $hasError?: boolean }>`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme, $hasError }) => ($hasError ? theme.colors.error : theme.colors.border)};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.surface};
  box-sizing: border-box;
  outline: none;

  &:focus {
    border-color: ${({ theme }) => theme.colors.primary};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.primary}33;
  }
`

const FieldError = styled.span`
  display: block;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.error};
  margin-top: ${({ theme }) => theme.spacing.xs};
`

const GlobalError = styled.div`
  background: #fce8e6;
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`

const SubmitButton = styled.button`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  cursor: pointer;
  margin-top: ${({ theme }) => theme.spacing.sm};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primaryDark};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

/**
 * SuperAdmin login screen (/admin/login — UC-007 A7b). A fleetless login: email + password only,
 * posting to /auth/admin/login. AdminGuard redirects tokenless/non-SuperAdmin users here (never to
 * the fleet-scoped /x/login, which structurally cannot mint a SuperAdmin token). On success the
 * hook stores tokens and navigates to /admin.
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
      <Card>
        <Title>{t('admin.login.title')}</Title>
        <form onSubmit={handleSubmit} noValidate>
          {errorMessageKey && <GlobalError role="alert">{t(errorMessageKey)}</GlobalError>}
          <FormGroup>
            <Label htmlFor="admin-email">{t('admin.login.email')}</Label>
            <Input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('admin.login.emailPlaceholder')}
              $hasError={!!fieldErrors.email}
              autoComplete="email"
            />
            {fieldErrors.email && <FieldError>{t(fieldErrors.email)}</FieldError>}
          </FormGroup>
          <FormGroup>
            <Label htmlFor="admin-password">{t('admin.login.password')}</Label>
            <Input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              $hasError={!!fieldErrors.password}
              autoComplete="current-password"
            />
            {fieldErrors.password && <FieldError>{t(fieldErrors.password)}</FieldError>}
          </FormGroup>
          <SubmitButton type="submit" disabled={isPending}>
            {isPending ? t('admin.login.loading') : t('admin.login.submit')}
          </SubmitButton>
        </form>
      </Card>
    </Page>
  )
}
