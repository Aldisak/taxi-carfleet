import { useEffect, useState, type FormEvent } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useCustomerLogin, type UseCustomerLoginOptions } from './useCustomerLogin'
import { PhoneInput } from './PhoneInput'
import { CodeInput } from './CodeInput'
import { secondsUntilResend, canResend } from './resendTimer'

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`

const PrimaryButton = styled.button`
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.primary};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const LinkButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.primary};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  min-height: ${({ theme }) => theme.touchTargets.min};
  cursor: pointer;
  text-decoration: underline;

  &:disabled {
    color: ${({ theme }) => theme.colors.textSecondary};
    cursor: not-allowed;
    text-decoration: none;
  }
`

const Message = styled.p<{ $error?: boolean }>`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme, $error }) => ($error ? theme.colors.error : theme.colors.textSecondary)};
`

/**
 * Embeddable customer phone/code login. Drives the resend cooldown via a 1 s tick,
 * auto-submits the 6-digit code, and renders plain-Czech errors. Pass onAuthenticated
 * to resume an inline order flow; /customer/login standalone passes navigate('/customer').
 */
export function CustomerLoginStep(props: UseCustomerLoginOptions) {
  const { t } = useTranslation()
  const login = useCustomerLogin(props)
  const [now, setNow] = useState(() => Date.now())

  // Tick once per second only while a cooldown is active, so the countdown label updates.
  useEffect(() => {
    if (login.step !== 'code' || login.lastSentAtMs === null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [login.step, login.lastSentAtMs])

  const remaining = secondsUntilResend(login.lastSentAtMs, now)
  const resendEnabled = canResend(login.lastSentAtMs, now) && !login.isPending

  function handlePhoneSubmit(e: FormEvent) {
    e.preventDefault()
    void login.sendCode()
  }

  if (login.step === 'phone') {
    return (
      <Form onSubmit={handlePhoneSubmit} noValidate>
        <PhoneInput value={login.phone} onChange={login.setPhone} disabled={login.isPending} />
        {login.error && <Message $error role="alert">{t(login.error)}</Message>}
        <PrimaryButton type="submit" disabled={login.isPending}>
          {login.isPending ? t('customer.login.sending') : t('customer.login.sendCode')}
        </PrimaryButton>
      </Form>
    )
  }

  return (
    <Form onSubmit={e => e.preventDefault()} noValidate>
      <CodeInput
        value={login.code}
        onChange={login.setCode}
        onComplete={login.submitCode}
        disabled={login.isPending}
      />
      {login.error && <Message $error role="alert">{t(login.error)}</Message>}
      {login.notice && <Message role="status">{t(login.notice)}</Message>}
      <LinkButton type="button" onClick={() => void login.resend()} disabled={!resendEnabled}>
        {resendEnabled
          ? t('customer.login.resend')
          : t('customer.login.resendIn', { seconds: remaining })}
      </LinkButton>
      <LinkButton type="button" onClick={login.changePhone} disabled={login.isPending}>
        {t('customer.login.changePhone')}
      </LinkButton>
    </Form>
  )
}
