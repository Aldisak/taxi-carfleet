/** Type declarations for the CI geo-host guard (see check-no-osm.mjs). */

/** A single forbidden-host occurrence found by the scanner. */
export interface ForbiddenHostViolation {
  file: string
  host: string
  line: number
}

/** Legacy map-provider hosts that must never reappear in product source. */
export declare const FORBIDDEN_HOSTS: readonly string[]

/** Scan the given root directories for any forbidden host. */
export declare function scanForForbiddenHosts(
  rootDirectories: readonly string[],
): Promise<ForbiddenHostViolation[]>

/** Default scan roots relative to the repo: web/src and api/src. */
export declare function defaultScanRoots(): string[]
