package signals

import (
	"context"
	"log/slog"
	"sync/atomic"

	"github.com/sony/gobreaker/v2"

	"github.com/zitadel/zitadel/backend/v3/instrumentation"
	"github.com/zitadel/zitadel/backend/v3/instrumentation/logging"
)

// GuardedSink wraps a [SignalSink] with a circuit breaker. When the primary
// sink fails repeatedly, the circuit opens and signals are **dropped** (not
// redirected to PG) to prevent cascading overload. A drop counter is exposed
// for observability.
type GuardedSink struct {
	primary SignalSink
	cb      *gobreaker.CircuitBreaker[struct{}]
	dropped atomic.Int64
}

// NewGuardedSink creates a sink that writes to primary and drops signals
// when the circuit breaker trips.
func NewGuardedSink(primary SignalSink, cbCfg *CBConfig) *GuardedSink {
	gs := &GuardedSink{
		primary: primary,
	}

	cfg := cbCfg
	if cfg == nil {
		cfg = &CBConfig{
			MaxConsecutiveFailures: 5,
			Timeout:               60_000_000_000, // 60s
			MaxRetryRequests:      1,
		}
	}

	gs.cb = gobreaker.NewCircuitBreaker[struct{}](gobreaker.Settings{
		Name:        "signal-sink",
		MaxRequests: cfg.MaxRetryRequests,
		Interval:    cfg.Interval,
		Timeout:     cfg.Timeout,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			if cfg.MaxConsecutiveFailures > 0 && counts.ConsecutiveFailures > cfg.MaxConsecutiveFailures {
				return true
			}
			if cfg.MaxFailureRatio > 0 && counts.Requests > 0 {
				failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
				return failureRatio > cfg.MaxFailureRatio
			}
			return false
		},
		OnStateChange: func(name string, from, to gobreaker.State) {
			logging.Warn(context.Background(), "signal_sink.circuit_breaker.state_change",
				slog.String("name", name),
				slog.String("from", from.String()),
				slog.String("to", to.String()),
			)
		},
	})

	return gs
}

// WriteBatch attempts to write to the primary sink. If the circuit breaker is
// open or the primary fails, signals are dropped and counted — they are NOT
// redirected to PG, protecting the main database from cascading overload.
func (s *GuardedSink) WriteBatch(ctx context.Context, signals []Signal) error {
	_, err := s.cb.Execute(func() (struct{}, error) {
		return struct{}{}, s.primary.WriteBatch(ctx, signals)
	})

	if err == nil {
		return nil
	}

	// Drop signals instead of cascading to PG.
	dropped := int64(len(signals))
	s.dropped.Add(dropped)

	if instrumentation.IsStreamEnabled(instrumentation.StreamRisk) {
		logging.WithError(ctx, err).Warn("signal_sink.primary_failed_dropped",
			slog.Int("batch_size", len(signals)),
			slog.Int64("total_dropped", s.dropped.Load()),
		)
	}

	// Return nil — signals are intentionally dropped, not an error for the caller.
	return nil
}

// Dropped returns the total number of signals dropped due to circuit breaker
// or primary sink failures.
func (s *GuardedSink) Dropped() int64 {
	return s.dropped.Load()
}
