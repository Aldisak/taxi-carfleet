using System.Net;
using System.Text;

namespace Taxi.Api.Tests.Infrastructure;

/// <summary>A programmable <see cref="HttpMessageHandler"/> stub for exercising <c>MapyClient</c>
/// without real network calls. Records the number of requests made so tests can assert on call counts
/// (e.g. that the circuit breaker short-circuits after repeated failures).</summary>
public sealed class StubMapyHttpHandler : HttpMessageHandler
{
    private int _callCount;
    private readonly Func<HttpRequestMessage, HttpResponseMessage> _responseFactory;

    /// <summary>Number of times <see cref="SendAsync"/> was called.</summary>
    public int CallCount => _callCount;

    /// <summary>Initialises the stub with a fixed response body and status code for all requests.</summary>
    /// <param name="statusCode">HTTP status code to return.</param>
    /// <param name="body">JSON body string to return.</param>
    public StubMapyHttpHandler(HttpStatusCode statusCode = HttpStatusCode.OK, string body = "{}")
    {
        _responseFactory = _ => new HttpResponseMessage(statusCode)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
    }

    /// <summary>Initialises the stub with a factory that receives each request and returns a custom response.</summary>
    /// <param name="responseFactory">Factory invoked per request.</param>
    public StubMapyHttpHandler(Func<HttpRequestMessage, HttpResponseMessage> responseFactory)
    {
        _responseFactory = responseFactory;
    }

    /// <summary>Initialises a stub that always returns 503 Service Unavailable with an empty body.</summary>
    public static StubMapyHttpHandler AlwaysServiceUnavailable() =>
        new(HttpStatusCode.ServiceUnavailable, "{}");

    /// <summary>Initialises a stub that delays past the given timeout before responding (used to exercise timeout paths).</summary>
    /// <param name="delay">How long to wait before returning.</param>
    public static StubMapyHttpHandler AlwaysDelay(TimeSpan delay) =>
        new(req =>
        {
            Thread.Sleep(delay); // synchronous sleep so it blocks the async machinery
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{}", Encoding.UTF8, "application/json") };
        });

    /// <inheritdoc />
    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Interlocked.Increment(ref _callCount);
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_responseFactory(request));
    }
}
