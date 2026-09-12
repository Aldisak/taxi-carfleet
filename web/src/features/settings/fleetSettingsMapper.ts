import type { FleetSettingsDto } from '../../shared/api/client'

/** View-model for the Fleet settings tab. */
export interface FleetSettingsViewModel {
  name: string
  phone: string
  offerTimeoutSeconds: number
  autoDispatchEnabled: boolean
}

/** Maps the API DTO to the view-model. Pure function, easily testable. */
export function mapFleetSettings(dto: FleetSettingsDto): FleetSettingsViewModel {
  return {
    name: dto.name,
    phone: dto.phone,
    offerTimeoutSeconds: dto.offerTimeoutSeconds,
    autoDispatchEnabled: dto.autoDispatchEnabled,
  }
}
