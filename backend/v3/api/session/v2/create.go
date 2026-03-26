package v2

import (
	"context"

	"connectrpc.com/connect"

	"github.com/zitadel/zitadel/pkg/grpc/session/v2"
)

func CreateSession(ctx context.Context, request *connect.Request[session.CreateSessionRequest]) (*connect.Response[session.CreateSessionResponse], error) {
	return defaultServer.CreateSession(ctx, request)
}

// CreateSession implements [sessionconnect.SessionServiceHandler].
func (s *server) CreateSession(ctx context.Context, request *connect.Request[session.CreateSessionRequest]) (*connect.Response[session.CreateSessionResponse], error) {
	panic("unimplemented")
}
