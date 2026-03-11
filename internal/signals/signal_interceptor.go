package signals

// PREVIEW: Identity Signals is a preview feature. APIs, storage format,
// and configuration may change between releases without notice.

import (
	"context"
	"net"
	"net/http"
	"strings"
	"time"

	"connectrpc.com/connect"
	otel_trace "go.opentelemetry.io/otel/trace"

	"github.com/zitadel/zitadel/internal/api/authz"
	http_util "github.com/zitadel/zitadel/internal/api/http"
	"github.com/zitadel/zitadel/internal/telemetry/tracing"
)

// signalServicePrefix is the gRPC package prefix for the signal API itself.
// Calls to this service are excluded to avoid self-recording.
const signalServicePrefix = "/zitadel.signal."

// SignalConnectUnaryInterceptor returns a ConnectRPC unary interceptor that
// emits a fire-and-forget signal after every call. If the emitter is nil
// the interceptor is a no-op pass-through.
func SignalConnectUnaryInterceptor(emitter *Emitter, geoCountryHeader string) connect.UnaryInterceptorFunc {
	return func(handler connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			if emitter == nil {
				return handler(ctx, req)
			}

			if strings.HasPrefix(req.Spec().Procedure, signalServicePrefix) {
				return handler(ctx, req)
			}

			// Inject a mutable holder so the event hook (called
			// synchronously during eventstore.Push inside handler)
			// can pass the target user ID back to us.
			ctx, holder := withSignalUserHolder(ctx)

			start := time.Now()
			resp, handlerErr := handler(ctx, req)

			ctxData := authz.GetCtxData(ctx)
			instance := authz.GetInstance(ctx)

			outcome := OutcomeSuccess
			if handlerErr != nil {
				outcome = OutcomeFailure
			}

			// Use the target user from events when the authenticated
			// caller differs (e.g. login service user calling
			// CreateSession on behalf of the end user).
			userID := ctxData.UserID
			if holder.userID != "" {
				userID = holder.userID
			}

			hctx := ExtractHTTPContext(http.Header(req.Header()), geoCountryHeader)

			emitter.Emit(Signal{
				InstanceID:     instance.InstanceID(),
				UserID:         userID,
				CallerID:       ctxData.UserID,
				OrgID:          ctxData.OrgID,
				ProjectID:      ctxData.ProjectID,
				ClientID:       ctxData.AgentID,
				Stream:         StreamRequests,
				Operation:      req.Spec().Procedure,
				IP:             stripPort(http_util.RemoteIPFromCtx(ctx)),
				UserAgent:      truncateString(req.Header().Get(http_util.UserAgentHeader), maxUserAgentLen),
				Outcome:        outcome,
				Timestamp:      start.UTC(),
				DurationMs:     time.Since(start).Milliseconds(),
				AcceptLanguage: hctx.AcceptLanguage,
				Country:        hctx.Country,
				ForwardedChain: hctx.ForwardedChain,
				Referer:        hctx.Referer,
				SecFetchSite:   hctx.SecFetchSite,
				IsHTTPS:        hctx.IsHTTPS,
				TraceID:        tracing.TraceIDFromCtx(ctx),
				SpanID:         spanIDFromCtx(ctx),
			})
			return resp, handlerErr
		}
	}
}

// SignalHTTPMiddleware returns an HTTP middleware that emits a fire-and-forget
// signal for every request. Covers OIDC, SAML, login UI, health checks, etc.
//
// If emitter is nil the middleware is a transparent pass-through.
func SignalHTTPMiddleware(emitter *Emitter, geoCountryHeader string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if emitter == nil {
				next.ServeHTTP(w, r)
				return
			}

			// Inject holder before the handler runs.
			ctx, holder := withSignalUserHolder(r.Context())
			r = r.WithContext(ctx)

			start := time.Now()
			rw := &statusCapture{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rw, r)

			if strings.HasPrefix(r.URL.Path, "/zitadel.signal.") ||
				strings.HasPrefix(r.URL.Path, "/v2/signals") ||
				strings.HasPrefix(r.URL.Path, "/api/v2/signals") {
				return
			}

			ctx = r.Context()
			instance := authz.GetInstance(ctx)
			ctxData := authz.GetCtxData(ctx)

			outcome := OutcomeSuccess
			if rw.status >= 400 {
				outcome = OutcomeFailure
			}

			userID := ctxData.UserID
			if holder.userID != "" {
				userID = holder.userID
			}

			hctx := ExtractHTTPContext(r.Header, geoCountryHeader)
			emitter.Emit(Signal{
				InstanceID:     instance.InstanceID(),
				UserID:         userID,
				CallerID:       ctxData.UserID,
				OrgID:          ctxData.OrgID,
				ProjectID:      ctxData.ProjectID,
				ClientID:       ctxData.AgentID,
				Stream:         StreamRequests,
				Operation:      r.Method + " " + r.URL.Path,
				IP:             stripPort(http_util.RemoteIPFromCtx(ctx)),
				UserAgent:      truncateString(r.Header.Get("User-Agent"), maxUserAgentLen),
				Outcome:        outcome,
				Timestamp:      start.UTC(),
				DurationMs:     time.Since(start).Milliseconds(),
				AcceptLanguage: hctx.AcceptLanguage,
				Country:        hctx.Country,
				ForwardedChain: hctx.ForwardedChain,
				Referer:        hctx.Referer,
				SecFetchSite:   hctx.SecFetchSite,
				IsHTTPS:        hctx.IsHTTPS,
				TraceID:        tracing.TraceIDFromCtx(ctx),
				SpanID:         spanIDFromCtx(ctx),
			})
		})
	}
}

// spanIDFromCtx extracts the OpenTelemetry span ID from the context.
func spanIDFromCtx(ctx context.Context) string {
	sc := otel_trace.SpanFromContext(ctx).SpanContext()
	if sc.HasSpanID() {
		return sc.SpanID().String()
	}
	return ""
}

// statusCapture wraps http.ResponseWriter to capture the written status code.
type statusCapture struct {
	http.ResponseWriter
	status int
}

func (s *statusCapture) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// stripPort returns the IP address without the port suffix.
func stripPort(addr string) string {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return addr
	}
	return host
}
