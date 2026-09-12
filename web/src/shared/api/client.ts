import { authStorage } from './auth-storage'
import { idbAuthStore } from './idbAuthStore'
import { getFailureRedirectPath, isSilentRefreshEnabled, silentRefresh } from './refresh'

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
   * When true, a 401 response does NOT clear storage or redirect to /x/login.
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
      // silentRefresh already cleared storage and redirected to /d/login
      return new Promise(() => undefined)
    }

    // Silent-refresh flow — retry itself got 401: clear both stores and redirect to the
    // caller's login. Role-aware via getFailureRedirectPath() (F2: previously hardcoded
    // /d/login, which bounced a customer whose refresh failed to the DRIVER login).
    // Must check BEFORE the dispatcher fallthrough so IDB is always cleaned up.
    if (_isRetry && isSilentRefreshEnabled()) {
      authStorage.clear()
      await idbAuthStore.clear()
      window.location.href = getFailureRedirectPath() ?? '/d/login'
      return new Promise(() => undefined)
    }

    // Dispatcher flow (unchanged): clear storage and redirect to /x/login
    authStorage.clear()
    window.location.href = '/x/login'
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
 * client.ts would clear storage / redirect (to /x/login or via silent refresh),
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

export interface GeoSuggestItem {
  label: string
  lat: number
  lng: number
}

export interface GeoSuggestResponse {
  items: GeoSuggestItem[]
}

export interface GeoRouteResponse {
  distanceMeters: number
  durationSeconds: number
  estimatedPriceCzk: number | null
}

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

export function getGeoRoute(req: GeoRouteRequest): Promise<GeoRouteResponse> {
  const params = new URLSearchParams({
    fromLat: String(req.fromLat),
    fromLng: String(req.fromLng),
    toLat: String(req.toLat),
    toLng: String(req.toLng),
  })
  return apiRequest<GeoRouteResponse>(`/geo/route?${params}`)
}

// ---------------------------------------------------------------------------
// Pricing quote (CustomerOnly)
// ---------------------------------------------------------------------------

/**
 * A price quote from GET /pricing/quote. Either a Fixed price (a matching route rule) or
 * an Estimate RANGE (tariff ±10%, rounded to 10 CZK) — the backend guarantees it is NEVER
 * a single exact estimate (AC #4: estimateLow < estimateHigh).
 */
export interface PriceQuoteResponse {
  /** "Fixed" when a route rule matched, else "Estimate". */
  priceType: 'Fixed' | 'Estimate'
  /** Integer CZK fixed price when priceType is Fixed; null otherwise. */
  fixedPriceCzk: number | null
  /** Lower bound of the estimate range when priceType is Estimate; null otherwise. */
  estimateLowCzk: number | null
  /** Upper bound of the estimate range when priceType is Estimate; null otherwise. */
  estimateHighCzk: number | null
}

/** Query params for GET /pricing/quote. Dropoff is optional (omit → a wide estimate). */
export interface PriceQuoteRequest {
  fromLat: number
  fromLng: number
  toLat?: number | null
  toLng?: number | null
}

/**
 * GET /pricing/quote — a Fixed price or an Estimate range for a prospective order.
 * CustomerOnly; coords are sent as invariant-format strings (the backend parses them as
 * invariant doubles to dodge the cs-CZ locale double-binding trap). Throws
 * ApiResponseError(502) when the upstream route is unavailable — the caller surfaces the
 * "Cenu nelze spočítat, zavolejte nám" message.
 */
export function getPriceQuote(req: PriceQuoteRequest): Promise<PriceQuoteResponse> {
  const params = new URLSearchParams({
    fromLat: String(req.fromLat),
    fromLng: String(req.fromLng),
  })
  if (req.toLat != null && req.toLng != null) {
    params.set('toLat', String(req.toLat))
    params.set('toLng', String(req.toLng))
  }
  return apiRequest<PriceQuoteResponse>(`/pricing/quote?${params}`)
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
  /** Full tracking URL path /c/t/{code}?k={token} (A-track). Optional pre-merge. */
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
}

export function getFleetSettings(): Promise<FleetSettingsDto> {
  return apiRequest<FleetSettingsDto>('/fleet/settings')
}
