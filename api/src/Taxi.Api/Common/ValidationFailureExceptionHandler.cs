using FastEndpoints;
using Microsoft.AspNetCore.Diagnostics;

namespace Taxi.Api.Common;

/// <summary>
/// Converts <see cref="ValidationFailureException"/> thrown by FastEndpoints validators
/// when <c>DontCatchExceptions()</c> is enabled into RFC 7807 Problem+400 responses.
/// FastEndpoints normally suppresses this exception itself, but <c>DontCatchExceptions()</c>
/// disables that catch and routes all exceptions to the global exception handler instead.
/// This handler intercepts only <see cref="ValidationFailureException"/> and writes the
/// same 400 structure that FastEndpoints would have produced, then falls through for
/// everything else so the existing 500 handler retains coverage.
/// </summary>
internal sealed class ValidationFailureExceptionHandler : IExceptionHandler
{
    /// <inheritdoc />
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        if (exception is not ValidationFailureException validationEx)
            return false;

        var statusCode = validationEx.StatusCode ?? StatusCodes.Status400BadRequest;

        var errors = (validationEx.Failures ?? [])
            .Select(f => new { name = f.PropertyName, reason = f.ErrorMessage, code = f.ErrorCode })
            .ToList<object>();

        var body = new Microsoft.AspNetCore.Mvc.ProblemDetails
        {
            Status = statusCode,
            Title = "One or more validation errors occurred.",
            Type = $"https://httpstatuses.com/{statusCode}"
        };
        body.Extensions["errors"] = errors;

        httpContext.Response.StatusCode = statusCode;
        httpContext.Response.ContentType = "application/problem+json";
        await httpContext.Response.WriteAsJsonAsync(body, cancellationToken);

        return true;
    }
}
