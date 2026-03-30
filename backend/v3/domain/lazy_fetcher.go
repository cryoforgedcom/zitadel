package domain

import (
	"context"

	"github.com/zitadel/zitadel/internal/zerrors"
)

type lazyGetter[T any] struct {
	get        func(ctx context.Context, opts *InvokeOpts) (T, error)
	wasFetched bool
	value      T
	err        error
}

func (f *lazyGetter[T]) fetch(ctx context.Context, opts *InvokeOpts) (T, error) {
	if f.wasFetched {
		return f.value, f.err
	}
	if f.get == nil {
		var empty T
		return empty, zerrors.ThrowInternal(nil, "DOM-3gcfDV", "no getter function defined")
	}
	f.wasFetched = true
	f.value, f.err = f.get(ctx, opts)
	return f.value, f.err
}

func (f *lazyGetter[T]) reload(ctx context.Context, opts *InvokeOpts) (T, error) {
	f.wasFetched = false
	return f.fetch(ctx, opts)
}
