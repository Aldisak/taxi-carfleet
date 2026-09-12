/**
 * API helper for the customer E2E specs (UC-004 B-e2e) — customer-side operations performed
 * directly against the API (bypassing the UI) to set up state for the tracking/cancel assertions,
 * mirroring the apiDriver.ts pattern.
 *
 * DEV SMS-CODE NOTE (verified against api/src): the customer login code is randomly generated,
 * SHA-256-hashed before storage, and NEVER logged — ConsoleSmsSender masks the phone to last-4
 * and logs no message body (Infrastructure/Sms/ConsoleSmsSender.cs). There is therefore no way to
 * read the real code from console/API output. Since this WI must not modify api/, the test harness
 * injects a KNOWN code hash directly into the sms_codes table via the docker psql the e2e harness
 * already uses (scripts/e2e-api.mjs) — a test-harness technique, not an api/ change. The request-code
 * endpoint creates the row (inherits its phone normalization + expiry), then we UPDATE its code_hash
 * to the SHA-256 of a known 6-digit code, then verify-code accepts it. A FRESH phone is used per
 * login to stay clear of the 1/60s + 3/10min per-phone rate limits and the single-use code rule.
 */

import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const API_BASE = 'http://localhost:5249/api/v1'
const FLEET_SLUG = 'demo'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const COMPOSE_FILE = path.join(REPO_ROOT, 'infra', 'docker-compose.dev.yml')

/** A fixed, known dev code we inject. Any 6-digit string works; the hash is what matters. */
export const DEV_SMS_CODE = '424242'

/** An authenticated customer session (JWT minted by verify-code). */
export interface CustomerSession {
  accessToken: string
  refreshToken: string
  userId: string
  phone: string
}

/** SHA-256 hex (lowercase) of the raw code — matches VerifyCodeEndpoint.ComputeCodeHash exactly. */
function codeHash(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex').toLowerCase()
}

/**
 * Overwrites the most-recent sms_codes row for a phone with a known code hash via docker psql.
 * sms_codes columns are snake_case (EFCore.NamingConventions): id, phone, code_hash, expires_at,
 * attempts, used_at. We UPDATE the latest unused row so expiry/id are the endpoint's own values.
 */
function injectKnownCode(phone: string, rawCode: string): void {
  const hash = codeHash(rawCode)
  // Single-quote the phone; it is a controlled E.164 string (no injection surface).
  const sql =
    `UPDATE sms_codes SET code_hash='${hash}', attempts=0, used_at=NULL ` +
    `WHERE id=(SELECT id FROM sms_codes WHERE phone='${phone}' AND used_at IS NULL ` +
    `ORDER BY expires_at DESC LIMIT 1);`
  execSync(
    `docker compose -f "${COMPOSE_FILE}" exec -T db psql -U taxi -d taxi -v ON_ERROR_STOP=1 -c "${sql}"`,
    { stdio: 'pipe', cwd: REPO_ROOT },
  )
}

/**
 * Overwrites the latest sms_codes row for a phone with the known DEV_SMS_CODE hash. Exposed for
 * the AC#1 UI flow: the UI calls request-code itself, then the test injects the known code so the
 * UI's verify-code submission succeeds. Call AFTER the code step renders (row exists).
 */
export function injectForPhone(phone: string): void {
  injectKnownCode(phone, DEV_SMS_CODE)
}

/**
 * Full customer login via the real endpoints + a known-code injection:
 *   POST auth/customer/request-code  (creates the sms_codes row)
 *   → inject a known code hash in Postgres
 *   → POST auth/customer/verify-code (accepts our known code, mints JWTs, upserts the Customer user)
 * Pass a UNIQUE phone per call to avoid rate limits / code reuse.
 */
export async function loginAsCustomer(phone: string): Promise<CustomerSession> {
  const reqRes = await fetch(`${API_BASE}/auth/customer/request-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Fleet-Slug': FLEET_SLUG },
    body: JSON.stringify({ phone }),
  })
  if (!reqRes.ok) {
    throw new Error(`request-code failed: ${reqRes.status} ${await reqRes.text()}`)
  }

  injectKnownCode(phone, DEV_SMS_CODE)

  const verifyRes = await fetch(`${API_BASE}/auth/customer/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Fleet-Slug': FLEET_SLUG },
    body: JSON.stringify({ phone, code: DEV_SMS_CODE }),
  })
  if (!verifyRes.ok) {
    throw new Error(`verify-code failed: ${verifyRes.status} ${await verifyRes.text()}`)
  }
  const body = (await verifyRes.json()) as {
    accessToken: string
    refreshToken: string
    user: { id: string; phone: string }
  }
  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    userId: body.user.id,
    phone: body.user.phone,
  }
}

/** Minimal order shape returned by the customer create envelope. */
export interface CustomerOrder {
  id: string
  publicCode: string
  status: string
  /** A-track: signed tracking token for the logged-out /c/t/{code}?k={token} link. */
  trackingCode: string
  trackingToken: string
  trackingUrlPath: string
}

