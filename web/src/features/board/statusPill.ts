import type { DefaultTheme } from 'styled-components'

export type DriverStatus = 'Free' | 'EnRoute' | 'Busy' | 'Offline'

export interface DriverStatusInfo {
  /** i18n key for the driver status label — pass to t() to get the localised string. */
  labelKey: string
  colorKey: keyof DefaultTheme['colors']
  textColorKey: keyof DefaultTheme['colors']
}

/**
 * Maps a DriverStatus string to its i18n label key and theme color keys.
 * Defaults to Offline/grey for unknown values.
 * The caller is responsible for translating `labelKey` via t().
 */
export function getDriverStatusInfo(status: DriverStatus): DriverStatusInfo {
  switch (status) {
    case 'Free':
      return { labelKey: 'status.driver.Free', colorKey: 'statusFree', textColorKey: 'statusFreeText' }
    case 'EnRoute':
      return { labelKey: 'status.driver.EnRoute', colorKey: 'statusEnRoute', textColorKey: 'statusEnRouteText' }
    case 'Busy':
      return { labelKey: 'status.driver.Busy', colorKey: 'statusBusy', textColorKey: 'statusBusyText' }
    case 'Offline':
    default:
      return { labelKey: 'status.driver.Offline', colorKey: 'statusOffline', textColorKey: 'statusOfflineText' }
  }
}
