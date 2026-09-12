import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { useStaff, useCreateStaff, useUpdateStaff, useDeactivateStaff } from './useStaff'
import { useResetPassword } from './useResetPassword'
import { validateInviteForm } from './inviteSchema'
import { map409ErrorToKey } from './staffErrors'
import type { InviteFormValues, InviteFormErrors } from './inviteSchema'
import type { StaffMemberDto } from '../../shared/api/client'

const Section = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
`

const Title = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  margin: 0 0 ${({ theme }) => theme.spacing.md} 0;
`

const ActionBar = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: ${({ theme }) => theme.spacing.md};
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

const Button = styled.button`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  margin-right: ${({ theme }) => theme.spacing.xs};

  &:hover {
    background: ${({ theme }) => theme.colors.background};
  }
`

const PrimaryButton = styled(Button)`
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  border-color: ${({ theme }) => theme.colors.primary};

  &:hover {
    opacity: 0.9;
  }
`

const DangerButton = styled(Button)`
  color: ${({ theme }) => theme.colors.error};
  border-color: ${({ theme }) => theme.colors.error};
`

const Form = styled.form`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
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

  &:focus {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 1px;
  }

  &.error {
    border-color: ${({ theme }) => theme.colors.error};
  }
`

const Select = styled.select`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};

  &:focus {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 1px;
  }
`

const ErrorText = styled.span`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
`

const FormActions = styled.div`
  grid-column: 1 / -1;
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  justify-content: flex-end;
`

const ToastError = styled.p`
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.error}11;
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`

const PasswordBox = styled.div`
  background: ${({ theme }) => theme.colors.warning}22;
  border: 1px solid ${({ theme }) => theme.colors.warning};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`

const PasswordWarning = styled.p`
  color: ${({ theme }) => theme.colors.warning};
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
  margin-bottom: ${({ theme }) => theme.spacing.sm};
  word-break: break-all;
`

const ROLES = ['Driver', 'Dispatcher', 'FleetAdmin'] as const

const EMPTY_INVITE: InviteFormValues = { email: '', displayName: '', role: 'Driver', phone: '' }

interface EditFormValues {
  displayName: string
  phone: string
  isActive: boolean
}

interface EditFormErrors {
  displayName?: string
}

function validateEditForm(values: EditFormValues, t: (k: string) => string): EditFormErrors {
  const errors: EditFormErrors = {}
  if (!values.displayName.trim()) errors.displayName = t('settings.people.validation.displayNameRequired')
  return errors
}

