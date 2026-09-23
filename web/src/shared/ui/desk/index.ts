/**
 * Desktop UI kit barrel — pure, presentational components for the dispatcher, orders
 * and admin screens. These style themselves from the global CSS custom properties in
 * `shared/theme/GlobalStyle.tsx` and are a sibling of the mobile kit (`shared/ui`); they
 * are intentionally kept out of the mobile barrel to preserve bundle/name separation.
 */
export { Panel, PanelHeader, type PanelProps, type PanelHeaderProps } from './Panel'
export { Ctrl, Lbl, type CtrlProps, type LblProps } from './Ctrl'
export {
  DeskButton,
  type DeskButtonProps,
  type DeskButtonVariant,
  type DeskButtonSize,
} from './DeskButton'
export { Table, Thead, Tbody, Tr, Th, Td } from './Table'
export {
  Stat,
  type StatProps,
  type StatDelta,
  type StatDeltaDirection,
} from './Stat'
export { DeskPill, type DeskPillProps, type DeskPillTone } from './DeskPill'
export { FilterChip, type FilterChipProps } from './FilterChip'
export {
  DeskSegmented,
  type DeskSegmentedProps,
  type DeskSegmentOption,
} from './DeskSegmented'
export { Tabs, type TabsProps, type TabItem } from './Tabs'
export { Timeline, type TimelineProps, type TimelineItem } from './Timeline'
export { Drawer, type DrawerProps } from './Drawer'
