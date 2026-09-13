namespace Taxi.Api.Common.Ops;

/// <summary>Outermost middleware that counts HTTP 5xx responses and feeds
/// <see cref="FiveHundredRateAlerter"/>. Registered BEFORE <c>UseExceptionHandler</c> so that unhandled
/// exceptions — already converted to a 500 response by the handler downstream — are observed here after
/// <c>next()</c> returns normally (an inner placement would see <c>next()</c> throw and miss the 500).</summary>
internal sealed class FiveHundredCounterMiddleware(RequestDelegate next, FiveHundredRateAlerter alerter)
{
    /// <summary>Invokes the pipeline, then records the response as a server error when the status is 5xx.</summary>
    /// <param name="context">The current HTTP context.</param>
    public async Task InvokeAsync(HttpContext context)
    {
        await next(context);

        // Use CancellationToken.None (not RequestAborted): the alert must complete even when the client
        // disconnects on the firing 500 — the aborted request is often the very incident to page on
        // (mirrors the WI-14 FleetHub flush fix).
        if (context.Response.StatusCode >= 500)
            await alerter.RecordServerErrorAsync(CancellationToken.None);
    }
}
