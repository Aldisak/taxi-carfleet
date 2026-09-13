import type { FleetSettingsDto } from '../../shared/api/client'

/** View-model for the Fleet settings tab. */
export interface FleetSettingsViewModel {
  name: string
  phone: string
  offerTimeoutSeconds: number
  autoDispatchEnabled: boolean
  /** Monthly SMS cost cap in integer CZK (UC-005 §4); undefined when the backend omits it. */
  smsMonthlyCapCzk?: number
  /** Per-SMS unit cost in integer CZK (UC-005 §4). */
  smsUnitCostCzk?: number
  /** SMS count sent this month (UC-005 §4, read-only). */
  smsSentThisMonth?: number
}

/** Maps the API DTO to the view-model. Pure function, easily testable. */
export function mapFleetSettings(dto: FleetSettingsDto): FleetSettingsViewModel {
  return {
    name: dto.name,
    phone: dto.phone,
    offerTimeoutSeconds: dto.offerTimeoutSeconds,
    autoDispatchEnabled: dto.autoDispatchEnabled,
    smsMonthlyCapCzk: dto.smsMonthlyCapCzk,
    smsUnitCostCzk: dto.smsUnitCostCzk,
    smsSentThisMonth: dto.smsSentThisMonth,
  }
}
