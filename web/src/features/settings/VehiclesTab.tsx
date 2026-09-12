import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { useVehicles, useCreateVehicle, useUpdateVehicle, useDeleteVehicle } from './useVehicles'
import { validateVehicleForm } from './vehicleSchema'
import type { VehicleDto } from '../../shared/api/client'
import type { VehicleFormValues, VehicleFormErrors } from './vehicleSchema'

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

const InactiveBadge = styled.span`
  background: ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  padding: 2px 8px;
  border-radius: 12px;
  margin-left: ${({ theme }) => theme.spacing.xs};
`

const EMPTY_FORM: VehicleFormValues = {
  plate: '',
  make: '',
  model: '',
  color: '',
  seats: '4',
}

/** Vehicles CRUD tab on the settings page. */
export function VehiclesTab() {
  const { t } = useTranslation()
  const { data, isLoading } = useVehicles()
  const createVehicle = useCreateVehicle()
  const updateVehicle = useUpdateVehicle()
  const deleteVehicle = useDeleteVehicle()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<VehicleFormValues>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<VehicleFormErrors>({})

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormErrors({})
    setShowForm(true)
  }

  function openEdit(vehicle: VehicleDto) {
    setEditingId(vehicle.id)
    setForm({
      plate: vehicle.plate,
      make: vehicle.make,
      model: vehicle.model,
      color: vehicle.color,
      seats: String(vehicle.seats),
    })
    setFormErrors({})
    setShowForm(true)
  }

  function handleChange(field: keyof VehicleFormValues, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function handleCancel() {
    setShowForm(false)
    setEditingId(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errors = validateVehicleForm(form, t)
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    const req = {
      plate: form.plate.trim(),
      make: form.make.trim(),
      model: form.model.trim(),
      color: form.color.trim(),
      seats: Number(form.seats),
    }

    if (editingId) {
      updateVehicle.mutate(
        { id: editingId, req },
        {
          onSuccess: () => {
            setShowForm(false)
            setEditingId(null)
          },
        },
      )
    } else {
      createVehicle.mutate(req, {
        onSuccess: () => {
          setShowForm(false)
        },
      })
    }
  }

  function handleDeactivate(vehicle: VehicleDto) {
    if (window.confirm(t('settings.vehicles.confirmDeactivate'))) {
      deleteVehicle.mutate(vehicle.id)
    }
  }

  return (
    <Section>
      <Title>{t('settings.vehicles.title')}</Title>

      <ActionBar>
        <PrimaryButton type="button" onClick={openCreate}>
          {t('settings.vehicles.add')}
        </PrimaryButton>
      </ActionBar>

      {showForm && (
        <Form onSubmit={handleSubmit} noValidate>
          <FormGroup>
            <Label htmlFor="v-plate">{t('settings.vehicles.fields.plate')}</Label>
            <Input
              id="v-plate"
              value={form.plate}
              onChange={(e) => handleChange('plate', e.target.value)}
              className={formErrors.plate ? 'error' : ''}
            />
            {formErrors.plate && <ErrorText>{formErrors.plate}</ErrorText>}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="v-make">{t('settings.vehicles.fields.make')}</Label>
            <Input
              id="v-make"
              value={form.make}
              onChange={(e) => handleChange('make', e.target.value)}
              className={formErrors.make ? 'error' : ''}
            />
            {formErrors.make && <ErrorText>{formErrors.make}</ErrorText>}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="v-model">{t('settings.vehicles.fields.model')}</Label>
            <Input
              id="v-model"
              value={form.model}
              onChange={(e) => handleChange('model', e.target.value)}
              className={formErrors.model ? 'error' : ''}
            />
            {formErrors.model && <ErrorText>{formErrors.model}</ErrorText>}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="v-color">{t('settings.vehicles.fields.color')}</Label>
            <Input
              id="v-color"
              value={form.color}
              onChange={(e) => handleChange('color', e.target.value)}
              className={formErrors.color ? 'error' : ''}
            />
            {formErrors.color && <ErrorText>{formErrors.color}</ErrorText>}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="v-seats">{t('settings.vehicles.fields.seats')}</Label>
            <Input
              id="v-seats"
              type="number"
              min={1}
              value={form.seats}
              onChange={(e) => handleChange('seats', e.target.value)}
              className={formErrors.seats ? 'error' : ''}
            />
            {formErrors.seats && <ErrorText>{formErrors.seats}</ErrorText>}
          </FormGroup>

          <FormActions>
            <Button type="button" onClick={handleCancel}>
              {t('settings.vehicles.cancel')}
            </Button>
            <PrimaryButton type="submit">
              {t('settings.vehicles.save')}
            </PrimaryButton>
          </FormActions>
        </Form>
      )}

      {isLoading ? (
        <p>{t('settings.vehicles.loading')}</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t('settings.vehicles.fields.plate')}</Th>
              <Th>{t('settings.vehicles.fields.make')}</Th>
              <Th>{t('settings.vehicles.fields.model')}</Th>
              <Th>{t('settings.vehicles.fields.color')}</Th>
              <Th>{t('settings.vehicles.fields.seats')}</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((v) => (
              <tr key={v.id}>
                <Td>
                  {v.plate}
                  {!v.isActive && (
                    <InactiveBadge>{t('settings.vehicles.inactive')}</InactiveBadge>
                  )}
                </Td>
                <Td>{v.make}</Td>
                <Td>{v.model}</Td>
                <Td>{v.color}</Td>
                <Td>{v.seats}</Td>
                <Td>
                  <Button type="button" onClick={() => openEdit(v)}>
                    {t('settings.vehicles.edit')}
                  </Button>
                  {v.isActive && (
                    <DangerButton type="button" onClick={() => handleDeactivate(v)}>
                      {t('settings.vehicles.deactivate')}
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
