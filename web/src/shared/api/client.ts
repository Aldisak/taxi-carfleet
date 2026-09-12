import { authStorage } from './auth-storage'
import { idbAuthStore } from './idbAuthStore'
import { isSilentRefreshEnabled, silentRefresh } from './refresh'

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

    // Driver flow — retry itself got 401: clear both stores and redirect to driver login.
    // Must check BEFORE the dispatcher fallthrough so IDB is always cleaned up.
    if (_isRetry && isSilentRefreshEnabled()) {
      authStorage.clear()
      await idbAuthStore.clear()
      window.location.href = '/d/login'
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
