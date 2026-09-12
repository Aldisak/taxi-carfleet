import 'vitest'
import type { AxeMatchers } from 'vitest-axe/matchers'

declare module 'vitest' {
  // T must mirror vitest's generic Assertion<T> for declaration merging.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Assertion<T = unknown> extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
