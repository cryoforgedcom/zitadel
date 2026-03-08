package risk

import (
	"context"
	"time"

	"connectrpc.com/connect"

	"github.com/zitadel/zitadel/internal/api/authz"
	http_util "github.com/zitadel/zitadel/internal/api/http"
)

// SignalConnectUnaryInterceptor returns a ConnectRPC unary interceptor that
// emits a fire-and-forget risk signal after every call. If the emitter is nil
// the interceptor is a no-op pass-through.
func SignalConnectUnaryInterceptor(emitter *Emitter) connect.UnaryInterceptorFunc {
	return func(handler connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			resp, handlerErr := handler(ctx, req)

			if emitter == nil {
				return resp, handlerErr
			}

			ctxData := authz.GetCtxData(ctx)
			instance := authz.GetInstance(ctx)

			outcome := OutcomeSuccess
			if handlerErr != nil {
				outcome = OutcomeFailure
			}

			emitter.Emit(Signal{
				InstanceID: instance.InstanceID(),
				CallerID:   ctxData.UserID,
				Stream:     StreamRequest,
				Operation:  req.Spec().Procedure,
				IP:         http_util.RemoteIPFromCtx(ctx),
				UserAgent:  truncateString(req.Header().Get(http_util.UserAgentHeader), maxUserAgentLen),
				Outcome:    outcome,
				Timestamp:  time.Now().UTC(),
			})
			return resp, handlerErr
		}
	}
}
