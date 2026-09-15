import { authStorage } from './auth-storage'
import { idbAuthStore } from './idbAuthStore'
import { getFailureRedirectPath, isSilentRefreshEnabled, silentRefresh } from './refresh'
import type { OrderNotificationDto } from '../notifications/notificationStatus'

export type { OrderNotificationDto }

/** Typed error envelope matching the backend ValidationFailureExceptionHandler shape. */
export interface ApiError {
  status: number
  title: string
  type: string
  errors?: Array<{ name: string; reason: string; code: string }>
}

export class ApiResponseError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError,
  ) {
    super(body.title ?? `HTTP ${status}`)
    this.name = 'ApiResponseError'
  }
}

interface RequestOptions extends RequestInit {
  /**
   * When true, a 401 response does NOT clear storage or redirect to /dispatcher/login.
   * Use this on the login endpoint itself so credential errors render as form errors.
   */
  skipAuthRedirect?: boolean
  /**
   * Internal flag: true when this call is the retry after a silent refresh.
   * Prevents infinite recursion — a retried 401 does not trigger another refresh.
   */
  _isRetry?: boolean
}

const BASE_URL = (import.meta as ImportMeta & { env: { VITE_API_BASE_URL?: string } }).env
  ?.VITE_API_BASE_URL ?? '/api/v1'

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { skipAuthRedirect = false, _isRetry = false, ...fetchOptions } = options

  const headers = new Headers(fetchOptions.headers)

  const token = authStorage.getAccessToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const slug = authStorage.getFleetSlug()
  if (slug) {
    headers.set('X-Fleet-Slug', slug)
  }

  if (!headers.has('Content-Type') && fetchOptions.body) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...fetchOptions,
    headers,
  })

  if (response.status === 401 && !skipAuthRedirect) {
    // Driver flow: attempt silent refresh and retry once
    if (!_isRetry && isSilentRefreshEnabled()) {
      const refreshed = await silentRefresh()
      if (refreshed) {
        // Retry the original request with the new access token
        return apiRequest<T>(path, { ...options, _isRetry: true })
      }
      // silentRefresh already cleared storage and redirected to /driver/login
      return new Promise(() => undefined)
    }

    // Silent-refresh flow — retry itself got 401: clear both stores and redirect to the
    // caller's login. Role-aware via getFailureRedirectPath() (F2: previously hardcoded
    // /driver/login, which bounced a customer whose refresh failed to the DRIVER login).
    // Must check BEFORE the dispatcher fallthrough so IDB is always cleaned up.
    if (_isRetry && isSilentRefreshEnabled()) {
      authStorage.clear()
      await idbAuthStore.clear()
      window.location.href = getFailureRedirectPath() ?? '/driver/login'
      return new Promise(() => undefined)
    }

    // Dispatcher flow (unchanged): clear storage and redirect to /dispatcher/login
    authStorage.clear()
    window.location.href = '/dispatcher/login'
    // Return a never-resolved promise — navigation is underway
    return new Promise(() => undefined)
  }

  if (!response.ok) {
    let body: ApiError
    try {
      body = (await response.json()) as ApiError
    } catch {
      body = {
        status: response.status,
        title: response.statusText,
        type: `https://httpstatuses.com/${response.status}`,
      }
    }
    throw new ApiResponseError(response.status, body)
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------

export interface StaffLoginRequest {
  fleetSlug: string
  email: string
  password: string
}

export interface StaffUserDto {
  id: string
  email: string | null
  displayName: string
  role: string
}

export interface StaffLoginResponse {
  accessToken: string
  refreshToken: string
  user: StaffUserDto
}

export function postStaffLogin(req: StaffLoginRequest): Promise<StaffLoginResponse> {
  return apiRequest<StaffLoginResponse>('/auth/staff/login', {
    method: 'POST',
    body: JSON.stringify(req),
    skipAuthRedirect: true,
  })
}

/** Body of POST /auth/admin/login — fleetless SuperAdmin credentials (no slug). */
export interface AdminLoginRequest {
  email: string
  password: string
}

/**
 * POST /auth/admin/login (AllowAnonymous) — authenticate a fleetless SuperAdmin (UC-007 A7b).
 * Returns the same shape as staff login (StaffLoginResponse) with user.role === 'SuperAdmin'
 * and a token carrying NO fleet_id claim. skipAuthRedirect is MANDATORY: bad creds / a
 * non-SuperAdmin return 401 uniformly, and without this flag client.ts would clear storage and
 * bounce to /dispatcher/login, destroying the "invalid credentials" form error path.
 */
export function adminLogin(req: AdminLoginRequest): Promise<StaffLoginResponse> {
  return apiRequest<StaffLoginResponse>('/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify(req),
    skipAuthRedirect: true,
  })
}

// ---------------------------------------------------------------------------
// Public endpoints (AllowAnonymous — fleet resolved from X-Fleet-Slug)
// ---------------------------------------------------------------------------

/** Reduced public fleet branding DTO from GET public/fleet (AllowAnonymous). */
export interface PublicFleetResponse {
  name: string
  phone: string
  /** Brand primary color as #RRGGBB, or null to fall back to the default theme token. */
  primaryColorHex: string | null
  currency: string
  timeZone: string
  /**
   * Optional fleet welcome text for the customer PWA home (UC-007 A6, additive). Null when unset.
   * Reconciled byte-for-byte against the backend GetFleetResponse record.
   */
  welcomeText: string | null
  /**
   * Optional logo URL with a ?v=ticks cache-bust (UC-007 A6, additive). Null when no logo uploaded.
   * Served as a static file by Caddy in prod; the API only derives the path + exposes the URL.
   */
  logoUrl: string | null
}

/**
 * GET public/fleet — branding for the customer PWA before login.
 * AllowAnonymous; the fleet is resolved server-side from the X-Fleet-Slug header
 * (client.ts attaches it from authStorage), so the slug MUST be persisted first (F-05).
 */
export function getPublicFleet(): Promise<PublicFleetResponse> {
  return apiRequest<PublicFleetResponse>('/public/fleet')
}

// ---------------------------------------------------------------------------
// Geo tile configuration (Mapy.com) — GET geo/config (AllowAnonymous)
// ---------------------------------------------------------------------------

/**
 * Response for GET geo/config — the Mapy.com tile configuration for the current fleet.
 * camelCase mirror of the backend GeoConfigResponse (UC-010 WI-09). Carries ONLY the browser
 * key; the server key is structurally absent from the backend DTO.
 */
export interface GeoConfigResponse {
  /** Mapy raster tile URL template with {z}/{x}/{y} and {apikey} placeholders. */
  tileUrlTemplate: string
  /** Mapy browser API key for this fleet — the {apikey} value. */
  browserKey: string
  /** Mandatory Mapy attribution HTML for the Leaflet attribution control. */
  attributionHtml: string
  /** Default map center latitude for this fleet (WGS84). */
  mapCenterLat: number
  /** Default map center longitude for this fleet (WGS84). */
  mapCenterLng: number
  /** Default map zoom level for this fleet. */
  mapZoom: number
}

/**
 * GET geo/config — Mapy tile configuration for the current fleet.
 * AllowAnonymous (the customer tracking map must render before login); the fleet is resolved
 * server-side from the X-Fleet-Slug header (attached from authStorage). The backend sends
 * Cache-Control: max-age=604800 (7 days), so the query is cached long client-side too.
 */
export function getGeoConfig(): Promise<GeoConfigResponse> {
  return apiRequest<GeoConfigResponse>('/geo/config')
}

/**
 * Response for GET settings/geo-usage — this fleet's month-to-date geo API credit usage vs its
 * monthly budget (UC-010 WI-12, FleetAdmin only). camelCase mirror of the backend
 * GetGeoUsageResponse. Drives the dispatcher Settings credits panel (WI-17).
 */
export interface GeoUsageResponse {
  /** Sum of estimated credits consumed so far in the current Prague-local calendar month. */
  creditsUsedThisMonth: number
  /** The fleet's configured monthly geo credit budget (GeoMonthlyCreditBudget). */
  creditBudget: number
  /** Usage as a percentage of the budget, rounded to one decimal place. May exceed 100. */
  usagePercent: number
  /** Prague-local calendar year of the reported month. */
  year: number
  /** Prague-local calendar month of the reported data (1–12). */
  month: number
}

/**
 * GET settings/geo-usage — month-to-date geo credit consumption + budget for the current fleet.
 * FleetAdmin only (the backend enforces AuthorizationPolicies.FleetAdminOnly → 403 otherwise).
 */
export function getGeoUsage(): Promise<GeoUsageResponse> {
  return apiRequest<GeoUsageResponse>('/settings/geo-usage')
}

// ---------------------------------------------------------------------------
// Customer phone-code auth (AllowAnonymous — X-Fleet-Slug from authStorage)
// ---------------------------------------------------------------------------

export interface CustomerUserDto {
  id: string
  phone: string
  displayName: string
  role: string
}

export interface VerifyCustomerCodeResponse {
  accessToken: string
  refreshToken: string
  user: CustomerUserDto
}

/**
 * POST auth/customer/request-code — send a 6-digit SMS OTP to the phone.
 * skipAuthRedirect: a 429 rate-limit must render as a form message, never a redirect.
 */
export function requestCustomerCode(phone: string): Promise<void> {
  return apiRequest<void>('/auth/customer/request-code', {
    method: 'POST',
    body: JSON.stringify({ phone }),
    skipAuthRedirect: true,
  })
}

/**
 * POST auth/customer/verify-code — verify the OTP and return customer tokens.
 * skipAuthRedirect is MANDATORY: a wrong code returns 401, and without this flag
 * client.ts would clear storage / redirect (to /dispatcher/login or via silent refresh),
 * destroying the "Kód nesouhlasí" error path. The 401 surfaces as an ApiResponseError.
 */
export function verifyCustomerCode(phone: string, code: string): Promise<VerifyCustomerCodeResponse> {
  return apiRequest<VerifyCustomerCodeResponse>('/auth/customer/verify-code', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
    skipAuthRedirect: true,
  })
}

// ---------------------------------------------------------------------------
// Geo endpoints
// ---------------------------------------------------------------------------

/**
 * A single address suggestion from GET /geo/suggest (SuggestItemDto). Enriched by UC-010 WI-08:
 * `street` and `municipality` (the regional structure) let the UI distinguish two same-named
 * places — e.g. "Náměstí, Kolín" vs "Náměstí, Kutná Hora" (AC#2). Both are optional: an upstream
 * that omits them (or an older payload) still parses.
 */
export interface GeoSuggestItem {
  label: string
  /** Street line of the address, or null/absent when Mapy did not resolve one. */
  street?: string | null
  /** Municipality / town, or null/absent. Rendered alongside the label to disambiguate (AC#2). */
  municipality?: string | null
  lat: number
  lng: number
}

export interface GeoSuggestResponse {
  items: GeoSuggestItem[]
}

/**
 * Response for POST /geo/route (RouteResponse). Distance/duration are integers; estimatedPriceCzk
 * is server-priced (null when no default tariff). `geometry` is a simplified lat/lng polyline
 * (max 200 points) or null when unavailable — WI-17 draws it; WI-16 only threads the contract.
 */
