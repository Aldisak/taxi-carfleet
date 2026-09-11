---
description: Error handling strategy for endpoints
---

# Error Handling Rules

## Core principle

- **Expected failures** (entity not found, no permission, business rule violation, invalid state) → return via `Send.XAsync(ct)`.
- **Unexpected failures** (database down, network error, NullReferenceException) → let the exception propagate to the global exception handler.

Never use exceptions for control flow. Never return `null` to indicate failure to the caller.

## Send for expected errors

Every expected error is a `Send.*Async(ct)` call followed by `return;`. FastEndpoints maps these to HTTP status codes automatically.

| Status | Send call | Use for |
|--------|-----------|---------|
| 400 | `Send.ErrorsAsync(400, ct)` | generic bad request |
| 401 | `Send.UnauthorizedAsync(ct)` | missing/invalid credentials |
| 403 | `Send.ForbidAsync(ct)` | authenticated but not authorized |
| 404 | `Send.NotFoundAsync(ct)` | entity not found |
| 409 | `Send.ErrorsAsync(409, ct)` | conflict / invalid state |

If the body needs a structured error payload (error code + message), populate the validation failures collection with `AddError(...)` before `Send.ErrorsAsync(ct)` — FastEndpoints serializes them into the response.

## Exceptions for infrastructure

Let infrastructure errors propagate naturally (DB connection failures, network timeouts, downstream deserialization errors, unexpected `null`, any programmer bug). Caught by the global exception handler (#global-exception-handler).

Do not wrap `DbContext` / HTTP calls in `try/catch` unless (1) failure is expected and recoverable (non-critical calendar sync fails but main op succeeds) or (2) you want to log and continue with degraded functionality.

## No exceptions for control flow

Do not throw `KeyNotFoundException`, `UnauthorizedAccessException`, `InvalidOperationException`, or custom "domain" exceptions to signal expected errors.

```csharp
// DO
if (order is null) { await Send.NotFoundAsync(ct); return; }
if (!canAccess) { await Send.ForbidAsync(ct); return; }
if (order.IsCancelled) { await Send.ErrorsAsync(409, ct); return; }
```

Anti-pattern: `throw new KeyNotFoundException(...)` / `throw new UnauthorizedAccessException()` / `throw new InvalidOperationException(...)` for expected domain errors.

## Global exception handler

Wired in `Program.cs`. Catches every unhandled exception → RFC 7807 ProblemDetails with `500 Internal Server Error`, correlation/trace ID, no stack traces in production (non-prod may include).
