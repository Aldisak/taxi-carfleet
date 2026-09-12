import 'styled-components'

declare module 'styled-components' {
  export interface DefaultTheme {
    colors: {
      primary: string
      primaryDark: string
      background: string
      surface: string
      border: string
      text: string
      textSecondary: string
      error: string
      warning: string
      success: string
      statusFree: string
      statusFreeText: string
      statusBusy: string
      statusBusyText: string
      statusEnRoute: string
      statusEnRouteText: string
      statusOffline: string
      statusOfflineText: string
      orderNew: string
      orderNewText: string
      orderAssigned: string
      orderAssignedText: string
      orderInProgress: string
      orderInProgressText: string
      orderCompleted: string
      orderCompletedText: string
      orderCancelled: string
      orderCancelledText: string
    }
    spacing: {
      xs: string
      sm: string
      md: string
      lg: string
      xl: string
      xxl: string
    }
    typography: {
      fontFamily: string
      fontSizeXs: string
      fontSizeSm: string
      fontSizeMd: string
      fontSizeLg: string
      fontSizeXl: string
      fontWeightNormal: number
      fontWeightMedium: number
      fontWeightBold: number
      lineHeight: number
    }
    borderRadius: {
      sm: string
      md: string
      lg: string
      full: string
    }
    shadows: {
      sm: string
      md: string
      lg: string
    }
    breakpoints: {
      desktop: string
      wide: string
    }
    /** Mobile touch target minimum sizes for driver PWA. */
    touchTargets: {
      /** Minimum tap target for interactive elements (48px per HIG/WCAG). */
      min: string
      /** Primary action buttons in the driver app (64px for large tap area). */
      primary: string
    }
  }
}
