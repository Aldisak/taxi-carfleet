/**
 * Barrel for the shared UI kit (customer-app redesign). Components style themselves from the
 * global CSS custom properties in `shared/theme/GlobalStyle.tsx`, take all user-facing text as
 * props (screens wire i18n), and expose accessible names via required label props. Import from
 * `@/shared/ui` (or a relative `shared/ui`) rather than reaching into individual files.
 */
export * from './Button'
export * from './IconButton'
export * from './FleetChip'
export * from './Field'
export * from './CodeInput'
export * from './Segmented'
export * from './Stepper'
export * from './Chip'
export * from './Pill'
export * from './Plate'
export * from './ListRow'
export * from './RouteSummary'
export * from './PriceCard'
export * from './DriverCard'
export * from './Callout'
export * from './Toast'
export * from './OfflineBanner'
export * from './StarPicker'
export * from './BottomSheet'
export * from './SearchingLoader'
export * from './icons/Icon'
