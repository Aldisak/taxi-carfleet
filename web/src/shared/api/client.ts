import { authStorage } from './auth-storage'

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
}

const BASE_URL = (import.meta as ImportMeta & { env: { VITE_API_BASE_URL?: string } }).env
  ?.VITE_API_BASE_URL ?? '/api/v1'

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { skipAuthRedirect = false, ...fetchOptions } = options

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

export function getOrder(orderId: string): Promise<OrderDetailDto> {
  return apiRequest<OrderDetailDto>(`/orders/${orderId}`)
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
