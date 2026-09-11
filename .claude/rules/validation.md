---
description: FluentValidation rules for request DTOs
---

# Validation Rules

## Two levels

Never mix — validator = "is the input well-formed?"; endpoint = "is this operation allowed?".

1. **FluentValidation** — input shape (format, range, required). Runs before handler. Failure → 400.
2. **Endpoint logic** — domain state (entity exists, permission, business rule). Failure → `Send.XAsync(ct)` (rules/error-handling.md).

## When to add a validator

Required for endpoints with a body (POST/PUT/PATCH) or non-trivial query/route params. Not needed for no-input endpoints or pure id lookups.

## Validator class

`internal sealed`, inherits `Validator<TRequest>` (FastEndpoints — NOT `AbstractValidator<T>`). Always `.WithErrorCode(...)`.

```csharp
internal sealed class CreateOrderValidator : Validator<CreateOrderRequest>
{
    public CreateOrderValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty().WithErrorCode(ErrorCodes.Validation.CustomerIdRequired);
        RuleFor(x => x.Total).GreaterThan(0).WithErrorCode(ErrorCodes.Validation.TotalMustBePositive);
    }
}
```

## Error codes

`const string` in a central `ErrorCodes` static class. Format `"{Layer}.{ErrorName}"`. Stable — frontend localization keys.

```csharp
public static class ErrorCodes
{
    public static class Validation
    {
        public const string CustomerIdRequired = "Validation.CustomerIdRequired";
    }
    public const string OrderNotFound = "Order.NotFound";
}
```

## Testing validators

Unit test with `.TestValidate(...)`. No FastEndpoints needed.

```csharp
var result = new CreateOrderValidator().TestValidate(new CreateOrderRequest { CustomerId = Guid.Empty, Total = 10 });
result.ShouldHaveValidationErrorFor(x => x.CustomerId).WithErrorCode(ErrorCodes.Validation.CustomerIdRequired);
```

## Common rules

```csharp
RuleFor(x => x.UserId).NotEmpty()...;
RuleFor(x => x.Year).GreaterThanOrEqualTo(ValidationConstants.MinYear)...;
RuleFor(x => x.Type).NotEqual(OrderType.Undefined)...;
RuleFor(x => x.To).GreaterThanOrEqualTo(x => x.From)...;
RuleFor(x => x.Payload).NotEmpty().Must(x => Base64.IsValid(x))...;
```

## What goes where

| Validation type | Where |
|-----------------|-------|
| Required, format, range, enum | Validator |
| Entity exists | Endpoint → `Send.NotFoundAsync(ct)` |
| Caller permission | Endpoint → `Send.ForbidAsync(ct)` |
| Business state / state machine | Endpoint → `Send.XAsync(ct)` |
| Cross-entity invariants | Endpoint → `Send.XAsync(ct)` |
