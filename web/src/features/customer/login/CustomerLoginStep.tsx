import { useEffect, useState, type FormEvent } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { Button, Callout, CodeInput, Field, Icon } from '../../../shared/ui'
import { useCustomerLogin, type UseCustomerLoginOptions } from './useCustomerLogin'
import { secondsUntilResend, canResend } from './resendTimer'

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const Caption = styled.p`
  margin: 0;
  font-size: var(--fs-caption);
  font-weight: var(--fw-regular);
  color: var(--ink-2);
`

const Notice = styled.p`
  margin: 0;
  font-size: var(--fs-caption);
  font-weight: var(--fw-regular);
  color: var(--ink-2);
`

const GhostRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

/**
 * Embeddable customer phone/code login, restyled onto the shared UI kit (UC-020 WI-3).
 * Drives the resend cooldown via a 1 s tick, auto-submits the 6-digit code (kit CodeInput
 * onComplete) with a manual fallback button, and renders plain-Czech errors. Pass
 * onAuthenticated to resume an inline order flow; /customer/login standalone passes
 * navigate('/customer'). Behaviour and contracts are unchanged — this is a presentational pass.
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

  function handleCodeSubmit(e: FormEvent) {
    e.preventDefault()
    void login.submitCode(login.code)
  }

  if (login.step === 'phone') {
    return (
      <Form onSubmit={handlePhoneSubmit} noValidate>
        <Field
          id="customer-phone"
          label={t('customer.login.phoneLabel')}
          value={login.phone}
          onChange={login.setPhone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={t('customer.login.phonePlaceholder')}
          prefix="+420"
          leadingIcon={<Icon name="phone" size={20} />}
          disabled={login.isPending}
          error={login.error ? t(login.error) : undefined}
        />
        <Caption>{t('customer.login.privacyCaption')}</Caption>
        <Button
          type="submit"
          fullWidth
          loading={login.isPending}
          loadingLabel={t('customer.login.sending')}
        >
          {t('customer.login.sendCode')}
        </Button>
      </Form>
    )
  }

  return (
    <Form onSubmit={handleCodeSubmit} noValidate>
      <CodeInput
        value={login.code}
        onChange={login.setCode}
        onComplete={login.submitCode}
        ariaLabel={t('customer.login.codeLabel')}
        disabled={login.isPending}
        // Focusing the first OTP box when the code step appears is the expected SMS-code UX
        // (the user just asked for a code); matches the prior programmatic-focus behaviour.
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
      />
      <Caption>{t('customer.login.codeHint')}</Caption>
      {login.error && (
        <Callout tone="danger" role="alert">
          {t(login.error)}
        </Callout>
      )}
      {login.notice && <Notice role="status">{t(login.notice)}</Notice>}
      <Button
        type="submit"
        fullWidth
        loading={login.isPending}
        loadingLabel={t('customer.login.verifying')}
      >
        {t('customer.login.confirmCode')}
      </Button>
      <GhostRow>
        <Button
          type="button"
          variant="ghost"
          fullWidth
          onClick={() => void login.resend()}
          disabled={!resendEnabled}
        >
          {resendEnabled
            ? t('customer.login.resend')
            : t('customer.login.resendIn', { seconds: remaining })}
        </Button>
        <Button
          type="button"
          variant="ghost"
          fullWidth
          onClick={login.changePhone}
          disabled={login.isPending}
        >
          {t('customer.login.changePhone')}
        </Button>
      </GhostRow>
    </Form>
  )
}
