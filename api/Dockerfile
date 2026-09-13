# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Taxi.Api multi-stage image.
#
# DEVIATION from assignment 08 §1: the assignment example says `aspnet:9.0`.
# The project targets net10.0 (api/src/Taxi.Api/Taxi.Api.csproj TargetFramework=net10.0),
# so the runtime base MUST be aspnet:10.0. Recorded in docs/decisions.md.
#
# The `migrate` subcommand (Program.cs CLI arg-intercept, WI A1) is invoked by deploy
# via `docker compose run --rm api migrate` — the ENTRYPOINT below passes it as args[0].
# ─────────────────────────────────────────────────────────────────────────────

# ── Build stage ──────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Directory.Build.props pins the EF Core package versions (MSB3277 fix, see CLAUDE.md).
# It lives at api/ and is imported upward by MSBuild from api/src/Taxi.Api — it MUST be
# present before `dotnet restore`, or restore under -warnaserror reintroduces the conflicts.
COPY ["api/Directory.Build.props", "api/"]
COPY ["api/src/Taxi.Api/Taxi.Api.csproj", "api/src/Taxi.Api/"]
RUN dotnet restore "api/src/Taxi.Api/Taxi.Api.csproj"

COPY api/src/Taxi.Api/ api/src/Taxi.Api/
WORKDIR /src/api/src/Taxi.Api
RUN dotnet publish "Taxi.Api.csproj" -c Release -o /app/publish --no-restore /p:UseAppHost=false

# ── Runtime stage ────────────────────────────────────────────────────────────
# aspnet:10.0 (Debian) ships neither curl nor wget; install curl so the HEALTHCHECK
# below has a binary to run. (Image size target <120 MB is documented as an expectation
# in the runbook — the Debian base is ~220 MB; an alpine base would be the honest path
# to that target, kept as a documented follow-up so the runtime matches the SDK base OS.)
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/publish .

# Kestrel listens on 8080 (non-privileged, so the non-root user can bind it).
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080

# Run as the framework-provided non-root user (uid 1654). $APP_UID is defined by the base image.
USER $APP_UID

# Liveness only — /health/live has Predicate _ => false (no dependency checks); /health/ready
# (DB check) is polled by deploy.yml through the network, not by the container's own healthcheck.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8080/health/live || exit 1

# args[0] can be `migrate` (run EF migrations then exit — WI A1) or empty (serve).
ENTRYPOINT ["dotnet", "Taxi.Api.dll"]
