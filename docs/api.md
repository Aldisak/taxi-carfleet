# Taxi API — Endpoint Reference

Generated automatically by `OpenApi_Document_GeneratesApiMarkdown` in
`api/tests/Taxi.Api.Tests/Seed/SeedAndEndToEndTests.cs`.
Do not edit by hand — run the tests to regenerate.

Base path: `/api/v1` (all routes below are relative to this prefix)

---

## Auth

| Method | Route | Summary | Auth |
|--------|-------|---------|------|
| POST | `/auth/customer/verify-code` | Verify customer SMS code | Anonymous |
| POST | `/auth/staff/login` | Staff login | Anonymous |
| POST | `/auth/customer/request-code` | Request customer SMS code | Anonymous |
| POST | `/auth/refresh` | Refresh token rotation | Anonymous |
| POST | `/auth/logout` | Logout | Bearer |

## Drivers

| Method | Route | Summary | Auth |
|--------|-------|---------|------|
| POST | `/drivers/{id}/status` | Override driver status | Bearer |
| GET | `/drivers` | List drivers | Bearer |
| POST | `/drivers/me/online` | Go online | Bearer |
| POST | `/drivers/me/offline` | Go offline | Bearer |
| GET | `/drivers/me/summary` | Get my daily summary (Driver only) | Bearer |
| GET | `/drivers/me/orders` | Get my ride list for a day (Driver only) | Bearer |
| GET | `/drivers/me` | Get my driver profile | Bearer |

## Fleet

| Method | Route | Summary | Auth |
|--------|-------|---------|------|
| GET | `/fleet/settings` | Get fleet settings | Bearer |

## Geo

| Method | Route | Summary | Auth |
|--------|-------|---------|------|
| GET | `/geo/suggest` | Address autocomplete | Bearer |
| GET | `/geo/route` | Get route distance and duration | Bearer |

## Health

| Method | Route | Summary | Auth |
|--------|-------|---------|------|
| GET | `/welcome` | Welcome endpoint | Anonymous |

## Orders

| Method | Route | Summary | Auth |
|--------|-------|---------|------|
| PATCH | `/orders/{id}` | Partially update an order | Bearer |
| GET | `/orders/{id}` | Get order detail | Bearer |
| POST | `/orders/{id}/start` | Start the ride (Driver only) | Bearer |
| POST | `/orders/{id}/reassign` | Reassign an order to a different driver | Bearer |
| POST | `/orders/{id}/rating` | Rate a completed order (Customer only, once) | Bearer |
| GET | `/orders` | List orders | Bearer |
| POST | `/orders` | Create a new order | Bearer |
| GET | `/orders/mine` | List my orders (Customer only) | Bearer |
| GET | `/orders/{id}/events` | Get order event history | Bearer |
| GET | `/orders/by-code/{publicCode}` | Track order by public code | Bearer |
| GET | `/orders/mine/active` | Get my active order (Customer only) | Bearer |
| POST | `/orders/{id}/decline` | Decline an assigned order (Driver only) | Bearer |
| POST | `/orders/{id}/complete` | Complete the ride (Driver only) | Bearer |
| POST | `/orders/{id}/cancel` | Cancel an order | Bearer |
| POST | `/orders/{id}/assign` | Assign a driver to an order | Bearer |
| POST | `/orders/{id}/arrive` | Signal driver arrival at pickup (Driver only) | Bearer |
| POST | `/orders/{id}/notes` | Add a note to an order | Bearer |
| POST | `/orders/{id}/accept` | Accept an assigned order (Driver only) | Bearer |

## Pricing

| Method | Route | Summary | Auth |
|--------|-------|---------|------|
| GET | `/pricing/quote` | Get a price quote (Customer only) | Bearer |

## Public

| Method | Route | Summary | Auth |
|--------|-------|---------|------|
| GET | `/public/track/{code}` | Track an order via the public SMS link | Anonymous |
| GET | `/public/fleet` | Get public fleet branding | Anonymous |

## Routes

| Method | Route | Summary | Auth |
|--------|-------|---------|------|
| GET | `/routes/common` | List common routes (anonymous, fleet-scoped) | Anonymous |

## Staff

| Method | Route | Summary | Auth |
|--------|-------|---------|------|
| PUT | `/staff/{id}` | Update staff user | Bearer |
| GET | `/staff/{id}` | Get staff detail | Bearer |
| DELETE | `/staff/{id}` | Deactivate staff user | Bearer |
| POST | `/staff/{id}/reset-password` | Reset staff user password | Bearer |
| GET | `/staff` | List staff | Bearer |
| POST | `/staff` | Create staff user | Bearer |

## Vehicles

| Method | Route | Summary | Auth |
|--------|-------|---------|------|
| PUT | `/vehicles/{id}` | Update a vehicle | Bearer |
| GET | `/vehicles/{id}` | Get vehicle detail | Bearer |
| DELETE | `/vehicles/{id}` | Delete (deactivate) a vehicle | Bearer |
| GET | `/vehicles` | List vehicles | Bearer |
| POST | `/vehicles` | Create a vehicle | Bearer |

---

## Error codes

All validation errors return 400 with a `problems` array. Error codes follow the pattern `"Domain.ErrorName"` (e.g., `"Validation.PhoneInvalid"`, `"Order.NotFound"`).

## Concurrency

Transition endpoints return 409 with code `"Order.StaleVersion"` when a concurrent modification is detected. Clients should refetch and retry.

## Tenant isolation

All fleet-owned resources (orders, drivers, vehicles, staff) are scoped to the authenticated user's fleet. Cross-tenant reads return 404, never 403 (no existence leak).
