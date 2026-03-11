package signals

// PREVIEW: Identity Signals is a preview feature. APIs, storage format,
// and configuration may change between releases without notice.

import "context"

type signalUserHolderKey struct{}

// signalUserHolder is a mutable container placed in the request context
// so that the event hook (called synchronously during eventstore.Push)
// can pass the target user ID back to the request interceptor.
type signalUserHolder struct {
	userID string
}

// withSignalUserHolder returns a context carrying a mutable holder.
func withSignalUserHolder(ctx context.Context) (context.Context, *signalUserHolder) {
	h := &signalUserHolder{}
	return context.WithValue(ctx, signalUserHolderKey{}, h), h
}

// signalUserHolderFromCtx retrieves the holder, or nil if absent.
func signalUserHolderFromCtx(ctx context.Context) *signalUserHolder {
	h, _ := ctx.Value(signalUserHolderKey{}).(*signalUserHolder)
	return h
}
