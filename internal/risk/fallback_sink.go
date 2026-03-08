package risk

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/sony/gobreaker/v2"

	"github.com/zitadel/zitadel/backend/v3/instrumentation"
	"github.com/zitadel/zitadel/backend/v3/instrumentation/logging"
)

// FallbackSink wraps a primary [SignalSink] with a circuit breaker. When the
// primary fails repeatedly, the circuit opens and writes go to the fallback
// sink (typically PG). When the primary recovers, the circuit closes and
// writes resume on the primary.
type FallbackSink struct {
	primary  SignalSink
	fallback SignalSink
	cb       *gobreaker.CircuitBreaker[struct{}]
}

// NewFallbackSink creates a sink that writes to primary and falls back to
// fallback when the circuit breaker trips. If cbCfg is nil, no circuit
// breaker is applied and the primary is used directly.
func NewFallbackSink(primary, fallback SignalSink, cbCfg *CBConfig) *FallbackSink {
	fs := &FallbackSink{
		primary:  primary,
		fallback: fallback,
	}

	cfg := cbCfg
	if cfg == nil {
		cfg = &CBConfig{
			MaxConsecutiveFailures: 5,
			Timeout:               60_000_000_000, // 60s
			MaxRetryRequests:      1,
		}
	}

	fs.cb = gobreaker.NewCircuitBreaker[struct{}](gobreaker.Settings{
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

	return fs
}

// WriteBatch attempts to write to the primary sink. If the circuit breaker is
// open or the primary fails, it falls back to the fallback sink.
func (s *FallbackSink) WriteBatch(ctx context.Context, signals []Signal) error {
	_, err := s.cb.Execute(func() (struct{}, error) {
		return struct{}{}, s.primary.WriteBatch(ctx, signals)
	})

	if err == nil {
		return nil
	}

	if instrumentation.IsStreamEnabled(instrumentation.StreamRisk) {
		logging.WithError(ctx, err).Warn("signal_sink.primary_failed_fallback",
			slog.Int("batch_size", len(signals)),
		)
	}

	// Fall back to secondary sink.
	if fbErr := s.fallback.WriteBatch(ctx, signals); fbErr != nil {
		return fmt.Errorf("fallback sink: %w (primary: %w)", fbErr, err)
	}
	return nil
}