/**
 * Customer creates an order (Source=App, owner = this session). Returns the order + the A-track
 * trackingCode/trackingToken used to build valid/expired tracking links for AC#3.
 * Defaults to a Fixed-price point-to-point matching the seeded coordinates.
 */
export async function createCustomerOrder(
  session: CustomerSession,
  opts: { fixedPriceCzk?: number } = {},
): Promise<CustomerOrder> {
  const body = {
    pickupAddress: 'Nádraží, Kolín',
    pickupLat: 50.0281,
    pickupLng: 15.2006,
    dropoffAddress: 'Centrum, Kolín',
    dropoffLat: 50.032,
    dropoffLng: 15.199,
    passengers: 1,
    priceType: 'Fixed',
    fixedPriceCzk: opts.fixedPriceCzk ?? 100,
  }
  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
      'X-Fleet-Slug': FLEET_SLUG,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`createCustomerOrder failed: ${res.status} ${await res.text()}`)
  }
  const json = (await res.json()) as {
    order: { id: string; publicCode: string; status: string }
    trackingCode?: string
    trackingToken?: string
    trackingUrlPath?: string
  }
  if (!json.trackingCode || !json.trackingToken || !json.trackingUrlPath) {
    throw new Error('createCustomerOrder: tracking fields missing (A-track not merged?)')
  }
  return {
    id: json.order.id,
    publicCode: json.order.publicCode,
    status: json.order.status,
    trackingCode: json.trackingCode,
    trackingToken: json.trackingToken,
    trackingUrlPath: json.trackingUrlPath,
  }
}

/** Reads the raw order row (dispatcher token) including CancelledByRole for the AC#5 assertion. */
export interface RawOrder {
  id: string
  status: string
  driverId: string | null
  cancelledByRole: string | null
  cancelReason: string | null
  ratingStars: number | null
  ratingComment: string | null
}

/**
 * Reads an order's cancel/rating fields directly from Postgres (columns not all exposed on the
 * dispatcher GET /orders/{id} DTO). Used to prove AC#5 (cancelled_by_role = 'Customer') and AC#7
 * (rating_stars persisted) server-side. snake_case columns (EFCore.NamingConventions).
 */
export function readOrderRow(orderId: string): RawOrder {
  const sql =
    `SELECT status, driver_id, cancelled_by_role, cancel_reason, rating_stars, rating_comment ` +
    `FROM orders WHERE id='${orderId}';`
  // NOTE: execSync runs via cmd.exe on Windows, where single-quoted args (`-F '|'`) break
  // ("''' is not recognized"). psql's `-A` (unaligned) mode already uses `|` as the default field
  // separator, so we omit `-F` entirely and split on `|`.
  const out = execSync(
    `docker compose -f "${COMPOSE_FILE}" exec -T db psql -U taxi -d taxi -A -t -c "${sql}"`,
    { stdio: 'pipe', cwd: REPO_ROOT },
  )
    .toString()
    .trim()
  const [status, driverId, cancelledByRole, cancelReason, ratingStars, ratingComment] = out.split('|')
  return {
    id: orderId,
    status: status ?? '',
    driverId: driverId || null,
    cancelledByRole: cancelledByRole || null,
    cancelReason: cancelReason || null,
    ratingStars: ratingStars ? Number(ratingStars) : null,
    ratingComment: ratingComment || null,
  }
}

/**
 * Sends a single driver GPS position through the SignalR hub as the given driver (must be the
 * driver accepted on the order, so FleetHub.UpdatePosition broadcasts DriverPositionChanged to
 * the order:{orderId} group the customer is subscribed to). Uses @microsoft/signalr over Long
 * Polling with the driver's staff JWT (which carries fleet_id). The first send beats the 3 s
 * server-side throttle. Resolves after the hub invocation returns.
 */
export async function sendDriverPosition(
  driverAccessToken: string,
  lat: number,
  lng: number,
): Promise<void> {
  // Dynamic import: @microsoft/signalr is a web dependency; loading it lazily keeps the helper
  // importable in contexts that never send a position.
  const signalr = await import('@microsoft/signalr')
  const conn = new signalr.HubConnectionBuilder()
    .withUrl('http://localhost:5249/hubs/fleet', {
      transport: signalr.HttpTransportType.LongPolling,
      accessTokenFactory: () => driverAccessToken,
    })
    .build()
  await conn.start()
  try {
    await conn.invoke('UpdatePosition', lat, lng, null, null)
  } finally {
    await conn.stop()
  }
}

/** Cancels an order via the customer JWT (records CancelledByRole=Customer). For setup/teardown. */
export async function customerCancelOrder(
  session: CustomerSession,
  orderId: string,
  reason = 'E2E customer cancel',
): Promise<void> {
  const res = await fetch(`${API_BASE}/orders/${orderId}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
      'X-Fleet-Slug': FLEET_SLUG,
    },
    body: JSON.stringify({ reason }),
  })
  if (!res.ok && res.status !== 409) {
    throw new Error(`customerCancelOrder failed: ${res.status} ${await res.text()}`)
  }
}
