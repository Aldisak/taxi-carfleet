/** A quick-chip fills a pickup/dropoff field with a label and fixed coordinates. */
export interface QuickChip {
  label: string
  address: string
  lat: number
  lng: number
}

/**
 * Hardcoded quick-chips for the most common pickup/dropoff locations.
 * Coordinates are fixed and do NOT require a geo call.
 * Fleet-configurable in UC-006; hardcoded here per WI B3.
 */
export const QUICK_CHIPS: readonly QuickChip[] = [
  {
    label: 'Vlakové nádraží Kolín',
    address: 'Vlakové nádraží, Kolín',
    lat: 50.0271,
    lng: 15.2005,
  },
  {
    label: 'Vlakové nádraží Kutná Hora',
    address: 'Vlakové nádraží, Kutná Hora',
    lat: 49.9469,
    lng: 15.2674,
  },
  {
    label: 'Nemocnice Kolín',
    address: 'Nemocnice Kolín, Kolín',
    lat: 50.0288,
    lng: 15.1934,
  },
  {
    label: 'Autobusové nádraží Kolín',
    address: 'Autobusové nádraží, Kolín',
    lat: 50.0266,
    lng: 15.2082,
  },
] as const