export interface GeoRouteResponse {
  distanceMeters: number
  durationSeconds: number
  estimatedPriceCzk: number | null
  /** Simplified route polyline as [lat, lng] pairs (max 200 points), or null when unavailable. */
  geometry?: number[][] | null
}

/**
 * getGeoRoute arguments — kept FLAT (fromLat/fromLng/toLat/toLng) so every consumer
 * (useRouteEstimate, useOfferRoute) is unchanged; getGeoRoute transforms them into the backend's
 * nested POST body { from:{lat,lng}, to:{lat,lng} } at the client boundary.
 */
export interface GeoRouteRequest {
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
}

export function getGeoSuggest(q: string): Promise<GeoSuggestResponse> {
  const params = new URLSearchParams({ q })
  return apiRequest<GeoSuggestResponse>(`/geo/suggest?${params}`)
}

/**
 * POST /geo/route — route distance/duration/estimate + geometry. Migrated from the old
 * GET+query-string to a nested JSON body { from:{lat,lng}, to:{lat,lng} } (UC-010 WI-09); the
 * body coords are numbers, sidestepping the cs-CZ double query-binding locale trap (CLAUDE.md).
 * Throws ApiResponseError(502) Geo.RouteUnavailable when the upstream route is down — callers
 * degrade silently (never block the form).
 */
export function getGeoRoute(req: GeoRouteRequest): Promise<GeoRouteResponse> {
  return apiRequest<GeoRouteResponse>('/geo/route', {
    method: 'POST',
    body: JSON.stringify({
      from: { lat: req.fromLat, lng: req.fromLng },
      to: { lat: req.toLat, lng: req.toLng },
    }),
  })
}

// ---------------------------------------------------------------------------
// Pricing quote (POST — any authenticated role + anonymous-by-slug, A6/UC-006)
// ---------------------------------------------------------------------------

/**
 * A Fixed price: a route rule matched (PointToPoint/Zone/ZoneToZone). Carries the routeId
 * + routeName so the caller (dispatcher Otestovat panel, customer Zone order) can reference
 * the matched rule.
 */
export interface FixedPriceQuote {
  type: 'Fixed'
  /** Integer CZK locked price. */
  priceCzk: number
  /** The matched route's id. */
  routeId: string
  /** The matched route's display name. */
  routeName: string
}

/**
 * An Estimate RANGE: no route matched but a dropoff is known, so the backend priced via
 * OSRM + the fleet tariff (±10%, rounded to 10 CZK). The backend guarantees lowCzk < highCzk
 * so it is NEVER a single exact number (AC #4).
 */
export interface EstimatePriceQuote {
  type: 'Estimate'
  /** Lower bound of the estimate range (integer CZK). */
  lowCzk: number
  /** Upper bound of the estimate range (integer CZK), strictly greater than lowCzk. */
  highCzk: number
  /** Driving distance in km from the route computation. */
  distanceKm: number
  /** Driving duration in minutes from the route computation. */
  durationMin: number
  /**
   * Precision of the estimate (UC-010 WI-10): "Exact" = a real Mapy.com route (±10% band);
   * "Estimated" = the geo upstream was unavailable and a haversine×1.3 fallback was used —
   * the backend already returns the WIDER ±20% band and the UI labels it "orientační odhad"
   * (AC#5). Optional/absent → treated as Exact (backward compatible).
   */
  estimateMode?: 'Exact' | 'Estimated' | null
}

/**
 * A Meter fallback: no route matched AND no dropoff is known, so the price is whatever the
 * taximeter runs. Carries the fleet tariff summary so the UI can show the base/per-km rate.
 */
export interface MeterPriceQuote {
  type: 'Meter'
  /** Integer CZK pick-up / base fare. */
  baseCzk: number
  /** Integer CZK per-km rate. */
  perKmCzk: number
  /** Integer CZK minimum fare. */
  minimumCzk: number
}

/**
 * The POST /pricing/quote response, discriminated on `type` (A6/UC-006). Migrated from the
 * old GET QuoteResponse(priceType, fixedPriceCzk, estimateLow/HighCzk) — the field names
 * are byte-identical to the backend QuoteResponse (O-02).
 */
export type PriceQuoteResponse = FixedPriceQuote | EstimatePriceQuote | MeterPriceQuote

/**
 * POST /pricing/quote body. Coordinates ride in the JSON body as numbers — this sidesteps
 * the cs-CZ double query-binding locale trap (CLAUDE.md) that forced string params on the
 * old GET. Dropoff is optional; `at` (ISO timestamp) quotes at an arbitrary time so the
 * dispatcher Otestovat panel can verify a night-tariff route.
 */
export interface PriceQuoteRequest {
  pickupLat: number
  pickupLng: number
  dropoffLat?: number | null
  dropoffLng?: number | null
  /** Optional ISO timestamp to evaluate route validity at; omit → now. */
  at?: string | null
}

/**
 * POST /pricing/quote — a Fixed price, an Estimate range, or a Meter fallback for a
 * prospective order. Any authenticated role (Customer/Driver/Dispatcher/FleetAdmin) plus
 * anonymous-by-slug (X-Fleet-Slug header, attached by apiRequest). Throws
 * ApiResponseError(502) when the upstream route is unavailable — the caller surfaces the
 * "Cenu nelze spočítat, zavolejte nám" message.
 */
