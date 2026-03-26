package v2

import (
	"context"

	"connectrpc.com/connect"

	"github.com/zitadel/zitadel/pkg/grpc/session/v2"
)

func SetSession(ctx context.Context, request *connect.Request[session.SetSessionRequest]) (*connect.Response[session.SetSessionResponse], error) {
	return defaultServer.SetSession(ctx, request)
}

// SetSession implements [sessionconnect.SessionServiceHandler].
func (s *server) SetSession(ctx context.Context, request *connect.Request[session.SetSessionRequest]) (*connect.Response[session.SetSessionResponse], error) {
	panic("unimplemented")
}
