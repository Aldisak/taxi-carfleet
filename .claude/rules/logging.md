# Logging Rules

Structured, event-style logs only. Serilog + `Enrich.FromLogContext` is the baseline; the SourceContext enricher attaches the class name automatically, so messages must NOT repeat it.

## Style — message templates

Templates are **short event phrases**, present tense, no sentences, no terminating period.

```csharp
// YES
logger.LogInformation("Invite sent {InviteId} {SenderId} {ReceiverId}", invite.Id, sender.Id, receiver.Id);
logger.LogWarning(ex, "Notifier failed {Notifier} {Phase} {InviteId}", "SignalR", "InviteSent", invite.Id);

// NO
logger.LogInformation("The invite was sent successfully with id {InviteId}.", invite.Id);   // sentence
logger.LogInformation("[InvitesService] Invite sent: id={InviteId}", invite.Id);            // class-name prefix + ad-hoc separator
logger.LogInformation($"Invite {invite.Id} sent");                                          // string interpolation (loses structure)
```

The class name reaches the sink via `SourceContext`. Don't repeat it.

## Property names

Always PascalCase. Use the canonical name for the same concept across the codebase.

| Concept | Property |
|---|---|
| Caller / authenticated user | `CallerId` (when distinct from a target), else `UserId` |
| Sender of an invite | `SenderId` |
| Receiver of an invite | `ReceiverId` |
| Reviewer / reviewee | `ReviewerId` / `RevieweeId` |
| Reporter / reported | `ReporterId` / `ReportedUserId` |
| Aggregate root ids | `InviteId`, `MeetupId`, `ReportId`, `PhotoId`, `PlaceId`, `CityId`, `HangoutTagId` |
| Trace / correlation | `CorrelationId` (set by `CorrelationIdMiddleware`) |
| HTTP request shape | `Method`, `Path`, `StatusCode`, `DurationMs` |
| Counts and durations | `Count`, `BatchSize`, `DurationMs` |
| Discriminator for skip / failure paths | `Reason` (a stable enum-style string, never user input) |
| Failure phase | `Phase` (e.g. `"InviteSent"`, `"InviteAccepted"`) |
| Sub-component name in a composite | `Notifier`, `Job`, `Subsystem` |

`Reason` values are short PascalCase strings drawn from a closed set: `"ReceiverDeleted"`, `"NoFcmToken"`, `"InviteNotFound"`, `"SilentDecline"`, etc. Never user-provided text.

## Levels

| Level | When |
|---|---|
| `Trace` | Per-call hot-path detail too noisy for Debug. Rare. |
| `Debug` | Per-request decisions: skip reasons, projection misses, NoOp emissions. Disabled in production by default. |
| `Information` | State transitions worth seeing in prod: user registered, invite sent, job batch summary, hub connected, FCM push enqueued. |
| `Warning` | Handled abnormal: notifier child failed, FCM token unregistered, photo delete best-effort failed, refresh-token call returned 5xx. |
| `Error` | Unhandled or critical-infra failure WITH the exception attached: unhandled request exception, Firebase init failed, DB unreachable. |

`Error` always has an exception parameter. `Warning` may or may not.

## What MUST NOT appear in logs

- Raw JWTs / refresh tokens (under any name).
- Raw FCM tokens (use a SHA-256-truncated hash if traceability is needed).
- User-provided free text: `User.Bio`, `Report.Reason`, `MeetupReview.Text`, AAD `Email`, `AzureAdB2CId` (use `User.Id` Guid instead).
- Connection strings, Firebase credentials JSON, blob storage SAS query strings.
- Full HTTP request body or query string (path is OK; query may carry tokens — strip).

## Pre-bound context

`CorrelationIdMiddleware` (`Common/Middleware/CorrelationIdMiddleware.cs`) pushes `CorrelationId` onto the Serilog `LogContext` for every request. Inside an endpoint, **don't add `{CorrelationId}` to your message template** — the enricher attaches it automatically.

For ambient context other than the correlation id (e.g. `UserId` of the caller for the duration of a request), use `Serilog.Context.LogContext.PushProperty(...)`:

```csharp
using (LogContext.PushProperty("CallerId", caller.Id))
{
    logger.LogInformation("Invite sent {InviteId} {ReceiverId}", invite.Id, receiver.Id);
}
```

## Output template

The console sink renders `{Timestamp} [{Level}] [{SourceContext}] {Message}` plus `{CorrelationId}` when present. Production swaps to `CompactJsonFormatter` so App Insights / a log aggregator can index every property. Do NOT format the message yourself; rely on the template.

## Request logging

`Program.cs` calls `app.UseSerilogRequestLogging()` after the correlation-id middleware. This emits one Information line per HTTP request with `RequestMethod`, `RequestPath`, `StatusCode`, and `Elapsed` populated automatically. Endpoints should NOT log per-request access lines — that's already covered.

## Testing logger output

When asserting a log line, capture via a lightweight `ILogger<T>` spy (FakeItEasy can't proxy `ILogger<T>` over an `internal` T — see CLAUDE.md). Match on `LogLevel` + a substring of the message template, not the full rendered string. Property values can be asserted via the `state` argument's `IReadOnlyList<KeyValuePair<string, object?>>`.

## Don't

- Don't include the class name as a `[Prefix]` in the message — `SourceContext` already attaches it.
- Don't log the `correlation id` in the message — the enricher does.
- Don't terminate templates with a period.
- Don't write multiple distinct templates for the same logical event — use `{Reason}` to discriminate.
- Don't `Console.WriteLine`, `Trace.WriteLine`, or `print(...)` anywhere in `src/`.
- Don't string-interpolate values into the template — always pass via positional placeholders.
