import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import styled from 'styled-components'
import { useAdminFleets, useCreateFleet } from './useAdminFleets'
import {
  validateCreateFleetForm,
  toCreateFleetRequest,
  type CreateFleetFormValues,
  type CreateFleetFormErrors,
} from './createFleetForm'
import type { CreateFleetResponse } from '../../shared/api/client'

const Page = styled.main`
  max-width: 720px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`

const Title = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  margin: 0;
`

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`

const PlatformLink = styled(Link)`
  color: ${({ theme }) => theme.colors.primary};
  min-height: ${({ theme }) => theme.touchTargets.min};
  display: inline-flex;
  align-items: center;
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`

const SubTitle = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  margin: 0 0 ${({ theme }) => theme.spacing.sm} 0;
`

const Form = styled.form`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.md};
`

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`

const Label = styled.label`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const Input = styled.input`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  min-height: ${({ theme }) => theme.touchTargets.min};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 1px;
  }

  &[aria-invalid='true'] {
    border-color: ${({ theme }) => theme.colors.error};
  }
`

const ErrorText = styled.span`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
`

const Actions = styled.div`
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
`

const PrimaryButton = styled.button`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.text};
    outline-offset: 2px;
  }
`

const PasswordBox = styled.div`
  background: ${({ theme }) => theme.colors.warning}22;
  border: 1px solid ${({ theme }) => theme.colors.warning};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.md};
`

const PasswordWarning = styled.p`
  color: ${({ theme }) => theme.colors.text};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  margin: 0 0 ${({ theme }) => theme.spacing.sm} 0;
`

const PasswordDisplay = styled.code`
  display: block;
  font-family: monospace;
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: ${({ theme }) => theme.spacing.sm};
  word-break: break-all;
`

const ToastError = styled.p`
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.error}11;
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: ${({ theme }) => theme.spacing.sm};
  margin: 0;
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
`

const Th = styled.th`
  text-align: left;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
`

const Td = styled.td`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`

const EditLink = styled(Link)`
  color: ${({ theme }) => theme.colors.primary};
  min-height: ${({ theme }) => theme.touchTargets.min};
  display: inline-flex;
  align-items: center;
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`

const EMPTY: CreateFleetFormValues = { slug: '', name: '', phone: '', adminEmail: '' }

/**
 * SuperAdmin fleet administration screen (UC-007 A5 / B3). Lists all fleets and creates a
 * fleet; on create, shows the returned one-time admin password ONCE (it is never returned
 * again). Minimal, intentionally un-styled beyond theme tokens — a low-traffic ops screen.
 *
 * NOTE: reaching this page requires a SuperAdmin JWT, which the current backend cannot mint
 * (no SuperAdmin login path — see client.ts handoff note). The page is otherwise complete.
 */
export function AdminFleetsPage() {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useAdminFleets()
  const createFleet = useCreateFleet()

  const [form, setForm] = useState<CreateFleetFormValues>(EMPTY)
  const [errors, setErrors] = useState<CreateFleetFormErrors>({})
  const [created, setCreated] = useState<CreateFleetResponse | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function set<K extends keyof CreateFleetFormValues>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    const found = validateCreateFleetForm(form)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    createFleet.mutate(toCreateFleetRequest(form), {
      onSuccess: (res) => {
        setCreated(res)
        setForm(EMPTY)
      },
      onError: () => setSubmitError('admin.fleets.createFailed'),
    })
  }

  return (
    <Page>
      <TopBar>
        <Title>{t('admin.fleets.title')}</Title>
        <PlatformLink to="/admin/platform">{t('admin.platform.title')}</PlatformLink>
      </TopBar>

      <section aria-label={t('admin.fleets.createTitle')}>
        <SubTitle>{t('admin.fleets.createTitle')}</SubTitle>

        {created && (
          <PasswordBox role="status" aria-live="polite">
            <PasswordWarning>
              {t('admin.fleets.passwordWarning', { email: created.adminEmail })}
            </PasswordWarning>
            <PasswordDisplay data-testid="one-time-password">{created.oneTimePassword}</PasswordDisplay>
          </PasswordBox>
        )}

        {submitError && <ToastError role="alert">{t(submitError)}</ToastError>}

        <Form onSubmit={handleSubmit} noValidate>
          <FormGroup>
            <Label htmlFor="af-slug">{t('admin.fleets.fields.slug')}</Label>
            <Input
              id="af-slug"
              value={form.slug}
              aria-invalid={errors.slug ? 'true' : undefined}
              onChange={(e) => set('slug', e.target.value)}
            />
            {errors.slug && <ErrorText role="alert">{t(errors.slug)}</ErrorText>}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="af-name">{t('admin.fleets.fields.name')}</Label>
            <Input
              id="af-name"
              value={form.name}
              aria-invalid={errors.name ? 'true' : undefined}
              onChange={(e) => set('name', e.target.value)}
            />
            {errors.name && <ErrorText role="alert">{t(errors.name)}</ErrorText>}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="af-phone">{t('admin.fleets.fields.phone')}</Label>
            <Input
              id="af-phone"
              type="tel"
              value={form.phone}
              aria-invalid={errors.phone ? 'true' : undefined}
              onChange={(e) => set('phone', e.target.value)}
            />
            {errors.phone && <ErrorText role="alert">{t(errors.phone)}</ErrorText>}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="af-email">{t('admin.fleets.fields.adminEmail')}</Label>
            <Input
              id="af-email"
              type="email"
              value={form.adminEmail}
              aria-invalid={errors.adminEmail ? 'true' : undefined}
              onChange={(e) => set('adminEmail', e.target.value)}
            />
            {errors.adminEmail && <ErrorText role="alert">{t(errors.adminEmail)}</ErrorText>}
          </FormGroup>

          <Actions>
            <PrimaryButton type="submit" disabled={createFleet.isPending}>
              {createFleet.isPending ? t('admin.fleets.creating') : t('admin.fleets.create')}
            </PrimaryButton>
          </Actions>
        </Form>
      </section>

      <section aria-label={t('admin.fleets.listTitle')}>
        <SubTitle>{t('admin.fleets.listTitle')}</SubTitle>
        {isLoading ? (
          <p>{t('admin.fleets.loading')}</p>
        ) : isError ? (
          <ToastError role="alert">{t('admin.fleets.loadFailed')}</ToastError>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('admin.fleets.fields.slug')}</Th>
                <Th>{t('admin.fleets.fields.name')}</Th>
                <Th>{t('admin.fleets.fields.phone')}</Th>
                <Th>{t('admin.fleets.fields.status')}</Th>
                <Th>{t('admin.fleets.fields.actions')}</Th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((fleet) => (
                <tr key={fleet.id}>
                  <Td>{fleet.slug}</Td>
                  <Td>{fleet.name}</Td>
                  <Td>{fleet.phone}</Td>
                  <Td>{fleet.isActive ? t('admin.fleets.active') : t('admin.fleets.inactive')}</Td>
                  <Td>
                    <EditLink to={`/admin/fleets/${fleet.id}/settings`}>
                      {t('admin.fleets.edit')}
                    </EditLink>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </Page>
  )
}
