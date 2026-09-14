import { useState } from 'react'
import styled from 'styled-components'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CustomerLoginStep } from './CustomerLoginStep'
import { ensureFleetSlug } from '../shell/ensureFleetSlug'

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

/** Standalone customer login at /customer/login. Lands on /c after authentication. */
export function CustomerLoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // F-05: /customer/login is NOT a child of CustomerLayout, so persist the slug here too
  // before the auth calls fire — otherwise a direct hit 404s on localhost.
  useState(ensureFleetSlug)

  return (
    <Wrapper>
      <Card>
        <Title>{t('customer.login.title')}</Title>
        <CustomerLoginStep onAuthenticated={() => navigate('/customer')} />
      </Card>
    </Wrapper>
  )
}
