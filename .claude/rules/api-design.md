---
description: FastEndpoints REPR rules for HTTP endpoints
---

# API Design Rules

All HTTP endpoints use FastEndpoints (REPR). Every endpoint is `internal sealed` and inherits `Endpoint<TRequest, TResponse>` or `EndpointWithoutRequest<TResponse>`.

## Endpoint pattern

Business logic in `HandleAsync`. No service classes, no MediatR. `DbContext` and other deps injected via the primary constructor. If `HandleAsync` grows beyond ~50 lines, extract `private` methods on the same class.

```csharp
/// <summary>Gets an order by its id.</summary>
internal sealed class GetOrderEndpoint(AppDbContext dbContext, ICurrentUser currentUser, TimeProvider timeProvider)
    : Endpoint<GetOrderRequest, GetOrderResponse>
{
    private readonly OrdersFeatureConfiguration _featureConfiguration = new();

    public override void Configure()
    {
        Get("orders/{id:guid}");
        Description(builder => builder.WithName(nameof(GetOrderEndpoint)).WithTag(_featureConfiguration));
        DontCatchExceptions();
        Policies(nameof(AuthorizationPolicies.UsersOnly));

        Summary(s =>
        {
            s.Summary = "Get order detail";
            s.Responses[StatusCodes.Status200OK] = "Order detail";
            s.Responses[StatusCodes.Status404NotFound] = "Order not found";
        });
    }

    public override async Task HandleAsync(GetOrderRequest req, CancellationToken ct)
    {
        var order = await dbContext.Orders.AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == req.Id, ct);

        if (order is null) { await Send.NotFoundAsync(ct); return; }

        await Send.OkAsync(new GetOrderResponse(order.Id, order.Total), ct);
    }
}
```

## Configure structure

- HTTP verb + route first (`Get`, `Post`, `Put`, `Patch`, `Delete`).
- `Description(...)` always `.WithName(nameof(TheEndpoint))` + `.WithTag(_featureConfiguration)`.
- `DontCatchExceptions()` mandatory (#dont-catch-exceptions).
- `Policies(nameof(AuthorizationPolicies.XYZ))` (#authorization).
- `Summary` documents every response status used.

## Handleasync body

1. Input binding (FastEndpoints populates `req`).
2. Load data (`AsNoTracking()` for reads — rules/ef-core.md#asnotracking).
3. Guards for expected errors → `Send.XAsync(ct); return;` (rules/csharp-style.md#guard-clauses).
4. Business logic.
5. Success via `Send.OkAsync(...)` / `Send.CreatedAtAsync(...)` / `Send.NoContentAsync(...)`.

## Send pattern

```csharp
await Send.OkAsync(responseDto, ct);
await Send.CreatedAtAsync<GetOrderEndpoint>(new { id }, responseDto, cancellation: ct);
await Send.NoContentAsync(ct);
await Send.NotFoundAsync(ct);
await Send.ForbidAsync(ct);
await Send.UnauthorizedAsync(ct);
```

Anti-patterns: returning `SendOkAsync(...)` as a value (legacy pre-2.x), returning `TypedResults.Ok(...)`, throwing `KeyNotFoundException` / `UnauthorizedAccessException` for expected errors (rules/error-handling.md#send-for-expected-errors), manual `ProblemDetails`.

Always `return;` after `Send.XAsync(ct)` in a guard branch — response is already written.

## Feature configuration field

Every endpoint needs the feature configuration for Swagger tagging. Primary ctors cannot declare fields — place it on the class body as `private readonly OrdersFeatureConfiguration _featureConfiguration = new();`.

## Authorization

Always `nameof()`, never string literals: `Policies(nameof(AuthorizationPolicies.UsersOnly));`.

No endpoint is anonymous unless intentionally public (health check, welcome, OAuth callback) — then call `AllowAnonymous()` and document why in `Summary`.

## Routes

- Feature prefix: `orders/{id:guid}`, `timesheets/overview/{year:int}`.
- Lowercase + hyphens for multi-word: `license-assignments`.
- Constraints: `{id:guid}`, `{year:int}`.
- RESTful verbs: `GET` reads, `POST` creates, `PUT` full updates, `PATCH` partial, `DELETE` removal.

## Json serialization

Do not configure per endpoint — it is global.

## Dont catch exceptions

`DontCatchExceptions()` is mandatory on every endpoint.