export function getPriceQuote(req: PriceQuoteRequest): Promise<PriceQuoteResponse> {
  const body: PriceQuoteRequest = {
    pickupLat: req.pickupLat,
    pickupLng: req.pickupLng,
  }
  if (req.dropoffLat != null && req.dropoffLng != null) {
    body.dropoffLat = req.dropoffLat
    body.dropoffLng = req.dropoffLng
  }
  if (req.at != null) {
    body.at = req.at
  }
  return apiRequest<PriceQuoteResponse>('/pricing/quote', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Customer routes + my-orders (CustomerOnly — X-Fleet-Slug + customer JWT)
// ---------------------------------------------------------------------------

/** Route type discriminator (matches the backend RouteType enum). */
export type RouteType = 'PointToPoint' | 'Zone' | 'ZoneToZone'

/**
 * A valid-now common route card (GET routes/common). Integer CZK price.
 *
 * laneA4b enriched the DTO: PointToPoint routes now carry real pickup/dropoff addresses
 * and coordinates (populated from the route) so a logged-out visitor can create an order
 * without geocoding (AC#1). Zone/ZoneToZone routes leave the coords null and expose the
 * zone references instead (the customer enters the in-zone address; coords come from
 * geocoding pre-06). All of these are optional because Zone-based routes omit them.
 */
export interface CommonRouteDto {
  id: string
  name: string
  type: RouteType
  priceCzk: number
  /** Pickup address (PointToPoint = the route name); null/absent for Zone-based routes. */
  pickupAddress?: string | null
  /** Pickup latitude (PointToPoint); null/absent for Zone-based routes. */
  pickupLat?: number | null
  /** Pickup longitude (PointToPoint); null/absent for Zone-based routes. */
  pickupLng?: number | null
  /** Dropoff address (PointToPoint, only when both dropoff coords exist); null otherwise. */
  dropoffAddress?: string | null
  /** Dropoff latitude (PointToPoint); null when not applicable. */
  dropoffLat?: number | null
  /** Dropoff longitude (PointToPoint); null when not applicable. */
  dropoffLng?: number | null
  /** Origin zone id (Zone / ZoneToZone); null for PointToPoint. */
  fromZoneId?: string | null
  /** Destination zone id (ZoneToZone); null otherwise. */
  toZoneId?: string | null
}

/**
 * Real A-common-routes contract (backend ListCommonRoutesResponse): rows are wrapped in a
 * named `{ routes: CommonRouteDto[] }` envelope, NOT the `{ items }` list convention.
 * Confirmed against docs/api.md + the ListCommonRoutes endpoint. The earlier `{ items }`
 * assumption produced an empty Home for logged-out visitors (laneB4f AC#1 blocker).
 */
export interface ListCommonRoutesResponse {
  routes: CommonRouteDto[]
}

/**
 * GET routes/common?validNow=true — the Home common-route cards (A-common-routes).
 * AllowAnonymous + tenant-scoped (X-Fleet-Slug); returns only routes valid at the current
 * Prague time. Unwraps the `{ routes }` envelope and returns the array directly.
 */
export async function getCommonRoutes(): Promise<CommonRouteDto[]> {
  const data = await apiRequest<ListCommonRoutesResponse>('/routes/common?validNow=true')
  return data.routes
}

/** Driver's last known position on a tracking DTO. */
export interface TrackPositionDto {
  lat: number
  lng: number
}

/**
 * Reduced tracking DTO shared by the authed (GET orders/by-code/{code}) and public
 * (GET public/track/{code}) paths. Deliberately minimal: no phone, no customer id,
 * no order id. EtaMinutes is always null pre-06 (OSRM deferred to assignment 06), so the
 * status headline omits "~min" until then. DisplayPriceCzk is present only on the public
 * payload; the authed path reads the price from the full order detail (getOrder).
 */
export interface TrackDto {
  publicCode: string
  status: string
  pickupAddress: string
  dropoffAddress: string | null
  scheduledAt: string | null
  driverFirstName: string | null
  vehiclePlate: string | null
  vehicleColor: string | null
  position: TrackPositionDto | null
  /** Minutes until pickup. Always null pre-06 (OSRM ETA deferred). */
  etaMinutes?: number | null
  /** Display price in CZK (public payload only); null when unknown. */
  displayPriceCzk?: number | null
}

/**
 * GET orders/by-code/{publicCode} — the AUTHED customer tracking DTO (CustomerOnly,
 * owner-only, X-Fleet-Slug from authStorage). Returns the reduced TrackDto; a 404 means
 * the order is unknown or the caller does not own it (no-leak). The order id is NOT in this
 * payload — the authed page resolves the id via getMyActiveOrder for SignalR Subscribe.
 */
export function getOrderByCode(publicCode: string): Promise<TrackDto> {
  return apiRequest<TrackDto>(`/orders/by-code/${encodeURIComponent(publicCode)}`)
}

/**
 * GET public/track/{code}?k={token} — the LOGGED-OUT (AllowAnonymous) tracking DTO for the
 * SMS link. The fleet is resolved from X-Fleet-Slug; the signed token binds the link to the
 * order + expiry. Returns the reduced TrackDto (with displayPriceCzk). A bad/missing/expired/
 * tampered token returns 410 Tracking.LinkExpired (ApiResponseError 410 — the caller shows
 * "Odkaz vypršel" + the call button); an unknown code returns 404. AllowAnonymous never 401s,
 * so it does not trigger the silent-refresh redirect.
 */
export function getPublicTrack(code: string, token: string): Promise<TrackDto> {
  const params = new URLSearchParams({ k: token })
  return apiRequest<TrackDto>(`/public/track/${encodeURIComponent(code)}?${params}`, {
    skipAuthRedirect: true,
  })
}

/** The caller's single active (non-terminal) order for the Home sticky banner. */
export interface MyActiveOrderDto {
  id: string
  publicCode: string
  status: string
}

/**
 * GET orders/mine/active — the caller's single non-terminal order, or null on 204
 * (A-my-orders). CustomerOnly + own-rows + tenant-safe. Returns null when the customer
 * has no active order so Home shows the routes block instead of the banner.
 */
export async function getMyActiveOrder(): Promise<MyActiveOrderDto | null> {
  const res = await apiRequest<MyActiveOrderDto | undefined>('/orders/mine/active')
  return res ?? null
}

/**
 * One row of the customer's order history (GET orders/mine, A-my-orders). Matches the backend
 * MyOrderListItemDto. Prices are integer CZK; timestamps are UTC ISO strings (render in
 * Europe/Prague). RatingStars is non-null once the order has been rated — B-rating uses it both
 * to resolve the order id (by publicCode) and to detect the already-rated state.
 */
export interface MyOrderHistoryItemDto {
  id: string
  publicCode: string
  status: string
  pickupAddress: string
  dropoffAddress: string | null
  priceType: string
  fixedPriceCzk: number | null
  finalPriceCzk: number | null
  ratingStars: number | null
  createdAt: string
  completedAt: string | null
}

/** Standard paged list envelope for the customer's order history. */
export interface MyOrderHistoryResponse {
  items: MyOrderHistoryItemDto[]
  total: number
  page: number
  pageSize: number
}

/**
 * GET orders/mine?page=&pageSize= — the customer's own order history, newest first
 * (A-my-orders, CustomerOnly, own-rows, tenant-safe). Paged { items, total, page, pageSize }.
 * Feeds B-history and supplies B-rating's order-id + already-rated lookup.
 */
export function getMyOrderHistory(page = 1, pageSize = 20): Promise<MyOrderHistoryResponse> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  return apiRequest<MyOrderHistoryResponse>(`/orders/mine?${params}`)
}

// ---------------------------------------------------------------------------
// Orders endpoints
// ---------------------------------------------------------------------------

export type PriceType = 'Estimate' | 'Fixed' | 'Meter'

export interface CreateOrderRequest {
  pickupAddress: string
  pickupLat: number
  pickupLng: number
  dropoffAddress?: string | null
  dropoffLat?: number | null
  dropoffLng?: number | null
  customerPhone?: string | null
  customerName?: string | null
  scheduledAt?: string | null
  note?: string | null
  passengers: number
  priceType: PriceType
  estimatedPriceCzk?: number | null
  fixedPriceCzk?: number | null
  routeId?: string | null
}

export interface CreateOrderResponse {
  order: OrderDetailDto
  /**
   * Tracking code for the logged-out SMS link, added by A-track (customer create only).
   * Optional so the type compiles whether or not A-track has merged; the customer is
   * authed post-create, so authed tracking works via order.publicCode without it.
   */
  trackingCode?: string
  /** HMAC tracking token for the logged-out link (A-track). Optional pre-merge. */
  trackingToken?: string
  /** Full tracking URL path /customer/t/{code}?k={token} (A-track). Optional pre-merge. */
  trackingUrlPath?: string
}

export function postCreateOrder(req: CreateOrderRequest): Promise<CreateOrderResponse> {
  return apiRequest<CreateOrderResponse>('/orders', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

export interface ListOrdersRequest {
  status?: string[]
  driverId?: string
  from?: string
  to?: string
  search?: string
  page?: number
  pageSize?: number
}

export interface OrderSummaryDto {
  id: string
  publicCode: string
  status: string
  source: string
  customerPhone: string
  customerName: string | null
  pickupAddress: string
  /** Pickup latitude. Not present in the current backend list projection — will be null/undefined until the backend exposes it. Used by B7 map pins when available. */
  pickupLat?: number | null
  /** Pickup longitude. Not present in the current backend list projection — will be null/undefined until the backend exposes it. */
  pickupLng?: number | null
  dropoffAddress: string | null
  scheduledAt: string | null
  passengers: number
  priceType: string
  estimatedPriceCzk: number | null
  fixedPriceCzk: number | null
  driverId: string | null
  createdAt: string
  /**
   * True when this order has at least one FAILED SMS notification (UC-005 §5, laneA5b, additive).
   * Drives the at-a-glance failed-SMS red icon on the dispatcher board card WITHOUT a per-order
   * detail fetch. Optional so the type compiles whether or not the backend field is present;
   * absent/undefined → treated as false (no icon). See OrderCard.showFailedSms.
   */
  hasFailedSms?: boolean
}

export interface ListOrdersResponse {
  items: OrderSummaryDto[]
  total: number
  page: number
  pageSize: number
}

export function getOrders(req: ListOrdersRequest = {}): Promise<ListOrdersResponse> {
  const params = new URLSearchParams()
  if (req.status && req.status.length > 0) {
    for (const s of req.status) {
      params.append('status', s)
    }
  }
  if (req.driverId) params.set('driverId', req.driverId)
  if (req.from) params.set('from', req.from)
  if (req.to) params.set('to', req.to)
  if (req.search) params.set('search', req.search)
  if (req.page != null) params.set('page', String(req.page))
  if (req.pageSize != null) params.set('pageSize', String(req.pageSize))
  const qs = params.toString()
  return apiRequest<ListOrdersResponse>(`/orders${qs ? `?${qs}` : ''}`)
}

export interface OrderDetailDto {
  id: string
  publicCode: string
  status: string
  source: string
  customerPhone: string
  customerName: string | null
  pickupAddress: string
  pickupLat: number
  pickupLng: number
  dropoffAddress: string | null
  dropoffLat: number | null
  dropoffLng: number | null
  scheduledAt: string | null
  note: string | null
  passengers: number
  priceType: string
  estimatedPriceCzk: number | null
  fixedPriceCzk: number | null
  finalPriceCzk: number | null
  paymentType: string | null
  driverId: string | null
  vehicleId: string | null
  createdAt: string
  updatedAt: string
  allowedActions: string[]
  version: number
  /** Customer star rating (1..5); null until rated (A-rating). */
  ratingStars?: number | null
  /** Optional customer rating comment; null unless provided (A-rating). */
  ratingComment?: string | null
  /** ISO timestamp when the customer rated the order; null until rated (A-rating). */
  ratedAt?: string | null
  /**
   * Sent/failed notification log items for this order (UC-005 A6, additive). Optional so the type
   * compiles whether or not A6 has merged; absent pre-merge. Drives the dispatcher Notifikace
   * section (B2) and the failed-SMS red icon on the order card.
   */
  notifications?: OrderNotificationDto[]
}

export interface TransitionOrderResponse {
  order: OrderDetailDto
}

export async function getOrder(orderId: string): Promise<OrderDetailDto> {
  // GET /orders/{id} returns the { order: OrderDetailDto } envelope (GetOrderResponse) —
  // unwrap it here so every caller receives a bare OrderDetailDto. Surfaced by the UC-003
  // driver E2E: without the unwrap, useRideRestore stored { order: {...} } and the ride
  // screen rendered blank fields + no action button (mirrors the CreateOrderResponse {order}
  // envelope fix in laneB11).
  const res = await apiRequest<{ order: OrderDetailDto }>(`/orders/${orderId}`)
  return res.order
}

export function postAssignOrder(orderId: string, driverId: string): Promise<TransitionOrderResponse> {
  return apiRequest<TransitionOrderResponse>(`/orders/${orderId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ driverId }),
  })
}

export function postReassignOrder(orderId: string, driverId: string): Promise<TransitionOrderResponse> {
  return apiRequest<TransitionOrderResponse>(`/orders/${orderId}/reassign`, {
    method: 'POST',
    body: JSON.stringify({ driverId }),
  })
}

export function postCancelOrder(orderId: string, reason: string): Promise<TransitionOrderResponse> {
  return apiRequest<TransitionOrderResponse>(`/orders/${orderId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

/** Body of POST orders/{id}/rating (A-rating). Stars 1..5; optional comment (max 500). */
export interface RateOrderRequest {
  stars: number
  comment?: string | null
}

/**
 * POST orders/{id}/rating — the owning customer rates their completed order once (A-rating,
 * CustomerOnly, owner-only). Returns 204 No Content on success. A 409 Order.AlreadyRated means
 * the order was already rated (the caller treats this as the already-rated state, not a crash);
 * a 409 Order.NotCompleted means it is not completed yet.
 */
export function rateOrder(orderId: string, req: RateOrderRequest): Promise<void> {
  return apiRequest<void>(`/orders/${orderId}/rating`, {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

export interface UpdateOrderRequest {
  version: number
  pickupAddress?: string | null
  pickupLat?: number | null
  pickupLng?: number | null
  dropoffAddress?: string | null
  dropoffLat?: number | null
  dropoffLng?: number | null
  scheduledAt?: string | null
  note?: string | null
  passengers?: number | null
}

/** PATCH /orders/{id} — partial edit, sends the loaded version for optimistic concurrency. */
export function patchOrder(orderId: string, req: UpdateOrderRequest): Promise<OrderDetailDto> {
  return apiRequest<OrderDetailDto>(`/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify(req),
  })
}

export interface OrderEventDto {
  type: string
  fromStatus: string | null
  toStatus: string
  actorRole: string
  at: string
  /** Raw JSON payload from the event. May contain: reason (Cancel), note (NoteAdded), priceOverride (PriceOverridden). */
  payload: Record<string, unknown> | null
}

/** GET /orders/{id}/events — returns the chronological event log for the order. */
export function getOrderEvents(orderId: string): Promise<OrderEventDto[]> {
  return apiRequest<OrderEventDto[]>(`/orders/${orderId}/events`)
}

// ---------------------------------------------------------------------------
// Drivers endpoints
// ---------------------------------------------------------------------------

export interface DriverSummaryDto {
  driverId: string
  displayName: string
  status: string
  currentVehiclePlate: string | null
  lastPositionAt: string | null
  lastLat: number | null
  lastLng: number | null
}

export interface ListDriversResponse {
  items: DriverSummaryDto[]
}

export function getDrivers(): Promise<ListDriversResponse> {
  return apiRequest<ListDriversResponse>('/drivers')
}

export interface OverrideDriverStatusRequest {
  status: 'Free' | 'Busy' | 'Offline'
}

/** POST /drivers/{id}/status — dispatcher manual status override (204 No Content). */
export function postOverrideDriverStatus(driverId: string, req: OverrideDriverStatusRequest): Promise<void> {
  return apiRequest<void>(`/drivers/${driverId}/status`, {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

// ---------------------------------------------------------------------------
// Vehicles endpoints (FleetAdmin)
// ---------------------------------------------------------------------------

export interface VehicleDto {
  id: string
  plate: string
  make: string
  model: string
  color: string
  seats: number
  isActive: boolean
}

export interface ListVehiclesResponse {
  items: VehicleDto[]
}

export interface CreateVehicleRequest {
  plate: string
  make: string
  model: string
  color: string
  seats: number
}

export interface UpdateVehicleRequest {
  plate: string
  make: string
  model: string
  color: string
  seats: number
}

export function getVehicles(): Promise<ListVehiclesResponse> {
  return apiRequest<ListVehiclesResponse>('/vehicles')
}

export function postCreateVehicle(req: CreateVehicleRequest): Promise<VehicleDto> {
  return apiRequest<VehicleDto>('/vehicles', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

export function putUpdateVehicle(vehicleId: string, req: UpdateVehicleRequest): Promise<VehicleDto> {
  return apiRequest<VehicleDto>(`/vehicles/${vehicleId}`, {
    method: 'PUT',
    body: JSON.stringify(req),
  })
}

export function deleteVehicle(vehicleId: string): Promise<void> {
  return apiRequest<void>(`/vehicles/${vehicleId}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Staff endpoints (FleetAdmin)
// ---------------------------------------------------------------------------

export interface StaffMemberDto {
  id: string
  displayName: string
  email: string | null
  role: string
  phone: string | null
  isActive: boolean
  lastLoginAt: string | null
}

export interface ListStaffResponse {
  items: StaffMemberDto[]
}

export interface CreateStaffRequest {
  email: string
  displayName: string
  role: string
  phone?: string | null
}

export interface CreateStaffResponse {
  id: string
  temporaryPassword: string
}

export interface UpdateStaffRequest {
  displayName: string
  phone?: string | null
  isActive: boolean
}

export interface ResetPasswordResponse {
  temporaryPassword: string
}

export function getStaff(): Promise<ListStaffResponse> {
  return apiRequest<ListStaffResponse>('/staff')
}

export function postCreateStaff(req: CreateStaffRequest): Promise<CreateStaffResponse> {
  return apiRequest<CreateStaffResponse>('/staff', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

export function putUpdateStaff(staffId: string, req: UpdateStaffRequest): Promise<StaffMemberDto> {
  return apiRequest<StaffMemberDto>(`/staff/${staffId}`, {
    method: 'PUT',
    body: JSON.stringify(req),
  })
}

export function deleteStaff(staffId: string): Promise<void> {
  return apiRequest<void>(`/staff/${staffId}`, {
    method: 'DELETE',
  })
}

export function postResetPassword(staffId: string): Promise<ResetPasswordResponse> {
  return apiRequest<ResetPasswordResponse>(`/staff/${staffId}/reset-password`, {
    method: 'POST',
  })
}

// ---------------------------------------------------------------------------
// Driver self-service endpoints (DriverOnly)
// ---------------------------------------------------------------------------

/** Response DTO for GET /drivers/me. */
export interface GetDriverMeResponse {
  driverId: string
  displayName: string
  /** 'Offline' | 'Free' | 'Busy' | 'EnRoute' */
  status: string
  currentVehicleId: string | null
  currentVehiclePlate: string | null
  lastPositionAt: string | null
  currentShiftId: string | null
  currentShiftStartedAt: string | null
  /** Non-terminal order id (Assigned/Accepted/Arrived/InProgress), or null. */
  activeOrderId: string | null
}

/** GET /drivers/me — driver's own profile and current shift info. */
export function getDriverMe(): Promise<GetDriverMeResponse> {
  return apiRequest<GetDriverMeResponse>('/drivers/me')
}

/** POST /drivers/me/online — go online with a vehicle. Returns 204 No Content. */
export function postGoOnline(vehicleId: string): Promise<void> {
  return apiRequest<void>('/drivers/me/online', {
    method: 'POST',
    body: JSON.stringify({ vehicleId }),
  })
}

/** POST /drivers/me/offline — go offline (end shift). Returns 204 No Content. */
export function postGoOffline(): Promise<void> {
  return apiRequest<void>('/drivers/me/offline', {
    method: 'POST',
  })
}

/** Response DTO for GET /drivers/me/summary. */
export interface GetDriverMySummaryResponse {
  ridesCount: number
  cashTotalCzk: number
  cardTotalCzk: number
  invoiceTotalCzk: number
  hoursOnline: number
}

/** GET /drivers/me/summary?date=YYYY-MM-DD — today's summary chips. */
export function getDriverMySummary(date?: string): Promise<GetDriverMySummaryResponse> {
  const params = date ? `?date=${encodeURIComponent(date)}` : ''
  return apiRequest<GetDriverMySummaryResponse>(`/drivers/me/summary${params}`)
}

/** A single ride in the driver's own orders list (GET /drivers/me/orders). */
export interface MyOrder {
  id: string
  publicCode: string
  /** 'Assigned' | 'Accepted' | 'Arrived' | 'InProgress' | 'Completed' | ... */
  status: string
  pickupAddress: string
  dropoffAddress: string | null
  /** 'Fixed' | 'Estimate' | 'Meter' */
  priceType: string
  /** Integer CZK; null for active (not-yet-completed) rides. */
  finalPriceCzk: number | null
  /** 'Cash' | 'Card' | 'Invoice'; null for active rides. */
  paymentType: string | null
  /** ISO UTC timestamp; null for active rides. */
  completedAt: string | null
}

/** Response DTO for GET /drivers/me/orders. */
export interface GetDriverMyOrdersResponse {
  orders: MyOrder[]
}

/**
 * GET /drivers/me/orders?date=YYYY-MM-DD — the driver's own completed AND active rides for a day.
 * Returns a wrapped object ({ orders: [...] }) per GetMyOrdersResponse; read data.orders.
 */
export function getDriverMyOrders(date?: string): Promise<GetDriverMyOrdersResponse> {
  const params = date ? `?date=${encodeURIComponent(date)}` : ''
  return apiRequest<GetDriverMyOrdersResponse>(`/drivers/me/orders${params}`)
}

/** POST /orders/{id}/accept — driver accepts an offered order. Returns 204 or order detail. */
export function postAcceptOrder(orderId: string): Promise<void> {
  return apiRequest<void>(`/orders/${orderId}/accept`, {
    method: 'POST',
  })
}

/** POST /orders/{id}/decline — driver declines an offered order. Returns 204. */
export function postDeclineOrder(orderId: string, reason: string): Promise<void> {
  return apiRequest<void>(`/orders/${orderId}/decline`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

/** POST /orders/{id}/arrive — driver has arrived at pickup. Returns updated order detail. */
export function postArriveOrder(orderId: string, idempotencyKey: string): Promise<TransitionOrderResponse> {
  return apiRequest<TransitionOrderResponse>(`/orders/${orderId}/arrive`, {
    method: 'POST',
    headers: { 'X-Idempotency-Key': idempotencyKey },
  })
}

/** POST /orders/{id}/start — driver starts the ride. Returns updated order detail. */
export function postStartOrder(orderId: string, idempotencyKey: string): Promise<TransitionOrderResponse> {
  return apiRequest<TransitionOrderResponse>(`/orders/${orderId}/start`, {
    method: 'POST',
    headers: { 'X-Idempotency-Key': idempotencyKey },
  })
}

export interface CompleteOrderRequest {
  finalPriceCzk: number
  paymentType: string
  overrideReason?: string
}

/** POST /orders/{id}/complete — completes the ride with final price and payment. Returns updated order detail. */
export function postCompleteOrder(
  orderId: string,
  req: CompleteOrderRequest,
  idempotencyKey: string,
): Promise<TransitionOrderResponse> {
  return apiRequest<TransitionOrderResponse>(`/orders/${orderId}/complete`, {
    method: 'POST',
    headers: { 'X-Idempotency-Key': idempotencyKey },
    body: JSON.stringify(req),
  })
}

/** POST /orders/{id}/cancel — driver cancels (e.g. no-show). Reason 'no-show' enforced server-side after ≥5 min. */
export function postDriverCancelOrder(orderId: string, reason: string, idempotencyKey: string): Promise<TransitionOrderResponse> {
  return apiRequest<TransitionOrderResponse>(`/orders/${orderId}/cancel`, {
    method: 'POST',
    headers: { 'X-Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ reason }),
  })
}

// ---------------------------------------------------------------------------
// Fleet settings endpoint (FleetAdmin)
// ---------------------------------------------------------------------------

export interface FleetSettingsDto {
  name: string
  phone: string
  offerTimeoutSeconds: number
  autoDispatchEnabled: boolean
  /**
   * Brand primary color as #RRGGBB, or null to fall back to the default theme token (UC-007 A7b).
   * GET /fleet/settings now round-trips the full editable set accepted by PUT, so the Fleet tab
   * prefills color/welcome/smsCap from here directly (no public/fleet workaround).
   */
  primaryColorHex?: string | null
  /** Fleet welcome text for the customer PWA home, or null when unset (UC-007 A7b). */
  welcomeText?: string | null
  /**
   * Monthly SMS cost cap in integer CZK (UC-005 §4, additive). Optional so the type compiles
   * whether or not the backend has exposed it on this endpoint; absent → the Settings SMS panel
   * is hidden. Default 500 server-side.
   */
  smsMonthlyCapCzk?: number
  /** Per-SMS unit cost in integer CZK (UC-005 §4, additive). Default 1 server-side. */
  smsUnitCostCzk?: number
  /** SMS count sent this month (UC-005 §4, additive, read-only). Absent → panel hidden. */
  smsSentThisMonth?: number
}

export function getFleetSettings(): Promise<FleetSettingsDto> {
  return apiRequest<FleetSettingsDto>('/fleet/settings')
}

// ---------------------------------------------------------------------------
// Web Push subscriptions (A2 /api/v1/push/subscriptions — all authenticated roles,
// multi-device, UserId-scoped; UC-005 B1)
// ---------------------------------------------------------------------------

/**
 * Body of POST /push/subscriptions — the browser PushSubscription decomposed into the fields the
 * backend stores (endpoint + the two encryption keys). `userAgent` is optional (device label).
 * Built by pushSubscriptionManager.toSubscribeRequest from a browser PushSubscriptionJSON.
 */
export interface PushSubscribeRequest {
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string
}

/**
 * POST /push/subscriptions — register (or upsert by endpoint) a Web Push subscription for the
 * calling user. Any authenticated role; multi-device. Returns 200/204 (the backend upserts by
 * (UserId, Endpoint) so re-subscribing the same browser is idempotent). No response body is used.
 */
export function pushSubscribe(req: PushSubscribeRequest): Promise<void> {
  return apiRequest<void>('/push/subscriptions', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

/**
 * DELETE /push/subscriptions — remove the calling user's subscription with this endpoint (on
 * unsubscribe/logout). Idempotent 204 — an unknown endpoint is a no-op, never a 404 leak.
 */
export function pushUnsubscribe(endpoint: string): Promise<void> {
  return apiRequest<void>('/push/subscriptions', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  })
}

// ---------------------------------------------------------------------------
// Zones CRUD (FleetAdmin — A4 /api/v1/zones, UC-006)
// ---------------------------------------------------------------------------

/** Zone shape discriminator (matches the backend ZoneShape enum). */
export type ZoneShape = 'Circle' | 'Polygon'

/** A single [lat, lng] coordinate pair on a polygon ring. */
export type ZonePolygonPoint = [number, number]

/**
 * A zone from GET /api/v1/zones (A4). A Circle carries centerLat/centerLng + radiusMeters
 * (polygon null); a Polygon carries a [lat,lng] point array (center/radius null). The
 * backend materializes the jsonb Polygon in memory before projecting (CLAUDE.md WI-10).
 */
export interface ZoneDto {
  id: string
  name: string
  shape: ZoneShape
  centerLat: number | null
  centerLng: number | null
  radiusMeters: number | null
  polygon: ZonePolygonPoint[] | null
  isEnabled: boolean
}

/**
 * List-zones response envelope. CONFIRMED against the real backend record
 * `ListZonesResponse(IReadOnlyList<ZoneDto> Zones)` → a NAMED `{ zones }` envelope, NOT the
 * `{ items }` list convention (the laneB6a assumption was wrong — the {routes}/{items}
 * envelope-bug class, CLAUDE.md). A fetch-mocked regression test in client.test.ts locks this.
 */
export interface ListZonesResponse {
  zones: ZoneDto[]
}

/** Create-zone body: per-shape fields (Circle → center+radius; Polygon → points). */
export interface CreateZoneRequest {
  name: string
  shape: ZoneShape
  centerLat?: number | null
  centerLng?: number | null
  radiusMeters?: number | null
  polygon?: ZonePolygonPoint[] | null
  isEnabled: boolean
}

/** Update-zone body (same shape as create). */
export type UpdateZoneRequest = CreateZoneRequest

/** GET /api/v1/zones — lists the fleet's zones (FleetAdmin, tenant-scoped). Unwraps `{ zones }`. */
export async function getZones(): Promise<ZoneDto[]> {
  const data = await apiRequest<ListZonesResponse>('/zones')
  return data.zones
}

/** POST /api/v1/zones — creates a zone. */
export function createZone(req: CreateZoneRequest): Promise<ZoneDto> {
  return apiRequest<ZoneDto>('/zones', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

/** PUT /api/v1/zones/{id} — updates a zone. */
export function updateZone(zoneId: string, req: UpdateZoneRequest): Promise<ZoneDto> {
  return apiRequest<ZoneDto>(`/zones/${zoneId}`, {
    method: 'PUT',
    body: JSON.stringify(req),
  })
}

/** DELETE /api/v1/zones/{id} — removes a zone. Returns 204. */
export function deleteZone(zoneId: string): Promise<void> {
  return apiRequest<void>(`/zones/${zoneId}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Routes admin CRUD (FleetAdmin — A5 /api/v1/routes, UC-006)
// ---------------------------------------------------------------------------

/**
 * An admin route (GET /api/v1/routes) — byte-for-byte the backend RouteAdminDto. Times are
 * serialized TimeOnly → "HH:mm:ss" strings (or null = all-day). Prices are integer CZK.
 * ValidDays is a bitmask (1=Mon … 64=Sun; 127 = all week). This is the ADMIN editor listing;
 * the anonymous customer listing is getCommonRoutes (a different endpoint + shape).
 */
export interface RouteAdminDto {
  id: string
  name: string
  type: RouteType
  priceCzk: number
  fromZoneId: string | null
  toZoneId: string | null
  fromLat: number
  fromLng: number
  toLat: number | null
  toLng: number | null
  fromRadiusMeters: number
  toRadiusMeters: number
  isBidirectional: boolean
  validDays: number
  /** Start of the validity window as "HH:mm:ss", or null for all-day. */
  validFromTime: string | null
  /** End of the validity window as "HH:mm:ss", or null for all-day. */
  validToTime: string | null
  priority: number
  isEnabled: boolean
}

/**
 * List-routes response envelope. CONFIRMED against the backend record
 * `ListRoutesResponse(IReadOnlyList<RouteAdminDto> Routes)` → a NAMED `{ routes }` envelope.
 */
export interface ListRoutesResponse {
  routes: RouteAdminDto[]
}

/**
 * Create/update body for a route (byte-for-byte the backend CreateRouteRequest /
 * UpdateRouteRequest). Required fields depend on `type`: PointToPoint → from/to coords +
 * radii; Zone → fromZoneId; ZoneToZone → fromZoneId + toZoneId. Times are "HH:mm:ss" or null.
 */
export interface CreateRouteRequest {
  name: string
  type: RouteType
  priceCzk: number
  fromZoneId?: string | null
  toZoneId?: string | null
  fromLat: number
  fromLng: number
  toLat?: number | null
  toLng?: number | null
  fromRadiusMeters: number
  toRadiusMeters: number
  isBidirectional: boolean
  validDays: number
  validFromTime?: string | null
  validToTime?: string | null
  priority: number
  isEnabled: boolean
}

/** Update-route body (same shape as create). */
export type UpdateRouteRequest = CreateRouteRequest

/** GET /api/v1/routes — lists admin routes ordered by priority desc. Unwraps `{ routes }`. */
export async function getRoutes(): Promise<RouteAdminDto[]> {
  const data = await apiRequest<ListRoutesResponse>('/routes')
  return data.routes
}

/** POST /api/v1/routes — creates a route. Returns only the new id (CreateRouteResponse). */
export function createRoute(req: CreateRouteRequest): Promise<{ id: string }> {
  return apiRequest<{ id: string }>('/routes', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

/** PUT /api/v1/routes/{id} — full update. Returns the updated RouteAdminDto. */
export function updateRoute(routeId: string, req: UpdateRouteRequest): Promise<RouteAdminDto> {
  return apiRequest<RouteAdminDto>(`/routes/${routeId}`, {
    method: 'PUT',
    body: JSON.stringify(req),
  })
}

/** DELETE /api/v1/routes/{id} — soft delete (sets DeletedAt). Returns 204. */
export function deleteRoute(routeId: string): Promise<void> {
  return apiRequest<void>(`/routes/${routeId}`, {
    method: 'DELETE',
  })
}

/** PATCH /api/v1/routes/{id}/enable — toggle IsEnabled. Returns 204. */
export function setRouteEnabled(routeId: string, isEnabled: boolean): Promise<void> {
  return apiRequest<void>(`/routes/${routeId}/enable`, {
    method: 'PATCH',
    body: JSON.stringify({ isEnabled }),
  })
}

/** PATCH /api/v1/routes/{id}/priority — set Priority. Returns 204. */
export function setRoutePriority(routeId: string, priority: number): Promise<void> {
  return apiRequest<void>(`/routes/${routeId}/priority`, {
    method: 'PATCH',
    body: JSON.stringify({ priority }),
  })
}

// ---------------------------------------------------------------------------
// Places CRUD (FleetAdmin — A2 /api/v1/places, UC-006)
// ---------------------------------------------------------------------------

/** A named place (GET /api/v1/places) — byte-for-byte the backend PlaceDto, ordered by sortOrder. */
export interface PlaceDto {
  id: string
  name: string
  lat: number
  lng: number
  address: string
  sortOrder: number
  isEnabled: boolean
}

/**
 * List-places response envelope. CONFIRMED against the backend record
 * `ListPlacesResponse(IReadOnlyList<PlaceDto> Places)` → a NAMED `{ places }` envelope.
 */
export interface ListPlacesResponse {
  places: PlaceDto[]
}

/** Create/update body for a place (byte-for-byte the backend CreatePlaceRequest / UpdatePlaceRequest). */
export interface CreatePlaceRequest {
  name: string
  lat: number
  lng: number
  address: string
  sortOrder: number
  isEnabled: boolean
}

/** Update-place body (same shape as create). */
export type UpdatePlaceRequest = CreatePlaceRequest

/** GET /api/v1/places — lists places ordered by sortOrder. Unwraps `{ places }`. */
export async function getPlaces(): Promise<PlaceDto[]> {
  const data = await apiRequest<ListPlacesResponse>('/places')
  return data.places
}

/** POST /api/v1/places — creates a place. Returns the created place (CreatePlaceResponse). */
export function createPlace(req: CreatePlaceRequest): Promise<PlaceDto> {
  return apiRequest<PlaceDto>('/places', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

/** PUT /api/v1/places/{id} — full update. Returns the updated PlaceDto. */
export function updatePlace(placeId: string, req: UpdatePlaceRequest): Promise<PlaceDto> {
  return apiRequest<PlaceDto>(`/places/${placeId}`, {
    method: 'PUT',
    body: JSON.stringify(req),
  })
}

/** DELETE /api/v1/places/{id} — hard delete. Returns 204. */
export function deletePlace(placeId: string): Promise<void> {
  return apiRequest<void>(`/places/${placeId}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Reports endpoints (UC-007 — FleetAdmin)
//
// REAL CONTRACTS (reconciled byte-for-byte against the laneA7 backend records
// GetDriverReportResponse / DriverReportDayDto / GetFleetReportResponse /
// FleetKpiDto / RidesPerDayDto / TopRouteDto / GetRatingsResponse / RatingDto).
// The named-envelope/field-name unwrap bug class (CLAUDE.md) has bitten 4× — each
// getter below is locked by a fetch-mocked regression test in client.test.ts.
// ---------------------------------------------------------------------------

/**
 * A single Prague-local day row in the driver report. Money fields are integer CZK.
 * The totals row reuses this same shape with `date: 'Celkem'`.
 */
export interface DriverReportDayDto {
  /** Prague-local calendar day as an ISO date string (yyyy-MM-dd); 'Celkem' on the totals row. */
  date: string
  ridesCompleted: number
  ridesCancelled: number
  cashCzk: number
  cardCzk: number
  invoiceCzk: number
  totalCzk: number
  hoursOnline: number
  priceOverrideCount: number
}

/** GET /api/v1/reports/drivers response (byte-for-byte GetDriverReportResponse). */
export interface DriverReportResponse {
  driverId: string
  driverName: string
  /** Average rating over completed+rated orders in range, or null when none rated. */
  avgRating: number | null
  days: DriverReportDayDto[]
  /** Summed totals row across the range — a DriverReportDayDto with `date: 'Celkem'`. */
  totals: DriverReportDayDto
}

export interface DriverReportFilters {
  driverId?: string | null
  /** Inclusive Prague-local start day, ISO yyyy-MM-dd. */
  from: string
  /** Inclusive Prague-local end day, ISO yyyy-MM-dd. */
  to: string
}

function driverReportParams(filters: DriverReportFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.driverId) params.set('driverId', filters.driverId)
  params.set('from', filters.from)
  params.set('to', filters.to)
  return params
}

/**
 * GET /api/v1/reports/drivers — per-Prague-day driver report for one driver, with a totals
 * row, average rating, and driver name. Envelope `{ driverId, driverName, avgRating, days, totals }`.
 */
export function getDriverReport(filters: DriverReportFilters): Promise<DriverReportResponse> {
  return apiRequest<DriverReportResponse>(`/reports/drivers?${driverReportParams(filters)}`)
}

/**
 * A single KPI block for the fleet report. Money is integer CZK; the app/phone/fixed-route
 * fields are RAW COUNTS (the UI derives shares client-side). Times are seconds and nullable.
 */
export interface FleetKpiDto {
  rides: number
  revenueCzk: number
  avgPriceCzk: number
  /** Average created→assigned time, in seconds; null when no orders were assigned. */
  avgTimeToAssignSeconds: number | null
  /** Average accepted→arrived time, in seconds; null when none. */
  avgTimeToPickupSeconds: number | null
  /** Cancellation rate as a fraction 0..1. */
  cancellationRate: number
  /** Count of orders placed via the app. */
  appOrders: number
  /** Count of orders placed by phone or dispatcher. */
  phoneOrders: number
  /** Count of orders priced by a common route. */
  fixedRouteOrders: number
  smsCount: number
  smsCostCzk: number
}

/** A single Prague-local day bucket for the rides-per-day chart. */
export interface RidesPerDayDto {
  /** Prague-local calendar day, ISO yyyy-MM-dd. */
  date: string
  count: number
}

/** A top-route row by ride count. */
export interface TopRouteDto {
  routeId: string
  name: string
  count: number
}

/** GET /api/v1/reports/fleet response (byte-for-byte GetFleetReportResponse). */
export interface FleetReportResponse {
  kpis: FleetKpiDto
  ridesPerDay: RidesPerDayDto[]
  topRoutes: TopRouteDto[]
}

export interface FleetReportFilters {
  from: string
  to: string
}

// ── Analytics ─────────────────────────────────────────────────────────────────

/**
 * KPI values for one analytics period (current or prior).
 * Byte-for-byte mirror of OverviewKpiDto from the backend.
 */
export interface OverviewKpiDto {
  rides: number
  revenueCzk: number
  aov: number
  fulfillmentRate: number
  cancellationRate: number
  activeCustomers: number
  newCustomers: number
  activeDrivers: number
  onlineDriverHours: number
  revenuePerOnlineHour: number
  avgRating: number | null
}

/**
 * Absolute deltas (current − prior) for each KPI when compare=true.
 * Byte-for-byte mirror of OverviewDeltaDto from the backend.
 */
export interface OverviewDeltaDto {
  rides: number
  revenueCzk: number
  aov: number
  fulfillmentRate: number
  cancellationRate: number
  activeCustomers: number
  newCustomers: number
  activeDrivers: number
  onlineDriverHours: number
  revenuePerOnlineHour: number
  avgRating: number | null
}

/** One time-granularity bucket in the trend series. */
export interface TrendBucketDto {
  bucket: string
  rides: number
  revenueCzk: number
}

/**
 * Response envelope for GET /api/v1/analytics/overview.
 * Byte-for-byte mirror of GetOverviewResponse from the backend.
 */
export interface AnalyticsOverviewResponse {
  current: OverviewKpiDto
  prior: OverviewKpiDto | null
  deltas: OverviewDeltaDto | null
  series: TrendBucketDto[]
}

/** Query parameters for the analytics overview endpoint. */
export interface AnalyticsOverviewParams {
  from: string
  to: string
  granularity: 'day' | 'week' | 'month'
  compare: boolean
}

/**
 * GET /api/v1/analytics/overview — KPI cards + deltas + trend series.
 * Returns the bare envelope `{ current, prior, deltas, series }`.
 */
export function getAnalyticsOverview(params: AnalyticsOverviewParams): Promise<AnalyticsOverviewResponse> {
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
    granularity: params.granularity,
    compare: String(params.compare),
  })
  return apiRequest<AnalyticsOverviewResponse>(`/analytics/overview?${qs}`)
}

// ── Analytics – Demand ────────────────────────────────────────────────────────

/** One cell of the hour×DOW demand heatmap (Prague local time). */
export interface HeatmapCellDto {
  hour: number
  dow: number
  count: number
}

/** Supply vs demand for one Prague hour-of-day across the window. */
export interface SupplyDemandBucketDto {
  hour: number
  ordersCreated: number
  onlineSeconds: number
  fulfillmentRate: number
}

/** Unmet demand (cancelled with no Accepted event) for one Prague hour-of-day. */
export interface UnmetDemandBucketDto {
  hour: number
  unmetCount: number
}

/** Utilization for a single driver. */
export interface DriverUtilizationDto {
  driverId: string
  busySeconds: number
  onlineSeconds: number
  utilization: number
}

/** Fleet-wide + per-driver utilization. */
export interface UtilizationDto {
  fleetUtilization: number
  perDriver: DriverUtilizationDto[]
}

/** Pickup count for one zone. */
export interface ZonePickupDto {
  zoneId: string
  zoneName: string
  pickupCount: number
}

/** A frequently occurring pickup→dropoff address pair (demand analytics context). */
export interface DemandTopRouteDto {
  pickupAddress: string
  dropoffAddress: string
  count: number
}

/** Prior-period demand sections (all fields same as the main response, minus `prior`). */
export interface DemandPriorDto {
  heatmap: HeatmapCellDto[]
  supplyDemand: SupplyDemandBucketDto[]
  unmetDemand: UnmetDemandBucketDto[]
  utilization: UtilizationDto
  zonePickups: ZonePickupDto[]
  topRoutes: DemandTopRouteDto[]
}

/**
 * Response envelope for GET /api/v1/analytics/demand.
 * Byte-for-byte mirror of GetDemandResponse from the backend.
 */
export interface AnalyticsDemandResponse {
  heatmap: HeatmapCellDto[]
  supplyDemand: SupplyDemandBucketDto[]
  unmetDemand: UnmetDemandBucketDto[]
  utilization: UtilizationDto
  zonePickups: ZonePickupDto[]
  topRoutes: DemandTopRouteDto[]
  prior: DemandPriorDto | null
}

/** Query parameters for the analytics demand endpoint (same shape as overview). */
export type AnalyticsDemandParams = AnalyticsOverviewParams

/**
 * GET /api/v1/analytics/demand — demand heatmap, supply/unmet, utilization, zones, routes.
 */
export function getAnalyticsDemand(params: AnalyticsDemandParams): Promise<AnalyticsDemandResponse> {
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
    granularity: params.granularity,
    compare: String(params.compare),
  })
  return apiRequest<AnalyticsDemandResponse>(`/analytics/demand?${qs}`)
}

// ── Analytics – Operations ────────────────────────────────────────────────────

/**
 * SLA percentiles for one metric (non-null values — entire object is null when no data).
 * Byte-for-byte mirror of SlaPercentileDto from the backend.
 */
export interface SlaPercentileDto {
  /** p50 (median) in seconds. */
  median: number
  /** p90 in seconds. */
  p90: number
  /** Number of qualifying orders the percentile was computed from. */
  sampleCount: number
}

/**
 * SLA metrics for the window — each field null when no qualifying rows exist.
 * Byte-for-byte mirror of OperationsSlaDto from the backend.
 */
export interface OperationsSlaDto {
  /** Created→assigned SLA; null when no orders were assigned in the window. */
  timeToAssign: SlaPercentileDto | null
  /** Assigned→accepted SLA; null when no offers were accepted. */
  timeToAccept: SlaPercentileDto | null
  /** Accepted→arrived SLA; null when no pickups were completed. */
  timeToPickup: SlaPercentileDto | null
  /** Started→completed SLA (ride duration); null when no rides completed. */
  rideDuration: SlaPercentileDto | null
}

/**
 * Offer funnel counts for the window.
 * Byte-for-byte mirror of OfferFunnelDto from the backend.
 */
export interface OfferFunnelDto {
  /** Total offers made (Assigned + Reassigned events). */
  offersMade: number
  accepted: number
  declined: number
  timeouts: number
  /** Average number of offers made per completed ride. */
  avgOffersPerCompleted: number
}

/**
 * Lifecycle funnel counts for the window.
 * Byte-for-byte mirror of LifecycleFunnelDto from the backend.
 */
export interface LifecycleFunnelDto {
  created: number
  assigned: number
  accepted: number
  arrived: number
  inProgress: number
  completed: number
}

/** Cancellations broken down by actor role. */
export interface CancellationByRoleDto {
  role: string
  count: number
}

/** Cancellations broken down by order status at cancel time. */
export interface CancellationByStatusDto {
  status: string
  count: number
}

/** Cancellations broken down by Prague hour-of-day. */
export interface CancellationByHourDto {
  hour: number
  count: number
}

/**
 * Cancellation breakdown for the window.
 * Byte-for-byte mirror of CancellationBreakdownDto from the backend.
 */
export interface CancellationBreakdownDto {
  byRole: CancellationByRoleDto[]
  byStatusAtCancel: CancellationByStatusDto[]
  byHour: CancellationByHourDto[]
  /** Share of cancellations that happened after Arrived (no-shows), 0..1. */
  noShowShare: number
}

/**
 * Prior-period operations sections (compare=true only).
 * Byte-for-byte mirror of GetOperationsPriorDto from the backend.
 */
export interface OperationsPriorDto {
  sla: OperationsSlaDto
  offerFunnel: OfferFunnelDto
  lifecycle: LifecycleFunnelDto
  cancellations: CancellationBreakdownDto
}

/**
 * Response envelope for GET /api/v1/analytics/operations.
 * Byte-for-byte mirror of GetOperationsResponse from the backend.
 */
export interface AnalyticsOperationsResponse {
  sla: OperationsSlaDto
  offerFunnel: OfferFunnelDto
  lifecycle: LifecycleFunnelDto
  cancellations: CancellationBreakdownDto
  /** Prior-period data for delta badges; null when compare=false. */
  prior: OperationsPriorDto | null
}

/** Query parameters for the analytics operations endpoint (same shape as overview). */
export type AnalyticsOperationsParams = AnalyticsOverviewParams

/**
 * GET /api/v1/analytics/operations — SLA percentiles, offer funnel, lifecycle funnel, cancellations.
 */
export function getAnalyticsOperations(params: AnalyticsOperationsParams): Promise<AnalyticsOperationsResponse> {
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
    granularity: params.granularity,
    compare: String(params.compare),
  })
  return apiRequest<AnalyticsOperationsResponse>(`/analytics/operations?${qs}`)
}

// ── Analytics Revenue ─────────────────────────────────────────────────────────

/** Revenue per time bucket, stacked by payment type and split by order source / price type. */
export interface RevenueBucketDto {
  /** Bucket start date (yyyy-MM-dd) from date_trunc. */
  bucket: string
  /** Total completed revenue in CZK for this bucket. */
  totalCzk: number
  /** Number of completed rides in this bucket. */
  rides: number
  /** Revenue from cash payment orders. */
  cashCzk: number
  /** Revenue from card payment orders. */
  cardCzk: number
  /** Revenue from invoice (account) payment orders. */
  invoiceCzk: number
  /** Revenue from app-source orders (OrderSource=App). */
  appCzk: number
  /** Revenue from phone-source orders (OrderSource=Phone). */
  phoneCzk: number
  /** Revenue from dispatcher-created orders (OrderSource=Dispatcher). */
  dispatcherCzk: number
  /** Revenue from meter-priced orders. */
  meterCzk: number
  /** Revenue from fixed-price orders. */
  fixedCzk: number
  /** Revenue from estimate-price orders (PriceType=Estimate). */
  estimateCzk: number
}

/** Average order value for one time bucket. */
export interface AovTrendBucketDto {
  /** Bucket start date (yyyy-MM-dd). */
  bucket: string
  /** Average final_price_czk of completed orders in this bucket (0 when no completed orders). */
  aovCzk: number
}

/** One price-override reason with its frequency count. */
export interface OverrideReasonDto {
  /** The override reason text. */
  reason: string
  /** Number of orders with this reason in the window. */
  count: number
}

/** Aggregate impact of price overrides in the window. */
export interface PriceOverrideImpactDto {
  /** Number of completed orders where final price differed from the fixed/estimated price. */
  count: number
  /** Sum of (FinalPriceCzk − reference price) across overridden orders (positive = higher than quoted). */
  totalDeltaCzk: number
  /** Most common override reasons by frequency. */
  topReasons: OverrideReasonDto[]
}

/** A top revenue-generating pickup→dropoff route. */
export interface RevenueTopRouteDto {
  /** Pickup address string. */
  pickupAddress: string
  /** Dropoff address string. */
  dropoffAddress: string
  /** Number of completed rides on this route in the window. */
  rides: number
  /** Total revenue (CZK) on this route in the window. */
  revenueCzk: number
  /** Average order value (CZK) on this route (0 when no rides). */
  aovCzk: number
}

/** Revenue, ride count, and average value for one zone. */
export interface ZoneRevenueDto {
  /** Zone entity ID. */
  zoneId: string
  /** Zone display name. */
  zoneName: string
  /** Number of completed rides with a pickup inside the zone bounding box. */
  rides: number
  /** Total revenue from those rides. */
  revenueCzk: number
  /** Average order value across those rides (0 when no rides). */
  aovCzk: number
}

/** SMS cost for one time bucket. */
export interface SmsCostBucketDto {
  /** Bucket start date (yyyy-MM-dd). */
  bucket: string
  /** Number of SMS notifications sent (Channel=Sms, Status=Sent) with CreatedAt in this bucket. */
  smsCount: number
  /** SmsCount × SmsUnitCostCzk from FleetSettings (1 CZK default if no FleetSettings row). */
  costCzk: number
}

/** Prior-period revenue data (all 6 sections). */
export interface AnalyticsRevenuePriorDto {
  series: RevenueBucketDto[]
  aovTrend: AovTrendBucketDto[]
  priceOverride: PriceOverrideImpactDto
  topRoutes: RevenueTopRouteDto[]
  zoneRevenue: ZoneRevenueDto[]
  smsCost: SmsCostBucketDto[]
}

/** Response envelope for GET /api/v1/analytics/revenue. */
export interface AnalyticsRevenueResponse {
  /** Revenue per bucket, stacked by payment type. */
  series: RevenueBucketDto[]
  /** AOV trend per bucket. */
  aovTrend: AovTrendBucketDto[]
  /** Price override aggregate impact. */
  priceOverride: PriceOverrideImpactDto
  /** Top pickup→dropoff routes by revenue. */
  topRoutes: RevenueTopRouteDto[]
  /** Revenue per zone (bounding-box pickup attribution). */
  zoneRevenue: ZoneRevenueDto[]
  /** SMS cost per bucket. */
  smsCost: SmsCostBucketDto[]
  /** Prior-period data; null when compare=false. */
  prior: AnalyticsRevenuePriorDto | null
}

/** Query parameters for the analytics revenue endpoint (same shape as overview). */
export type AnalyticsRevenueParams = AnalyticsOverviewParams

/**
 * GET /api/v1/analytics/revenue — revenue stacked by payment type, source/price-type splits,
 * AOV trend, price override impact, top routes/zones, SMS cost line.
 */
export function getAnalyticsRevenue(params: AnalyticsRevenueParams): Promise<AnalyticsRevenueResponse> {
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
    granularity: params.granularity,
    compare: String(params.compare),
  })
  return apiRequest<AnalyticsRevenueResponse>(`/analytics/revenue?${qs}`)
}

// ── Analytics: Drivers ────────────────────────────────────────────────────────

/** One driver's aggregate metrics across the analytics window. */
export interface DriverLeagueRowDto {
  driverId: string
  name: string
  ridesCompleted: number
  revenueCzk: number
  onlineHours: number
  utilizationPct: number
  revenuePerOnlineHour: number
  acceptanceRate: number
  avgTimeToAcceptSeconds: number
  declinesAndTimeouts: number
  cancellations: number
  noShows: number
  avgRating: number | null
}

/** Driver retention counts for one ISO calendar week. */
export interface RetentionBucketDto {
  weekStart: string
  active: number
  newlyActivated: number
  churned: number
}

/** Prior-period drivers + retention data (when compare=true). */
export interface GetDriversPriorDto {
  drivers: DriverLeagueRowDto[]
  retention: RetentionBucketDto[]
}

/** Response for GET /api/v1/analytics/drivers. */
export interface AnalyticsDriversResponse {
  drivers: DriverLeagueRowDto[]
  retention: RetentionBucketDto[]
  prior: GetDriversPriorDto | null
}

/** Query parameters for analytics/drivers (same shape as overview). */
export type AnalyticsDriversParams = AnalyticsOverviewParams

/**
 * GET /api/v1/analytics/drivers — driver league table, retention series, and optional prior period.
 */
export function getAnalyticsDrivers(params: AnalyticsDriversParams): Promise<AnalyticsDriversResponse> {
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
    granularity: params.granularity,
    compare: String(params.compare),
  })
  return apiRequest<AnalyticsDriversResponse>(`/analytics/drivers?${qs}`)
}

/** Driver metrics for one ISO week (drill-down weekly trend). */
export interface DriverWeeklyTrendDto {
  weekStart: string
  ridesCompleted: number
  revenueCzk: number
  avgRating: number | null
}

/** A completed order with a low customer rating (≤ 3 stars), for coaching purposes. */
export interface LowRatedOrderDto {
  orderId: string
  completedAt: string
  ratingStars: number
  ratingComment: string | null
  publicCode: string
  pickupAddress: string
  dropoffAddress: string | null
}

/** Response for GET /api/v1/analytics/drivers/{id}. */
export interface AnalyticsDriverDrilldownResponse {
  driverId: string
  name: string
  weeklyTrend: DriverWeeklyTrendDto[]
  lowRatedOrders: LowRatedOrderDto[]
}

/** Query parameters for the driver drill-down endpoint. */
export type AnalyticsDriverDrilldownParams = AnalyticsOverviewParams

/**
 * GET /api/v1/analytics/drivers/{id} — driver drill-down: weekly trend and low-rated orders.
 */
export function getAnalyticsDriverDrilldown(
  id: string,
  params: AnalyticsDriverDrilldownParams,
): Promise<AnalyticsDriverDrilldownResponse> {
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
    granularity: params.granularity,
    compare: String(params.compare),
  })
  return apiRequest<AnalyticsDriverDrilldownResponse>(`/analytics/drivers/${id}?${qs}`)
}

// ── Analytics: Customers ──────────────────────────────────────────────────────

/** New vs returning ride counts for a time bucket. */
export interface NewVsReturningBucketDto {
  bucket: string
  newRides: number
  returningRides: number
}

/** One row in the monthly cohort retention triangle. */
export interface CustomerCohortRowDto {
  acqMonthLabel: string
  monthsSince: number
  activeCustomers: number
}

/** A top customer by rides and revenue. */
export interface TopCustomerDto {
  customerUserId: string | null
  customerPhone: string | null
  customerName: string | null
  rides: number
  revenueCzk: number
}

/** Count of completed rides with a specific star rating. */
export interface RatingBucketDto {
  stars: number
  count: number
}

/** Average rating for a time bucket. */
export interface RatingTrendBucketDto {
  bucket: string
  rides: number
  avgRating: number | null
}

/** A worst-rated completed order (≤3 stars) for complaint follow-up. */
export interface WorstRatedOrderDto {
  orderId: string
  publicCode: string
  completedAt: string
  ratingStars: number
  ratingComment: string | null
  driverName: string | null
}

/** Ratings analysis for the analytics window. */
export interface RatingsAnalysisDto {
  totalRated: number
  avgRating: number | null
  distribution: RatingBucketDto[]
  avgTrend: RatingTrendBucketDto[]
  worstRated: WorstRatedOrderDto[]
}

/** Prior-period customer data (when compare=true). */
export interface GetCustomersPriorDto {
  totalRides: number
  totalRevenueCzk: number
  newIdentities: number
  returningIdentities: number
  repeatRate: number
  freqOne: number
  freqTwoToFive: number
  freqSixPlus: number
  newVsReturningBuckets: NewVsReturningBucketDto[]
  cohortRows: CustomerCohortRowDto[]
  topCustomers: TopCustomerDto[]
  ratings: RatingsAnalysisDto
}

/** Response for GET /api/v1/analytics/customers. */
export interface AnalyticsCustomersResponse {
  totalRides: number
  totalRevenueCzk: number
  newIdentities: number
  returningIdentities: number
  repeatRate: number
  freqOne: number
  freqTwoToFive: number
  freqSixPlus: number
  newVsReturningBuckets: NewVsReturningBucketDto[]
  cohortRows: CustomerCohortRowDto[]
  topCustomers: TopCustomerDto[]
  ratings: RatingsAnalysisDto
  prior: GetCustomersPriorDto | null
}

/** Query parameters for the analytics customers endpoint (same shape as overview). */
export type AnalyticsCustomersParams = AnalyticsOverviewParams

/**
 * GET /api/v1/analytics/customers — customer behaviour analytics:
 * new vs returning, frequency distribution, cohort triangle, top customers, ratings analysis.
 */
export function getAnalyticsCustomers(params: AnalyticsCustomersParams): Promise<AnalyticsCustomersResponse> {
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
    granularity: params.granularity,
    compare: String(params.compare),
  })
  return apiRequest<AnalyticsCustomersResponse>(`/analytics/customers?${qs}`)
}

/**
 * GET /api/v1/reports/fleet — KPIs + rides-per-day series + top routes.
 * Envelope `{ kpis, ridesPerDay, topRoutes }`.
 */
export function getFleetReport(filters: FleetReportFilters): Promise<FleetReportResponse> {
  const params = new URLSearchParams({ from: filters.from, to: filters.to })
  return apiRequest<FleetReportResponse>(`/reports/fleet?${params}`)
}

/** A single rating row (byte-for-byte RatingDto). */
export interface RatingDto {
  orderPublicCode: string
  driverName: string | null
  stars: number
  comment: string | null
  /** ISO UTC timestamp when the rating was left; null when unknown. */
  ratedAt: string | null
}

/** GET /api/v1/reports/ratings response envelope (byte-for-byte GetRatingsResponse). */
export interface ListRatingsResponse {
  items: RatingDto[]
}

/**
 * GET /api/v1/reports/ratings — rangeless list of all rated completed orders for the fleet,
 * newest first (max 500). Envelope `{ items }`. Unwraps to a bare array.
 */
export async function getRatings(): Promise<RatingDto[]> {
  const data = await apiRequest<ListRatingsResponse>('/reports/ratings')
  return data.items
}

/**
 * GET /api/v1/reports/drivers?format=csv — downloads the SERVER-generated CSV blob.
 *
 * The CSV bytes come FROM the server (UTF-8 BOM + ';' separator, AC#7) — the client
 * NEVER rebuilds the CSV. This cannot use apiRequest (which does response.json());
 * it attaches Authorization + X-Fleet-Slug exactly like apiRequest, reads the body as
 * a Blob, and returns the server-provided filename from Content-Disposition when present.
 */
export async function fetchDriverReportCsv(
  filters: DriverReportFilters,
): Promise<{ blob: Blob; filename: string | null }> {
  const params = driverReportParams(filters)
  params.set('format', 'csv')

  const headers = new Headers()
  const token = authStorage.getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const slug = authStorage.getFleetSlug()
  if (slug) headers.set('X-Fleet-Slug', slug)

  const response = await fetch(`${BASE_URL}/reports/drivers?${params}`, { headers })
  if (!response.ok) {
    let body: ApiError
    try {
      body = (await response.json()) as ApiError
    } catch {
      body = {
        status: response.status,
        title: response.statusText,
        type: `https://httpstatuses.com/${response.status}`,
      }
    }
    throw new ApiResponseError(response.status, body)
  }

  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition')
  const filename = parseContentDispositionFilename(disposition)
  return { blob, filename }
}

/** Extracts a filename from a Content-Disposition header, or null when absent/unparseable. */
export function parseContentDispositionFilename(disposition: string | null): string | null {
  if (!disposition) return null
  // RFC 5987 filename*=UTF-8''... takes precedence over a plain filename="...".
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposition)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].replace(/^"|"$/g, ''))
    } catch {
      return star[1].replace(/^"|"$/g, '')
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition)
  return plain?.[1] ?? null
}

// ---------------------------------------------------------------------------
// Audit endpoint (UC-007 — FleetAdmin, read-only)
//
// REAL CONTRACT (reconciled byte-for-byte against the laneA7 backend records
// GetAuditResponse / AuditEntryDto). A UNION-ALL merge of order_events + audit_log
// into one shape, descending by `at`, 1-based paging.
// ---------------------------------------------------------------------------

/** A single unified audit timeline item (byte-for-byte AuditEntryDto). */
export interface AuditEntryDto {
  /** "OrderEvent" | "AuditLog" — the source table the row was projected from. */
  source: string
  /** Actor user id, or null for system/unknown actors. */
  actorUserId: string | null
  /** Affected entity kind (e.g. "Order", "Driver"). */
  entity: string
  /** The action name — an OrderEventType (e.g. "Completed") or an audit-log action. */
  action: string
  /** The order's public code when the row relates to an order, else null. */
  orderCode: string | null
  /** ISO UTC timestamp. */
  at: string
}

/** GET /api/v1/audit response (byte-for-byte GetAuditResponse). */
export interface AuditResponse {
  items: AuditEntryDto[]
  total: number
  /** 1-based page number returned. */
  page: number
  /** The page size the server used. */
  pageSize: number
}

export interface AuditFilters {
  /** Actor user id (Guid) filter. */
  actor?: string | null
  entity?: string | null
  from?: string | null
  to?: string | null
  orderCode?: string | null
  /** 1-based page number. */
  page?: number
}

/**
 * GET /api/v1/audit — paged, filterable, read-only unified timeline.
 * Envelope `{ items, total, page, pageSize }`; 1-based paging, server default pageSize 50.
 */
export function getAudit(filters: AuditFilters = {}): Promise<AuditResponse> {
  const params = new URLSearchParams()
  if (filters.actor) params.set('actor', filters.actor)
  if (filters.entity) params.set('entity', filters.entity)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.orderCode) params.set('orderCode', filters.orderCode)
  if (filters.page != null) params.set('page', String(filters.page))
  const qs = params.toString()
  return apiRequest<AuditResponse>(`/audit${qs ? `?${qs}` : ''}`)
}

// ---------------------------------------------------------------------------
// SuperAdmin fleets endpoint (UC-007 A5 — SuperAdminOnly, the ONE cross-tenant write)
//
// REAL CONTRACT reconciled byte-for-byte against the laneA5 backend records
// (CreateFleetRequest/Response, AdminFleetDto, ListFleetsResponse).
//
// ⚠ HANDOFF #1 (api-lane dependency): there is NO SuperAdmin login path today.
// StaffLoginEndpoint resolves a user WITHIN a fleet (by slug) and only accepts
// Driver/Dispatcher/FleetAdmin — a fleetless SuperAdmin (FleetId=null) cannot obtain
// a JWT. These functions hit real, existing routes (so tsc/build stay green), but
// /admin is unreachable in production until the API adds a SuperAdmin auth branch.
// ---------------------------------------------------------------------------

/** A fleet row in the SuperAdmin list (byte-for-byte AdminFleetDto). */
export interface AdminFleetDto {
  id: string
  slug: string
  name: string
  phone: string
  isActive: boolean
  /** ISO UTC creation timestamp. */
  createdAt: string
}

/** GET /api/v1/admin/fleets response (byte-for-byte ListFleetsResponse — `items` envelope). */
export interface ListFleetsResponse {
  items: AdminFleetDto[]
}

/** Request body for POST /api/v1/admin/fleets (byte-for-byte CreateFleetRequest). */
export interface CreateFleetRequest {
  slug: string
  name: string
  phone: string
  adminEmail: string
}

/**
 * Response for POST /api/v1/admin/fleets (byte-for-byte CreateFleetResponse).
 * `oneTimePassword` is the FleetAdmin's generated password — shown ONCE, never logged.
 */
export interface CreateFleetResponse {
  fleetId: string
  slug: string
  adminEmail: string
  oneTimePassword: string
}

/** GET /api/v1/admin/fleets — list all fleets across tenants (SuperAdmin). */
export function getAdminFleets(): Promise<ListFleetsResponse> {
  return apiRequest<ListFleetsResponse>('/admin/fleets')
}

/** POST /api/v1/admin/fleets — create a fleet; returns the one-time admin password once. */
export function postCreateFleet(req: CreateFleetRequest): Promise<CreateFleetResponse> {
  return apiRequest<CreateFleetResponse>('/admin/fleets', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

/** POST /api/v1/admin/fleets/{id}/deactivate — set IsActive=false (SuperAdmin). */
export function postDeactivateFleet(id: string): Promise<void> {
  return apiRequest<void>(`/admin/fleets/${id}/deactivate`, { method: 'POST' })
}

// ---------------------------------------------------------------------------
// SuperAdmin platform analytics endpoint (UC-009 WI-10 — SuperAdminOnly, cross-tenant)
//
// GET /api/v1/admin/analytics. Bare envelope { fleets, totals } (NOT an `items`
// wrapper). camelCase mirror of GetPlatformAnalyticsResponse / FleetHealthRowDto /
// PlatformTotalsDto. Reachability caveat: like getAdminFleets, /admin needs a
// SuperAdmin JWT that the backend cannot mint today (no SuperAdmin login path);
// the function hits the real route so tsc/build/tests stay green.
// ---------------------------------------------------------------------------

/**
 * One per-fleet health row (byte-for-byte FleetHealthRowDto).
 * Money fields are integer CZK; format at render with Intl.NumberFormat('cs-CZ').
 */
export interface FleetHealthRow {
  fleetId: string
  fleetName: string
  ridesThisMonth: number
  ridesLastMonth: number
  revenueThisMonthCzk: number
  revenueLastMonthCzk: number
  /** Month-over-month rides delta, percent (1 decimal). */
  momDeltaPct: number
  activeDrivers: number
  activeCustomers: number
  smsCount: number
  smsEstimatedCostCzk: number
  /** UTC ISO timestamp of the most recent order, or null if none. */
  lastOrderAt: string | null
  /** Completed rides for each of the 12 most recent ISO weeks (oldest first). */
  sparklineWeeks: number[]
  /** Server-computed flag: 'growing' | 'stable' | 'declining' | 'inactive'. */
  health: string
}

/** Platform-wide totals row (byte-for-byte PlatformTotalsDto). */
export interface PlatformTotals {
  totalFleets: number
  totalRidesThisMonth: number
  totalRevenueThisMonthCzk: number
  growingFleets: number
  decliningFleets: number
  inactiveFleets: number
}

/** GET /api/v1/admin/analytics response envelope (byte-for-byte GetPlatformAnalyticsResponse). */
export interface AdminAnalyticsResponse {
  fleets: FleetHealthRow[]
  totals: PlatformTotals
}

/** GET /api/v1/admin/analytics — cross-tenant per-fleet health + platform totals (SuperAdmin). */
export function getAdminAnalytics(): Promise<AdminAnalyticsResponse> {
  return apiRequest<AdminAnalyticsResponse>('/admin/analytics')
}

// ---------------------------------------------------------------------------
// Fleet self-service write endpoints (UC-007 A6 — FleetAdmin, tenant-scoped)
//
// ⚠ FULL-PUT REPLACE: PUT /fleet/settings overwrites ALL fields. A null color/welcome
// CLEARS them; smsMonthlyCapCzk overwrites. The form must pre-fill color + welcomeText
// from GET /public/fleet (the read endpoint does NOT return them) to avoid wiping them.
// ---------------------------------------------------------------------------

/** Request body for PUT /api/v1/fleet/settings (byte-for-byte UpdateFleetSettingsRequest). */
export interface UpdateFleetSettingsRequest {
  name: string
  phone: string
  /** #RRGGBB, or null to clear. */
  primaryColorHex: string | null
  /** Welcome text, or null to clear. */
  welcomeText: string | null
  /** 10..600. */
  offerTimeoutSeconds: number
  /** >= 0. */
  smsMonthlyCapCzk: number
  /** Persisted; v1.1-disabled in the UI. */
  autoDispatchEnabled: boolean
}

/** PUT /api/v1/fleet/settings — persist the self-service set. Returns 204. */
export function putFleetSettings(req: UpdateFleetSettingsRequest): Promise<void> {
  return apiRequest<void>('/fleet/settings', {
    method: 'PUT',
    body: JSON.stringify(req),
  })
}

/**
 * POST /api/v1/fleet/logo — multipart PNG upload (<= 200 KB). Returns 204.
 *
 * Cannot use apiRequest: it force-sets Content-Type: application/json whenever a body
 * is present, which breaks multipart (the browser must set the boundary). This attaches
 * Authorization + X-Fleet-Slug exactly like apiRequest and sends FormData with NO
 * explicit Content-Type (mirrors the fetchDriverReportCsv manual-headers pattern).
 */
export async function postFleetLogo(file: File): Promise<void> {
  const headers = new Headers()
  const token = authStorage.getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const slug = authStorage.getFleetSlug()
  if (slug) headers.set('X-Fleet-Slug', slug)

  const form = new FormData()
  form.append('file', file)

  const response = await fetch(`${BASE_URL}/fleet/logo`, {
    method: 'POST',
    headers,
    body: form,
  })

  if (!response.ok) {
    let body: ApiError
    try {
      body = (await response.json()) as ApiError
    } catch {
      body = {
        status: response.status,
        title: response.statusText,
        type: `https://httpstatuses.com/${response.status}`,
      }
    }
    throw new ApiResponseError(response.status, body)
  }
}
