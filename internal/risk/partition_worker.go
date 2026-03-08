package risk

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"time"

	"github.com/riverqueue/river"
	"github.com/robfig/cron/v3"

	"github.com/zitadel/zitadel/backend/v3/instrumentation/logging"
	"github.com/zitadel/zitadel/internal/queue"
)

const partitionQueueName = "signal_partitions"

// PartitionArgs is the job payload for signal partition management.
type PartitionArgs struct{}

func (PartitionArgs) Kind() string { return "signal.partition_manage" }

// PartitionWorker is a River worker that creates future signal table partitions
// and drops partitions that have exceeded the configured retention window.
type PartitionWorker struct {
	river.WorkerDefaults[PartitionArgs]
	db  *sql.DB
	cfg SignalPGConfig
	now func() time.Time
}

// NewPartitionWorker creates a new partition management worker.
func NewPartitionWorker(db *sql.DB, cfg SignalPGConfig) *PartitionWorker {
	return &PartitionWorker{
		db:  db,
		cfg: cfg,
		now: time.Now,
	}
}

// Register implements [queue.Worker].
func (w *PartitionWorker) Register(workers *river.Workers, queues map[string]river.QueueConfig) {
	river.AddWorker[PartitionArgs](workers, w)
	queues[partitionQueueName] = river.QueueConfig{MaxWorkers: 1}
}

// Work creates upcoming partitions and drops expired ones.
func (w *PartitionWorker) Work(ctx context.Context, _ *river.Job[PartitionArgs]) error {
	now := w.now().UTC()
	interval := w.cfg.PartitionInterval
	if interval <= 0 {
		interval = time.Hour
	}

	// Create partitions for the next 2 intervals ahead.
	for i := 0; i < 3; i++ {
		start := now.Truncate(interval).Add(time.Duration(i) * interval)
		end := start.Add(interval)
		name := partitionName(start, interval)

		query := fmt.Sprintf(
			`CREATE UNLOGGED TABLE IF NOT EXISTS signals.%s
			 PARTITION OF signals.signals
			 FOR VALUES FROM ('%s') TO ('%s')`,
			name,
			start.Format(time.RFC3339),
			end.Format(time.RFC3339),
		)
		if _, err := w.db.ExecContext(ctx, query); err != nil {
			logging.WithError(ctx, err).Error("signal_partition.create_failed",
				slog.String("partition", name),
			)
			return fmt.Errorf("create partition %s: %w", name, err)
		}
	}

	// Drop partitions older than retention.
	if w.cfg.Retention > 0 {
		cutoff := now.Add(-w.cfg.Retention)
		if err := w.dropExpiredPartitions(ctx, cutoff); err != nil {
			return err
		}
	}

	return nil
}

// dropExpiredPartitions detaches and drops partitions whose upper bound is
// before the cutoff time.
func (w *PartitionWorker) dropExpiredPartitions(ctx context.Context, cutoff time.Time) error {
	rows, err := w.db.QueryContext(ctx,
		`SELECT c.relname
		 FROM pg_catalog.pg_class c
		 JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		 JOIN pg_catalog.pg_inherits i ON i.inhrelid = c.oid
		 JOIN pg_catalog.pg_class parent ON parent.oid = i.inhparent
		 WHERE n.nspname = 'signals'
		   AND parent.relname = 'signals'
		   AND c.relname != 'signals_default'
		   AND c.relispartition = true`,
	)
	if err != nil {
		return fmt.Errorf("list signal partitions: %w", err)
	}
	defer rows.Close()

	var partitions []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return fmt.Errorf("scan partition name: %w", err)
		}
		partitions = append(partitions, name)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, name := range partitions {
		var upperBound time.Time
		err := w.db.QueryRowContext(ctx,
			`SELECT (regexp_match(
				pg_get_expr(c.relpartbound, c.oid),
				'TO \(''([^'']+)''\)'
			))[1]::TIMESTAMPTZ
			FROM pg_catalog.pg_class c
			JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = 'signals' AND c.relname = $1`,
			name,
		).Scan(&upperBound)
		if err != nil {
			logging.WithError(ctx, err).Warn("signal_partition.bound_query_failed",
				slog.String("partition", name),
			)
			continue
		}

		if upperBound.Before(cutoff) {
			if _, err := w.db.ExecContext(ctx,
				fmt.Sprintf("DROP TABLE IF EXISTS signals.%s", name),
			); err != nil {
				logging.WithError(ctx, err).Error("signal_partition.drop_failed",
					slog.String("partition", name),
				)
				continue
			}
			logging.Info(ctx, "signal_partition.dropped",
				slog.String("partition", name),
				slog.Time("upper_bound", upperBound),
			)
		}
	}
	return nil
}

// partitionName generates a table name for a time partition.
// For hourly: signals_2026030814
// For daily:  signals_20260308
func partitionName(start time.Time, interval time.Duration) string {
	if interval >= 24*time.Hour {
		return fmt.Sprintf("signals_%s", start.Format("20060102"))
	}
	return fmt.Sprintf("signals_%s", start.Format("2006010215"))
}

// RegisterPartitionWorker registers the partition management worker with the
// queue. Must be called before q.Start(). No-op when svc is nil or the signal
// store is not enabled.
func RegisterPartitionWorker(ctx context.Context, q *queue.Queue, svc *Service) {
	if svc == nil || svc.partitionWorker == nil {
		return
	}
	q.AddWorkers(ctx, svc.partitionWorker)
}

// StartPartitionSchedule adds the periodic partition management job. Must be
// called after q.Start(). No-op when svc is nil or the signal store is not
// enabled.
func StartPartitionSchedule(ctx context.Context, q *queue.Queue, svc *Service) {
	if svc == nil || svc.partitionWorker == nil {
		return
	}
	schedule, err := cron.ParseStandard("@every 10m")
	if err != nil {
		logging.WithError(ctx, err).Error("signal_partition.schedule_parse_failed")
		return
	}
	q.AddPeriodicJob(
		ctx,
		schedule,
		&PartitionArgs{},
		queue.WithQueueName(partitionQueueName),
		queue.WithMaxAttempts(3),
	)
}
