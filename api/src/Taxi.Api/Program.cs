using System.Text;
using System.Text.Json.Serialization;
using FastEndpoints;
using FastEndpoints.Swagger;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using Serilog.Formatting.Compact;
using Taxi.Api.Authorization;
using Taxi.Api.Common;
using Taxi.Api.Common.Features;
using Taxi.Api.Common.Orders;
using Taxi.Api.Common.Tenancy;
using Taxi.Api.Common.Tracking;
using Taxi.Api.Infrastructure;
using Taxi.Api.Infrastructure.Jobs;
using Taxi.Api.Infrastructure.Seed;
using Taxi.Api.Realtime;

// Bootstrap logger (used only until host is built).
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    // ── Serilog ────────────────────────────────────────────────────────────────
    builder.Host.UseSerilog((ctx, cfg) =>
    {
        if (ctx.HostingEnvironment.IsDevelopment())
        {
            cfg.WriteTo.Console(
                outputTemplate: "{Timestamp:HH:mm:ss} [{Level:u3}] [{SourceContext}] {Message:lj}{NewLine}{Exception}");
        }
        else
        {
            cfg.WriteTo.Console(new CompactJsonFormatter());
        }

        cfg.ReadFrom.Configuration(ctx.Configuration)
           .Enrich.FromLogContext();
    });

    // ── Global exception handler → RFC 7807 ProblemDetails ───────────────────
    // ValidationFailureExceptionHandler must be registered first — it intercepts
    // ValidationFailureException thrown when DontCatchExceptions() is active.
    builder.Services.AddExceptionHandler<ValidationFailureExceptionHandler>();
    builder.Services.AddProblemDetails();

    // ── EF Core + Npgsql ───────────────────────────────────────────────────────
    var connectionString = builder.Configuration.GetConnectionString("Db");
    if (string.IsNullOrWhiteSpace(connectionString))
        throw new InvalidOperationException("ConnectionStrings:Db is not configured.");

    builder.Services.AddDbContext<TaxiDbContext>(options =>
        options.UseTaxiDb(connectionString));

    // ── JWT bearer authentication ───────────────────────────────────────────────
    var jwtKey = builder.Configuration["Jwt:Key"];
    if (string.IsNullOrWhiteSpace(jwtKey))
        throw new InvalidOperationException("Jwt:Key is not configured.");

    var jwtIssuer = builder.Configuration["Jwt:Issuer"];
    if (string.IsNullOrWhiteSpace(jwtIssuer))
        throw new InvalidOperationException("Jwt:Issuer is not configured.");

    var jwtAudience = builder.Configuration["Jwt:Audience"];
    if (string.IsNullOrWhiteSpace(jwtAudience))
        throw new InvalidOperationException("Jwt:Audience is not configured.");

    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            // Disable claim remapping so raw claim names (sub, role, fleet_id) are preserved.
            // Policies must reference the raw names used during token issuance.
            options.MapInboundClaims = false;

            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = jwtIssuer,
                ValidateAudience = true,
                ValidAudience = jwtAudience,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(
                    Encoding.UTF8.GetBytes(jwtKey)),
                ClockSkew = TimeSpan.FromSeconds(30),
                // Match the raw claim names used in JwtIssuer.
                RoleClaimType = "role",
                NameClaimType = "name"
            };

            // Support JWT in query string for SignalR (WI-13).
            options.Events = new JwtBearerEvents
            {
                OnMessageReceived = ctx =>
                {
                    var accessToken = ctx.Request.Query["access_token"];
                    var path = ctx.HttpContext.Request.Path;
                    if (!string.IsNullOrEmpty(accessToken) &&
                        path.StartsWithSegments("/hubs"))
                    {
                        ctx.Token = accessToken;
                    }

                    return Task.CompletedTask;
                }
            };
        });

    // Authorization — policies defined in WI-05.
    builder.Services.AddAuthorization(AuthorizationPolicies.RegisterPolicies);

    // ── FastEndpoints ─────────────────────────────────────────────────────────
    builder.Services.AddFastEndpoints();

    // ── SignalR ───────────────────────────────────────────────────────────────
    builder.Services.AddSignalR();

    // ── Health checks ─────────────────────────────────────────────────────────
    builder.Services.AddHealthChecks()
        .AddNpgSql(connectionString, name: "postgres", tags: ["ready"]);

    // ── OpenAPI (Development only) ────────────────────────────────────────────
    if (builder.Environment.IsDevelopment())
    {
        builder.Services.SwaggerDocument(o =>
        {
            o.DocumentSettings = s =>
            {
                s.Title = "Taxi API";
                s.Version = "v1";
            };
        });
    }

    // ── CORS ──────────────────────────────────────────────────────────────────
    var webOrigin = builder.Configuration["Cors:WebOrigin"] ?? "http://localhost:5173";
    builder.Services.AddCors(options =>
        options.AddDefaultPolicy(policy =>
            policy.WithOrigins(webOrigin)
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials()));

    // ── Multi-tenancy ─────────────────────────────────────────────────────────
    builder.Services.AddScoped<CurrentTenant>();
    builder.Services.AddScoped<ICurrentTenant>(sp => sp.GetRequiredService<CurrentTenant>());

    // ── Feature-configuration auto-discovery ──────────────────────────────────
    builder.Services.AddFeatureConfigurations(builder.Configuration);

    // ── Order state machine service ────────────────────────────────────────────
    builder.Services.AddOrders();

    // ── Realtime publisher (SignalR-backed, wired in WI-13) ──────────────────
    builder.Services.AddRealtime();

    // ── Background jobs ───────────────────────────────────────────────────────
    builder.Services.AddJobs();

    // ── TimeProvider ──────────────────────────────────────────────────────────
    builder.Services.AddSingleton(TimeProvider.System);

    // ── Tracking token (customer SMS link) ──────────────────────────────────
    // Dev HMAC key lives in appsettings.Development.json; prod key wiring deferred to assignment 08.
    builder.Services.Configure<TrackingOptions>(
        builder.Configuration.GetSection(TrackingOptions.SectionName));
    builder.Services.AddSingleton<TrackingTokenService>();

    // ── Development seeder ────────────────────────────────────────────────────
    // Always registered in Development so tests can resolve and call it directly.
    // Automatic execution at startup is gated by Seed:Enabled (default true in Development;
    // tests override to false via builder.UseSetting("Seed:Enabled", "false")).
    if (builder.Environment.IsDevelopment())
    {
        builder.Services.AddSingleton<DevelopmentSeeder>();
    }

    // ─────────────────────────────────────────────────────────────────────────
    var app = builder.Build();
    // ─────────────────────────────────────────────────────────────────────────

    // ── Startup: migrate + seed (Development only) ────────────────────────────
    // Apply EF Core migrations at startup in Development so docker compose up is self-contained.
    // Tests bypass this by running MigrateAsync in PostgresFixture.InitializeDatabaseAsync instead.
    if (app.Environment.IsDevelopment())
    {
        await using var startupScope = app.Services.CreateAsyncScope();
        var dbContext = startupScope.ServiceProvider.GetRequiredService<TaxiDbContext>();
        await dbContext.Database.MigrateAsync();

        // Seed demo fleet if seeding is enabled (gate: Seed:Enabled defaults to true in Development).
        if (app.Configuration.GetValue("Seed:Enabled", true))
        {
            var seeder = app.Services.GetRequiredService<DevelopmentSeeder>();
            await seeder.SeedAsync();
        }
    }

    app.UseExceptionHandler();

    app.UseSerilogRequestLogging();

    app.UseCors();

    app.UseAuthentication();

    // ── Tenant resolution (after auth — needs JWT claims; before FastEndpoints) ─
    app.UseMiddleware<TenantResolutionMiddleware>();

    app.UseAuthorization();

    // ── FastEndpoints middleware ───────────────────────────────────────────────
    app.UseFastEndpoints(c =>
    {
        c.Endpoints.RoutePrefix = "api/v1";
        c.Errors.UseProblemDetails(x => x.IndicateErrorCode = true);
        c.Serializer.Options.Converters.Add(new JsonStringEnumConverter());
    });

    // ── Swagger UI (Development only) ─────────────────────────────────────────
    if (app.Environment.IsDevelopment())
    {
        app.UseSwaggerGen();
    }

    // ── Health check endpoints ────────────────────────────────────────────────
    app.MapHealthChecks("/health/live", new HealthCheckOptions
    {
        Predicate = _ => false
    });

    app.MapHealthChecks("/health/ready", new HealthCheckOptions
    {
        Predicate = c => c.Tags.Contains("ready")
    });

    // ── SignalR hub ───────────────────────────────────────────────────────────
    app.MapHub<FleetHub>("/hubs/fleet");

    app.Run();
}
catch (Exception ex) when (ex is not HostAbortedException)
{
    Log.Fatal(ex, "Application terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}

/// <summary>Entry point partial class — required for WebApplicationFactory in integration tests.</summary>
public partial class Program { }
