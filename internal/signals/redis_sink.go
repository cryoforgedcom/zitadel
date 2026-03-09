package signals

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/zitadel/zitadel/backend/v3/instrumentation"
	"github.com/zitadel/zitadel/backend/v3/instrumentation/logging"
)

const (
	// signalStreamKey is the Redis Stream key for risk signals.
	signalStreamKey = "zitadel:signals"
	// signalConsumerGroup is the consumer group for the drain worker.
	signalConsumerGroup = "signal-drain"
)

// RedisStreamSink writes signal batches to a Redis Stream via XADD.
// It implements [SignalSink].
type RedisStreamSink struct {
	client *redis.Client
	cfg    SignalRedisConfig
}

// NewRedisStreamSink creates a new Redis Stream sink.
func NewRedisStreamSink(client *redis.Client, cfg SignalRedisConfig) *RedisStreamSink {
	return &RedisStreamSink{client: client, cfg: cfg}
}

// WriteBatch writes a batch of signals to the Redis Stream using a pipeline.
func (s *RedisStreamSink) WriteBatch(ctx context.Context, signals []Signal) error {
	if len(signals) == 0 {
		return nil
	}

	pipe := s.client.Pipeline()
	for _, sig := range signals {
		args := &redis.XAddArgs{
			Stream: signalStreamKey,
			Values: signalToMap(sig),
		}
		if s.cfg.MaxLen > 0 {
			args.MaxLen = s.cfg.MaxLen
			args.Approx = true
		}
		pipe.XAdd(ctx, args)
	}

	cmds, err := pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("redis xadd pipeline: %w", err)
	}

	// Check individual command errors.
	var firstErr error
	for _, cmd := range cmds {
		if cmd.Err() != nil && firstErr == nil {
			firstErr = cmd.Err()
		}
	}
	if firstErr != nil {
		return fmt.Errorf("redis xadd: %w", firstErr)
	}

	if instrumentation.IsStreamEnabled(instrumentation.StreamRisk) {
		logging.Debug(ctx, "signal_store.redis.batch_written",
			slog.Int("count", len(signals)),
		)
	}
	return nil
}

// EnsureConsumerGroup creates the consumer group if it doesn't exist.
// Safe to call multiple times.
func (s *RedisStreamSink) EnsureConsumerGroup(ctx context.Context) error {
	err := s.client.XGroupCreateMkStream(ctx, signalStreamKey, signalConsumerGroup, "0").Err()
	if err != nil && !isConsumerGroupExistsErr(err) {
		return fmt.Errorf("create consumer group: %w", err)
	}
	return nil
}

func isConsumerGroupExistsErr(err error) bool {
	return err != nil && err.Error() == "BUSYGROUP Consumer Group name already exists"
}

// signalToMap converts a Signal to a flat map for XADD values.
func signalToMap(sig Signal) map[string]any {
	m := map[string]any{
		"instance_id": sig.InstanceID,
		"stream":      string(sig.Stream),
		"operation":   sig.Operation,
		"outcome":     string(sig.Outcome),
		"ip":          sig.IP,
		"user_agent":  sig.UserAgent,
		"timestamp":   sig.Timestamp.Format(time.RFC3339Nano),
	}
	if sig.CallerID != "" {
		m["caller_id"] = sig.CallerID
	}
	if sig.UserID != "" {
		m["user_id"] = sig.UserID
	}
	if sig.SessionID != "" {
		m["session_id"] = sig.SessionID
	}
	if sig.Resource != "" {
		m["resource"] = sig.Resource
	}
	return m
}

// signalFromMap reconstructs a Signal from a Redis Stream entry's values.
func signalFromMap(vals map[string]any) (Signal, error) {
	sig := Signal{
		InstanceID: strVal(vals, "instance_id"),
		CallerID:   strVal(vals, "caller_id"),
		UserID:     strVal(vals, "user_id"),
		SessionID:  strVal(vals, "session_id"),
		Stream:     SignalStream(strVal(vals, "stream")),
		Operation:  strVal(vals, "operation"),
		Resource:   strVal(vals, "resource"),
		IP:         strVal(vals, "ip"),
		UserAgent:  strVal(vals, "user_agent"),
		Outcome:    Outcome(strVal(vals, "outcome")),
	}

	if ts := strVal(vals, "timestamp"); ts != "" {
		t, err := time.Parse(time.RFC3339Nano, ts)
		if err != nil {
			return sig, fmt.Errorf("parse timestamp %q: %w", ts, err)
		}
		sig.Timestamp = t
	}

	return sig, nil
}

func strVal(m map[string]any, key string) string {
	v, ok := m[key]
	if !ok {
		return ""
	}
	s, _ := v.(string)
	return s
}
