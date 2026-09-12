/** Driver status values from the backend. */
export type DriverStatus = 'Offline' | 'Free' | 'Busy' | 'EnRoute'

/** Button variant for the main status button. */
export type ButtonVariant = 'primary' | 'secondary' | 'danger'

/** Action the main button triggers. */
export type HomeAction = 'goOnline' | 'goOffline' | 'viewRide'

/** Reason the button is disabled. */
export type DisabledReason = 'noVehicle' | 'noLocation' | null

/** Derived UI state for the home screen. */
export interface HomeState {
  /** i18n key for the main button label. */
  buttonLabel: string
  /** Visual variant of the main button. */
  buttonVariant: ButtonVariant
  /** Whether the main button is disabled. */
  buttonDisabled: boolean
  /** Reason the button is disabled, or null if enabled. */
  disabledReason: DisabledReason
  /** Action triggered on button press. */
  action: HomeAction
  /** Whether the vehicle selector should be visible. */
  showVehicleSelector: boolean
  /** i18n key for an optional secondary status label (e.g. "Čekám na objednávku"). */
  statusLabel: string | null
}

interface DeriveInput {
  status: DriverStatus
  hasVehicle: boolean
  hasLocation: boolean
}

/**
 * Pure function: derives home screen button state from driver status and device conditions.
 * No side effects — safe to test without mocking.
 */
export function deriveHomeState({ status, hasVehicle, hasLocation }: DeriveInput): HomeState {
  switch (status) {
    case 'Offline': {
      const missingVehicle = !hasVehicle
      const missingLocation = !missingVehicle && !hasLocation
      const disabled = !hasVehicle || !hasLocation
      const disabledReason: DisabledReason = missingVehicle
        ? 'noVehicle'
        : missingLocation
          ? 'noLocation'
          : null
      return {
        buttonLabel: 'driver.home.status.startShift',
        buttonVariant: 'primary',
        buttonDisabled: disabled,
        disabledReason,
        action: 'goOnline',
        showVehicleSelector: true,
        statusLabel: null,
      }
    }

    case 'Free':
      return {
        buttonLabel: 'driver.home.status.endShift',
        buttonVariant: 'secondary',
        buttonDisabled: false,
        disabledReason: null,
        action: 'goOffline',
        showVehicleSelector: false,
        statusLabel: 'driver.home.status.waitingForOrder',
      }

    case 'Busy':
    case 'EnRoute':
      return {
        buttonLabel: 'driver.home.status.viewRide',
        buttonVariant: 'primary',
        buttonDisabled: false,
        disabledReason: null,
        action: 'viewRide',
        showVehicleSelector: false,
        statusLabel: 'driver.home.status.rideInProgress',
      }
  }
}
