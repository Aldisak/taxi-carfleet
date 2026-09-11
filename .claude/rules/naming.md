---
description: Naming conventions for files, types, routes, and identifiers
---

# Naming Conventions

## Files and types

One type per file. File name matches type name exactly. No nested public types.

## Endpoints, requests, responses, validators, feature configs

```
GetOrderEndpoint.cs
CreateOrderEndpoint.cs
GetOrdersOverviewEndpoint.cs        // plural + context
GetCurrentUserOrdersEndpoint.cs     // context qualifier

CreateOrderRequest.cs
GetOrderDetailRequest.cs

GetOrderResponse.cs                 // endpoint payload
CreateOrderResponse.cs
OrderSummaryDto.cs                  // shared DTO reused across features

CreateOrderValidator.cs
GetOrdersOverviewValidator.cs

OrdersFeatureConfiguration.cs
```

Responses are `record` — see rules/csharp-style.md#records-for-dtos.

## Error codes

`"{Domain}.{ErrorName}"` — frontend localization keys, stable across releases (see rules/validation.md#error-codes).

```csharp
public const string OrderNotFound = "Order.NotFound";
public const string OrderConflict = "Order.Conflict";
public const string CustomerIdRequired = "Validation.CustomerIdRequired";
```

## Migrations

Descriptive, present tense `{Verb}{Target}`.

```
AddOrdersTable
RenameOrderTotalToAmount
DropLegacyTimesheetTable
```

## Test naming

`{Method}_{StateUnderTest}_{ExpectedBehavior}`.

```csharp
HandleAsync_OrderNotFound_Returns404
HandleAsync_UserHasNoPermission_Returns403
HandleAsync_ValidRequest_CreatesOrderAndReturns201
Validate_EmptyCustomerId_FailsWithCorrectCode
```