/** People (staff) CRUD tab with invite, edit, and reset-password. */
export function PeopleTab() {
  const { t } = useTranslation()
  const { data, isLoading } = useStaff()
  const createStaff = useCreateStaff()
  const updateStaff = useUpdateStaff()
  const deactivateStaff = useDeactivateStaff()
  const { resetPassword, isPending: resetPending, passwordState, dismissPassword } = useResetPassword()

  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteForm, setInviteForm] = useState<InviteFormValues>(EMPTY_INVITE)
  const [inviteErrors, setInviteErrors] = useState<InviteFormErrors>({})

  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditFormValues>({ displayName: '', phone: '', isActive: true })
  const [editErrors, setEditErrors] = useState<EditFormErrors>({})

  const [actionError, setActionError] = useState<string | null>(null)
  const [copiedPassword, setCopiedPassword] = useState(false)

  function openEdit(member: StaffMemberDto) {
    setEditingMemberId(member.id)
    setEditForm({
      displayName: member.displayName,
      phone: member.phone ?? '',
      isActive: member.isActive,
    })
    setEditErrors({})
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errors = validateEditForm(editForm, t)
    if (Object.keys(errors).length > 0) {
      setEditErrors(errors)
      return
    }
    if (!editingMemberId) return

    updateStaff.mutate(
      {
        id: editingMemberId,
        req: {
          displayName: editForm.displayName.trim(),
          phone: editForm.phone.trim() || null,
          isActive: editForm.isActive,
        },
      },
      {
        onSuccess: () => {
          setEditingMemberId(null)
        },
        onError: (error) => {
          const key = map409ErrorToKey(error)
          setActionError(key ? t(key) : t('app.error'))
        },
      },
    )
  }

  function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errors = validateInviteForm(inviteForm, t)
    if (Object.keys(errors).length > 0) {
      setInviteErrors(errors)
      return
    }

    createStaff.mutate(
      {
        email: inviteForm.email.trim(),
        displayName: inviteForm.displayName.trim(),
        role: inviteForm.role,
        phone: inviteForm.phone.trim() || null,
      },
      {
        onSuccess: (data) => {
          setShowInviteForm(false)
          setInviteForm(EMPTY_INVITE)
          // Route the invite temp password through the reset password state machine
          // for a consistent single display mechanism
          _showTempPassword(data.temporaryPassword)
        },
      },
    )
  }

  const [tempPassword, setTempPassword] = useState<string | null>(null)
  function _showTempPassword(pw: string) {
    setTempPassword(pw)
    setCopiedPassword(false)
  }

  function handleDismissTempPassword() {
    setTempPassword(null)
    setCopiedPassword(false)
  }

  async function handleCopyTempPassword(pw: string) {
    await navigator.clipboard.writeText(pw)
    setCopiedPassword(true)
  }

  function handleDeactivate(member: StaffMemberDto) {
    setActionError(null)
    deactivateStaff.mutate(member.id, {
      onError: (error) => {
        const key = map409ErrorToKey(error)
        setActionError(key ? t(key) : t('app.error'))
      },
    })
  }

  function handleResetPassword(member: StaffMemberDto) {
    setActionError(null)
    resetPassword(member.id)
  }

  const displayedTempPassword = passwordState.isRevealed ? passwordState.password : tempPassword

  return (
    <Section>
      <Title>{t('settings.people.title')}</Title>

      {actionError && (
        <ToastError role="alert">{actionError}</ToastError>
      )}

      {displayedTempPassword && (
        <PasswordBox aria-live="polite">
          <PasswordWarning>{t('settings.people.tempPassword.warning')}</PasswordWarning>
          <PasswordDisplay data-testid="temp-password">{displayedTempPassword}</PasswordDisplay>
          <Button
            type="button"
            onClick={() => handleCopyTempPassword(displayedTempPassword)}
          >
            {copiedPassword
              ? t('settings.people.tempPassword.copied')
              : t('settings.people.tempPassword.copy')}
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (passwordState.isRevealed) dismissPassword()
              else handleDismissTempPassword()
            }}
          >
            {t('settings.people.tempPassword.dismiss')}
          </Button>
        </PasswordBox>
      )}

      <ActionBar>
        <PrimaryButton type="button" onClick={() => setShowInviteForm(true)}>
          {t('settings.people.invite')}
        </PrimaryButton>
      </ActionBar>

      {editingMemberId && (
        <Form onSubmit={handleEditSubmit} noValidate>
          <FormGroup>
            <Label htmlFor="pe-name">{t('settings.people.fields.displayName')}</Label>
            <Input
              id="pe-name"
              value={editForm.displayName}
              onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
              className={editErrors.displayName ? 'error' : ''}
            />
            {editErrors.displayName && <ErrorText>{editErrors.displayName}</ErrorText>}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="pe-phone">{t('settings.people.fields.phone')}</Label>
            <Input
              id="pe-phone"
              type="tel"
              value={editForm.phone}
              onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </FormGroup>

          <FormGroup>
            <Label>
              <input
                type="checkbox"
                checked={editForm.isActive}
                onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              {' '}{t('settings.people.fields.isActive')}
            </Label>
          </FormGroup>

          <FormActions>
            <Button type="button" onClick={() => setEditingMemberId(null)}>
              {t('settings.people.cancel')}
            </Button>
            <PrimaryButton type="submit">
              {t('settings.people.save')}
            </PrimaryButton>
          </FormActions>
        </Form>
      )}

      {showInviteForm && (
        <Form onSubmit={handleInviteSubmit} noValidate>
          <FormGroup>
            <Label htmlFor="p-email">{t('settings.people.fields.email')}</Label>
            <Input
              id="p-email"
              type="email"
              value={inviteForm.email}
              onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
              className={inviteErrors.email ? 'error' : ''}
            />
            {inviteErrors.email && <ErrorText>{inviteErrors.email}</ErrorText>}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="p-name">{t('settings.people.fields.displayName')}</Label>
            <Input
              id="p-name"
              value={inviteForm.displayName}
              onChange={(e) => setInviteForm((f) => ({ ...f, displayName: e.target.value }))}
              className={inviteErrors.displayName ? 'error' : ''}
            />
            {inviteErrors.displayName && <ErrorText>{inviteErrors.displayName}</ErrorText>}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="p-role">{t('settings.people.fields.role')}</Label>
            <Select
              id="p-role"
              value={inviteForm.role}
              onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value }))}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`settings.people.roles.${r}`)}
                </option>
              ))}
            </Select>
            {inviteErrors.role && <ErrorText>{inviteErrors.role}</ErrorText>}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="p-phone">{t('settings.people.fields.phone')}</Label>
            <Input
              id="p-phone"
              type="tel"
              value={inviteForm.phone}
              onChange={(e) => setInviteForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </FormGroup>

          <FormActions>
            <Button type="button" onClick={() => setShowInviteForm(false)}>
              {t('settings.people.cancel')}
            </Button>
            <PrimaryButton type="submit">
              {t('settings.people.invite')}
            </PrimaryButton>
          </FormActions>
        </Form>
      )}

      {isLoading ? (
        <p>{t('settings.people.loading')}</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t('settings.people.fields.displayName')}</Th>
              <Th>{t('settings.people.fields.email')}</Th>
              <Th>{t('settings.people.fields.role')}</Th>
              <Th>{t('settings.people.fields.lastLogin')}</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((member) => (
              <tr key={member.id}>
                <Td>{member.displayName}</Td>
                <Td>{member.email ?? '—'}</Td>
                <Td>{t(`settings.people.roles.${member.role}`)}</Td>
                <Td>
                  {member.lastLoginAt
                    ? new Date(member.lastLoginAt).toLocaleDateString('cs-CZ')
                    : t('settings.people.noLastLogin')}
                </Td>
                <Td>
                  <Button type="button" onClick={() => openEdit(member)}>
                    {t('settings.people.edit')}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleResetPassword(member)}
                    disabled={resetPending}
                  >
                    {t('settings.people.resetPassword')}
                  </Button>
                  {member.isActive && (
                    <DangerButton type="button" onClick={() => handleDeactivate(member)}>
                      {t('settings.people.deactivate')}
                    </DangerButton>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Section>
  )
}
