package risk

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/riverqueue/river"
	"github.com/robfig/cron/v3"

	"github.com/zitadel/zitadel/backend/v3/instrumentation"
	"github.com/zitadel/zitadel/backend/v3/instrumentation/logging"
	"github.com/zitadel/zitadel/internal/queue"
)

const drainQueueName = "signal_drain"

// DrainArgs is the job payload for the Redis → PG drain worker.
type DrainArgs struct{}

func (DrainArgs) Kind() string { return "signal.redis_drain" }

// DrainWorker is a River periodic worker that reads signals from a Redis
// Stream (via XREADGROUP) and batch-inserts them into PostgreSQL, then ACKs
// the processed entries.
type DrainWorker struct {
	river.WorkerDefaults[DrainArgs]
	redisClient *redis.Client
	pgSink      SignalSink
	cfg         SignalRedisConfig
	consumer    string
}

// NewDrainWorker creates a drain worker that moves signals from Redis to PG.
func NewDrainWorker(redisClient *redis.Client, pgSink SignalSink, cfg SignalRedisConfig) *DrainWorker {
	return &DrainWorker{
		redisClient: redisClient,
		pgSink:      pgSink,
		cfg:         cfg,
		consumer:    "drain-0",
	}
}

// Register implements [queue.Worker].
func (w *DrainWorker) Register(workers *river.Workers, queues map[string]river.QueueConfig) {
	river.AddWorker[DrainArgs](workers, w)
	queues[drainQueueName] = river.QueueConfig{MaxWorkers: 1}
}

// Work reads a batch from the Redis Stream, writes to PG, and ACKs.
func (w *DrainWorker) Work(ctx context.Context, _ *river.Job[DrainArgs]) error {
	batchSize := w.cfg.DrainBatchSize
	if batchSize <= 0 {
		batchSize = 500
	}

	streams, err := w.redisClient.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    signalConsumerGroup,
		Consumer: w.consumer,
		Streams:  []string{signalStreamKey, ">"},
		Count:    batchSize,
		Block:    0, // non-blocking since we're called periodically
	}).Result()
	if err == redis.Nil || (err == nil && len(streams) == 0) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("xreadgroup: %w", err)
	}

	var (
		signals []Signal
		ids     []string
	)
	for _, stream := range streams {
		for _, msg := range stream.Messages {
			sig, parseErr := signalFromMap(msg.Values)
			if parseErr != nil {
				logging.WithError(ctx, parseErr).Warn("signal_drain.parse_failed",
					slog.String("id", msg.ID),
				)
				// ACK malformed entries so they don't block the stream.
				ids = append(ids, msg.ID)
				continue
			}
			signals = append(signals, sig)
			ids = append(ids, msg.ID)
		}
	}

	if len(signals) == 0 {
		if len(ids) > 0 {
			// ACK any malformed entries.
			return w.ack(ctx, ids)
		}
		return nil
	}

	if err := w.pgSink.WriteBatch(ctx, signals); err != nil {
		return fmt.Errorf("pg write batch: %w", err)
	}

	if err := w.ack(ctx, ids); err != nil {
		// PG write succeeded but ACK failed — entries will be re-delivered.
		// The signals table has no unique constraint, so re-delivery adds
		// duplicate rows. This is acceptable for append-only analytics data
		// and preferred over data loss from premature ACK.
		return fmt.Errorf("xack: %w", err)
	}

	if instrumentation.IsStreamEnabled(instrumentation.StreamRisk) {
		logging.Debug(ctx, "signal_drain.batch_drained",
			slog.Int("count", len(signals)),
		)
	}

	return nil
}

func (w *DrainWorker) ack(ctx context.Context, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	return w.redisClient.XAck(ctx, signalStreamKey, signalConsumerGroup, ids...).Err()
}

// RegisterDrainWorker registers the Redis drain worker with the queue.
// No-op when svc is nil or drain worker is not configured.
func RegisterDrainWorker(ctx context.Context, q *queue.Queue, svc *Service) {
	if svc == nil || svc.drainWorker == nil {
		return
	}
	q.AddWorkers(ctx, svc.drainWorker)
}

// StartDrainSchedule adds the periodic drain job. Must be called after
// q.Start(). No-op when svc is nil or drain worker is not configured.
func StartDrainSchedule(ctx context.Context, q *queue.Queue, svc *Service) {
	if svc == nil || svc.drainWorker == nil {
		return
	}
	interval := svc.cfg.SignalStore.Redis.DrainInterval
	if interval <= 0 {
		interval = 5 * time.Second
	}
	schedule, err := cron.ParseStandard(fmt.Sprintf("@every %s", interval))
	if err != nil {
		logging.WithError(ctx, err).Error("signal_drain.schedule_parse_failed")
		return
	}
	q.AddPeriodicJob(
		ctx,
		schedule,
		&DrainArgs{},
		queue.WithQueueName(drainQueueName),
		queue.WithMaxAttempts(3),
	)
}
