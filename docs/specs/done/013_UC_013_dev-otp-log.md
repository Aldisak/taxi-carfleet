# Assignment 013 — Development-only customer OTP code log

Read `00-PROJECT-CONTEXT.md` first. Requires 001 (backend core) and the customer SMS-code auth flow (`Features/Auth/RequestCode`, `Features/Auth/VerifyCode`) — merged. This assignment is **backend-only** (`/api`); it does not touch the web app, the DB schema, or production behavior.

## Why

Local development has no way to read the customer login code. The customer OTP path (`RequestCodeEndpoint`, `POST auth/customer/request-code`) generates a 6-digit code, stores only its **SHA-256 hash** (`SmsCode.CodeHash`), and sends the raw code through `Taxi.Api.Infrastructure.Sms.ISmsSender`. The dev sender wired for that interface — `Infrastructure/Sms/ConsoleSmsSender.cs` — **deliberately masks everything** (logs `Sms sent ****1234`, never the message body) to satisfy `rules/logging.md` (OTP secrets must never appear in logs). Net effect: the code is neither logged nor recoverable from the database, so a developer cannot complete a customer login (`/customer`) locally without manually overwriting the stored hash in Postgres.

We want a **Development-only** affordance that prints the verification code to the API console during local testing, designed so it can **never** leak the OTP in production.

## Goal

In Development, `POST auth/customer/request-code` prints the full 6-digit code to the API console so a developer can complete `verify-code` and log in as a customer. In every other environment the behavior is unchanged (masked marker only), even if the enabling flag were misconfigured. `RequestCodeEndpoint` itself stays clean — the logging concern lives entirely in the SMS sender. This is an intentional, documented exception to `rules/logging.md`'s no-OTP-in-logs rule, scoped strictly to Development.

## Scope

**In:** a new Development-only `ISmsSender` implementation that logs the full message (including the code) only when the host environment is Development; a config-flag gate selecting it over the masked sender; a dev config flag value; unit tests proving both the dev-logs-code and non-dev-masks behaviors; a short dev-docs note.

**Out:** any change to `RequestCodeEndpoint` / `VerifyCodeEndpoint` logic, the `SmsCode` entity or its hashing, the OTP lifetime/rate limits; the `Notifications` SMS senders (GoSms/SmsBrana/`Infrastructure/Notifications/ConsoleSmsSender`) and their operational-message path; returning the code in an HTTP response; any web/frontend change; any production behavior.

## 1. Development-only sender

Add `api/src/Taxi.Api/Infrastructure/Sms/DevConsoleSmsSender.cs` implementing `Taxi.Api.Infrastructure.Sms.ISmsSender`:

- Inject `ILogger<DevConsoleSmsSender>` **and `IHostEnvironment env`** (the hard guard).
- `SendAsync(string phone, string message, CancellationToken ct)`:
  - When `env.IsDevelopment()` → log the full message including the code at `Information` (event-style template per `rules/logging.md`, e.g. `"Dev SMS {Phone} {Body}"` with the raw message as `{Body}`). This is the intended dev exception.
  - Otherwise → log only the masked marker identical to the existing `ConsoleSmsSender` (`"Sms sent {Phone}"` with last-4 masking), never the body.
- XML `/// <summary>` on the class + a bold comment stating it is Development-only, why it intentionally logs the OTP, and that the runtime `IHostEnvironment` check is the guarantee against a production leak.

## 2. Gated registration

In `api/src/Taxi.Api/Features/Auth/AuthFeatureConfiguration.cs` (currently `services.AddSingleton<ISmsSender, ConsoleSmsSender>();`):

- Read a boolean flag `Sms:DevLogCode` via `configuration.GetValue<bool>("Sms:DevLogCode")`.
- If true → register `DevConsoleSmsSender`; else → keep `ConsoleSmsSender`. Preserve the singleton lifetime and the `ISmsSender` service type. (One registration path is chosen, so this is order-independent; mirrors the `Seed:Enabled` precedent.)

## 3. Configuration

- `api/src/Taxi.Api/appsettings.Development.json`: add `"Sms": { "DevLogCode": true }`.
- `api/src/Taxi.Api/appsettings.json`: already has an `Sms` section (`ApiKey`); leave `DevLogCode` absent/false so non-dev environments stay masked. (Defense in depth: the sender's env check suppresses the code even if this flag is ever true in production.)

## 4. Tests

Follow `rules/logging.md#testing-logger-output` (logger spy; assert on `LogLevel` + a substring of the template/args, not the full rendered string):

- `DevConsoleSmsSender` with a Development `IHostEnvironment` → the captured log output **contains the code / full body**.
- `DevConsoleSmsSender` with a non-Development `IHostEnvironment` (e.g. Production) → output is **masked** (no code, no body) — this is the production-safety test.
- Confirm existing `ConsoleSmsSender` and `RequestCode` tests remain green (they register their own fake `ISmsSender`, so they are unaffected).

## 5. Documentation

Add one line to `docs/API-KEYS.md` §2 (SMS) or `docs/DEVELOPER.md`: in Development, `Sms:DevLogCode=true` (already set in `appsettings.Development.json`) prints the customer OTP to the API console so you can complete `/customer` login; never enable it in production.

## Acceptance criteria

1. Running the API in **Development**, `POST auth/customer/request-code` for a valid phone prints the full 6-digit code to the API console; using that code with `POST auth/customer/verify-code` issues a customer JWT.
2. In a **non-Development** environment, the code is **never** logged — only the masked marker — even when `Sms:DevLogCode=true` (proven by a unit test with a Production `IHostEnvironment`).
3. `RequestCodeEndpoint` is unchanged; the masked `ConsoleSmsSender` remains the default when `Sms:DevLogCode` is unset/false.
4. Unit tests cover both the dev-logs-code and non-dev-masks branches and pass; the existing auth/SMS tests stay green.
5. Quality gate: `dotnet build -warnaserror` clean and `dotnet test` green.
