---
description: EF Core rules for entities, DbContext, and queries
---

# EF Core Rules

## Entity naming

One entity per file; file name matches type name.

```csharp
/// <summary>Persisted order record.</summary>
public class Order : AuditableEntity
{
    public Guid Id { get; set; }
    public required Guid CustomerId { get; set; }
    public required decimal Total { get; set; }
    public required OrderStatus Status { get; set; }
    public Customer? Customer { get; set; }
}
```

## Primary keys

All PKs are `Guid`. Never `int` or `long` identity. `public Guid Id { get; set; }`

## Dbset registration

Every new entity MUST be registered on the `DbContext`: `public DbSet<Order> Orders => Set<Order>();`.

## Dbcontext injection

`DbContext` injected directly into endpoints via the primary constructor — no repository wrappers.

## N plus one

Use `.Include()` / `.ThenInclude()` or `.Select(...)` for navigations. Never `.Find(...)` / `.FirstOrDefault(...)` inside a `foreach`.

```csharp
var orders = await dbContext.Orders.AsNoTracking()
    .Include(o => o.Customer)
    .Where(o => o.Status == OrderStatus.Pending)
    .ToListAsync(ct);
```

Anti-pattern: `foreach (var o in orders) { o.Customer = await dbContext.Customers.FindAsync(o.CustomerId, ct); }` — N+1.

## Indexes

FK columns always indexed. Columns used for filtering/sorting/search → indexed. Composite indexes for multi-column queries on hot paths.

```csharp
builder.HasIndex(x => x.CustomerId);
builder.HasIndex(x => new { x.Status, x.CreatedAt });
```

## Migrations

Descriptive name (rules/naming.md#migrations). Review generated SQL before committing — check for destructive ops (column drops, renames that EF translates as drop-and-recreate).

## Enums as strings

```csharp
configurationBuilder.Properties<Enum>().HaveConversion<string>(); // globally in ConfigureConventions
```

## Asnotracking

All read-only queries MUST use `AsNoTracking()`. Omit only when updating the entity in the same request.

## Projections

Prefer `.Select(...)` to avoid loading unnecessary columns/navigations:

```csharp
var dto = await dbContext.Customers
    .AsNoTracking()
    .Where(c => c.Id == customerId)
    .Select(c => new CustomerSummaryDto(c.Id, c.Name, c.Email))
    .FirstOrDefaultAsync(ct);
```

Anti-pattern: `FindAsync(customerId)` then mapping — loads all columns.

## Date types

`DateOnly` for calendar dates; `TimeOnly` for time-of-day; `DateTimeOffset` for timestamps with timezone (audit, events). Never plain `DateTime`.
