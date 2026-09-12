import styled from 'styled-components'
import { useTranslation } from 'react-i18next'

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
`

const Label = styled.label`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.text};
`

const Select = styled.select`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.surface};
  appearance: auto;
  width: 100%;
`

export interface VehicleOption {
  id: string
  plate: string
  make: string
  model: string
}

interface VehicleSelectorProps {
  vehicles: VehicleOption[]
  selectedVehicleId: string | null
  onSelect: (vehicleId: string | null) => void
}

/**
 * Vehicle selector shown only when driver is Offline (going online flow).
 * Populated from available vehicles list (fetched by parent).
 */
export function VehicleSelector({ vehicles, selectedVehicleId, onSelect }: VehicleSelectorProps) {
  const { t } = useTranslation()

  return (
    <Wrapper>
      <Label htmlFor="vehicle-select">{t('driver.home.vehicle.label')}</Label>
      <Select
        id="vehicle-select"
        value={selectedVehicleId ?? ''}
        onChange={e => onSelect(e.target.value || null)}
      >
        <option value="">{t('driver.home.vehicle.placeholder')}</option>
        {vehicles.map(v => (
          <option key={v.id} value={v.id}>
            {v.plate} — {v.make} {v.model}
          </option>
        ))}
      </Select>
    </Wrapper>
  )
}
