import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useDriverLogin } from './useDriverLogin'

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.background};
`

const Card = styled.div`
  width: 100%;
  max-width: 400px;
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: ${({ theme }) => theme.shadows.md};
  padding: ${({ theme }) => theme.spacing.xl};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`

const Title = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
  text-align: center;
`

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`

const Label = styled.label`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.text};
`

const Input = styled.input`
  width: 100%;
  height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.surface};
  box-sizing: border-box;

  &:focus {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 1px;
  }
`

const CheckboxRow = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  min-height: ${({ theme }) => theme.touchTargets.min};
`

const SubmitButton = styled.button`
  width: 100%;
  height: ${({ theme }) => theme.touchTargets.primary};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  cursor: pointer;
  margin-top: ${({ theme }) => theme.spacing.sm};

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const ErrorMessage = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  margin: 0;
  text-align: center;
`

/** Driver login page at /d/login. Fleet slug is prefillable from localStorage. */
export function DriverLoginPage() {
  const { t } = useTranslation()
  const {
    fleetSlug, setFleetSlug,
    email, setEmail,
    password, setPassword,
    staySignedIn, setStaySignedIn,
    error,
    isPending,
    handleSubmit,
  } = useDriverLogin()

  return (
    <Wrapper>
      <Card>
        <Title>{t('driver.login.title')}</Title>

        <form onSubmit={handleSubmit} noValidate>
          <FormGroup>
            <Label htmlFor="driver-fleet-slug">{t('driver.login.fleetSlug')}</Label>
            <Input
              id="driver-fleet-slug"
              type="text"
              autoComplete="off"
              placeholder={t('driver.login.fleetSlugPlaceholder')}
              value={fleetSlug}
              onChange={e => setFleetSlug(e.target.value)}
              disabled={isPending}
            />
          </FormGroup>

          <FormGroup style={{ marginTop: '12px' }}>
            <Label htmlFor="driver-email">{t('driver.login.email')}</Label>
            <Input
              id="driver-email"
              type="email"
              autoComplete="email"
              placeholder={t('driver.login.emailPlaceholder')}
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={isPending}
            />
          </FormGroup>

          <FormGroup style={{ marginTop: '12px' }}>
            <Label htmlFor="driver-password">{t('driver.login.password')}</Label>
            <Input
              id="driver-password"
              type="password"
              autoComplete="current-password"
              placeholder=""
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={isPending}
            />
          </FormGroup>

          <CheckboxRow style={{ marginTop: '12px' }}>
            <input
              type="checkbox"
              checked={staySignedIn}
              onChange={e => setStaySignedIn(e.target.checked)}
              disabled={isPending}
            />
            {t('driver.login.staySignedIn')}
          </CheckboxRow>

          {error && <ErrorMessage>{error}</ErrorMessage>}

          <SubmitButton type="submit" disabled={isPending}>
            {isPending ? t('driver.login.loading') : t('driver.login.submit')}
          </SubmitButton>
        </form>
      </Card>
    </Wrapper>
  )
}
