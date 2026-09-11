---
description: C# style rules for .NET 10 / C# 14 backend code
---

# C# Style Rules

## Language version

.NET 10 / C# 14. In each `csproj` (or `Directory.Build.props`): `<Nullable>enable</Nullable>`, `<ImplicitUsings>enable</ImplicitUsings>`, `<LangVersion>latest</LangVersion>`.

Use modern features freely: primary constructors, collection expressions, `field` keyword, pattern matching, records, raw string literals, target-typed `new(...)`.

## Primary constructors

YES for DI and simple init. NO for validation, conditional setup, multiple ctors, or >2 statements. Cannot declare instance fields — non-parameter fields go on the class body (see rules/api-design.md#feature-configuration-field).

```csharp
internal sealed class CreateOrderEndpoint(
    AppDbContext dbContext,
    ICurrentUser currentUser,
    TimeProvider timeProvider) : Endpoint<CreateOrderRequest, CreateOrderResponse>
{
    private readonly OrdersFeatureConfiguration _featureConfiguration = new();
}
```

## Records for dtos

`record` for immutable response/shared DTOs:

```csharp
public record OrderDetailResponse(Guid Id, decimal Total, DateTimeOffset CreatedAt);

public record OrderSummaryDto
{
    public required Guid Id { get; init; }
    public required string CustomerName { get; init; }
    public required decimal Total { get; init; }
}
```

`readonly record struct` for small value objects: `internal readonly record struct OrderId(Guid Value);`.

## Sealed internal

Endpoints, validators, feature configurations, and most concrete classes are `internal sealed`. Prefer `internal` over `public` unless the type is part of an API contract (shared project, Functions project, public SDK).

## Timeprovider

Always use the injected `TimeProvider`:

```csharp
var now = timeProvider.GetUtcNow();
var today = timeProvider.GetLocalNow().DateTime;
var date = DateOnly.FromDateTime(timeProvider.GetUtcNow().DateTime);
```

Anti-pattern: `DateTime.UtcNow` / `DateTime.Now` / `DateTime.Today`.

In tests: register `FakeTimeProvider` pinned to a fixed date. No custom `IDateTimeProvider`.

## Guid primary keys

All entity PKs are `Guid`. No `int`/`long` identity (see rules/ef-core.md#primary-keys). `public Guid Id { get; set; }`

## Target typed new

`new()` when type is on the LHS:

```csharp
List<OrderDo> orders = new();
Dictionary<Guid, string> map = new();
var orders = new List<OrderDo>();  // OK — var with new Type()
```

Anti-pattern: `List<OrderDo> orders = new List<OrderDo>();` — redundant type.

## Expression bodied

`=>` for single-expression members. NO for multi-statement bodies.

```csharp
public static Error NotFound(Guid id) =>
    Error.NotFound(ErrorCodes.OrderNotFound, $"Order {id} not found.");

private static bool IsActive(OrderDo o) => o.Status == OrderStatus.Pending;
public string FullName => $"{FirstName} {LastName}";
```

## Guard clauses

Guard + early return. No deep nesting, no long `else` chains.

```csharp
if (order is null) { await Send.NotFoundAsync(ct); return; }
if (!canAccess)   { await Send.ForbidAsync(ct);   return; }

await Send.OkAsync(ToResponse(order), ct);
```

Anti-pattern: nested `if (order is not null) { if (canAccess) … else … } else …`.

## File scoped namespaces

`namespace {Project}.Features.Orders.CreateOrder;` — block-scoped `namespace X { … }` forbidden.

## Nullable reference types

NRT enabled. `?` for intentionally nullable references:

```csharp
public string? Note { get; set; }                     // optional
public string Email { get; set; } = string.Empty;     // non-nullable
var name = user?.FullName ?? "Unknown";
```

## Xml documentation

`/// <summary>` on ALL `public` and `internal` members in ALL projects. Omit for trivial accessors.

```csharp
/// <summary>Email recipient options loaded from configuration.</summary>
private EmailRecipientsOptions EmailRecipientsOptions { get; } = options.Value;
```

## Async await

- Always `async` / `await`; do not return raw `Task` from methods with `await`able work.
- `CancellationToken ct` as last parameter on async methods; forward `ct` to every async call.

## Pattern matching

```csharp
if (order is null) { /* ... */ }
if (entity is OrderDo o) { /* ... */ }

return status switch
{
    OrderStatus.Pending => "Pending approval",
    OrderStatus.Approved => "Ready to ship",
    _ => "Unknown"
};
```

## No regions

Never `#region` / `#endregion`. Organize through well-named methods and small classes; one type per file (rules/architecture.md#one-type-per-file) keeps files small.
