---
description: Vertical slice architecture rules for .NET backend features
---

# Architecture Rules

Every feature is a self-contained vertical slice. No horizontal layers (Services, Repositories, Managers, Application, Domain). Each slice owns its request, response, endpoint, validator, errors, and feature configuration.

## Vertical slice layout

Every feature lives in `src/{Project}/Features/{Area}/` — one type per file, co-located. Nest per action (`CreateOrder/`, `GetOrder/`) when a slice has multiple request/response/validator types; flatten for trivial queries.

```
Features/Orders/
  OrdersFeatureConfiguration.cs
  CreateOrder/ { CreateOrderEndpoint.cs, CreateOrderRequest.cs, CreateOrderResponse.cs, CreateOrderValidator.cs }
  GetOrder/    { GetOrderEndpoint.cs, GetOrderRequest.cs, GetOrderResponse.cs }
  Errors/      { OrderErrors.cs }
  Shared/      { OrderDto.cs }
```

## Feature configuration

Every feature slice MUST include `{Feature}FeatureConfiguration : IFeatureConfiguration` in its root folder. Auto-discovered via reflection — no manual registration in `Program.cs`. Missing it → feature disappears from Swagger silently (no compile error). Requirements: parameterless ctor (reflection), `internal sealed`, `FeatureInfo` name = Swagger tag (short + descriptive).

```csharp
/// <summary>Feature configuration for the Orders slice.</summary>
internal sealed class OrdersFeatureConfiguration : IFeatureConfiguration
{
    /// <summary>Swagger tag info for this feature.</summary>
    public FeatureInfo Info => new("Orders", "CRUD operations over orders");

    /// <summary>Register feature-scoped services here.</summary>
    public IServiceCollection AddFeatureDependencies(IServiceCollection services, IConfiguration configuration)
        => services;
}
```

## No horizontal layers

No top-level `Services/`, `Repositories/`, `Application/`, `Domain/`. Features are the only organizing principle — grow large endpoints by extracting `private` methods on the same class. Cross-feature: no references across feature namespaces. Shared data → `Shared/` or `Common/`, or query `DbContext` directly from each feature.

## Banned patterns

NO: AutoMapper / Mapster / `IMapper` / `.Map<>()` — hand-write projections with `Select` or ctor.
NO: `IRepository<T>` / `{Entity}Repository` / DbContext wrappers — inject `DbContext` directly (#no-repository-pattern).
NO: MediatR / `IRequest<T>` handlers — endpoint owns the logic.
NO: Service / Manager classes for feature logic — extract private methods on the endpoint.
NO: `Services/` / `Repositories/` / `Application/` / `Domain/` folders.

See #no-horizontal-layers for rationale.

## No repository pattern

Inject `DbContext` directly into endpoints via primary constructor. No repository interface or wrapper class. EF Core is already a Unit-of-Work + Repository implementation.

## Common infrastructure

Allowed only when reused by 2+ features:

- `Common/` — interfaces (`ICurrentUser`, `IPermissionService`), shared utilities, base classes.
- `Database/` or `Infrastructure/EntityFramework/` — DbContext, entities, configurations, migrations.
- `Infrastructure/` — external service integrations (Graph API, HTTP clients).
- `Authorization/` — policies, handlers, permission providers.

## One type per file

One class/record/interface/enum per file. File name matches the type name exactly. No nested public types.

## Project references

- `{Project}` (App or Api) — endpoints, features, database, infrastructure wiring.
- `{Project}.Shared` — enums, permission constants, DTOs shared with frontend/Functions. No project refs.
- `{Project}.Infrastructure` — external service integrations. References `Shared`.
