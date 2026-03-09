package signals

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/riverqueue/river"
	"github.com/robfig/cron/v3"

	"github.com/zitadel/zitadel/backend/v3/instrumentation"
	"github.com/zitadel/zitadel/backend/v3/instrumentation/logging"
	"github.com/zitadel/zitadel/internal/queue"
)

const archiveQueueName = "signal_archive"

// ArchiveArgs is the job payload for the signal archival worker.
type ArchiveArgs struct{}

func (ArchiveArgs) Kind() string { return "signal.archive" }

// ArchiveWorker is a River periodic worker that archives old PG signal
// partitions to Parquet files and drops them.
type ArchiveWorker struct {
	river.WorkerDefaults[ArchiveArgs]
	db      *sql.DB
	storage ArchiveStorage
	cfg     ArchiveConfig
	pgCfg   SignalPGConfig
	now     func() time.Time
}

// NewArchiveWorker creates a new archival worker.
func NewArchiveWorker(db *sql.DB, storage ArchiveStorage, cfg ArchiveConfig, pgCfg SignalPGConfig) *ArchiveWorker {
	return &ArchiveWorker{
		db:      db,
		storage: storage,
		cfg:     cfg,
		pgCfg:   pgCfg,
		now:     time.Now,
	}
}

// Register implements [queue.Worker].
func (w *ArchiveWorker) Register(workers *river.Workers, queues map[string]river.QueueConfig) {
	river.AddWorker[ArchiveArgs](workers, w)
	queues[archiveQueueName] = river.QueueConfig{MaxWorkers: 1}
}

// Work identifies expired partitions, archives their data to Parquet, and
// drops the partitions.
func (w *ArchiveWorker) Work(ctx context.Context, _ *river.Job[ArchiveArgs]) error {
	now := w.now().UTC()

	// First, apply per-stream retention: delete rows from streams whose
	// retention has expired even if the partition itself is still within
	// the global retention window.
	if err := w.applyStreamRetention(ctx, now); err != nil {
		return err
	}

	// Then archive and drop fully-expired partitions.
	partitions, err := w.expiredPartitions(ctx, now)
	if err != nil {
		return err
	}

	for _, p := range partitions {
		if err := w.archivePartition(ctx, p); err != nil {
			logging.WithError(ctx, err).Error("signal_archive.partition_failed",
				slog.String("partition", p.name),
			)
			continue
		}
	}

	return nil
}

type partitionInfo struct {
	name       string
	upperBound time.Time
}

// expiredPartitions returns partitions whose upper bound is before the
// global retention cutoff.
func (w *ArchiveWorker) expiredPartitions(ctx context.Context, now time.Time) ([]partitionInfo, error) {
	retention := w.pgCfg.Retention
	if retention <= 0 {
		retention = 24 * time.Hour
	}
	cutoff := now.Add(-retention)

	rows, err := w.db.QueryContext(ctx,
		`SELECT c.relname,
		        (regexp_match(
		            pg_get_expr(c.relpartbound, c.oid),
		            'TO \(''([^'']+)''\)'
		        ))[1]::TIMESTAMPTZ AS upper_bound
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
		return nil, fmt.Errorf("list signal partitions: %w", err)
	}
	defer rows.Close()

	var result []partitionInfo
	for rows.Next() {
		var p partitionInfo
		if err := rows.Scan(&p.name, &p.upperBound); err != nil {
			return nil, fmt.Errorf("scan partition: %w", err)
		}
		if p.upperBound.Before(cutoff) {
			result = append(result, p)
		}
	}
	return result, rows.Err()
}

// archivePartition reads all rows from a partition, writes them to Parquet,
// uploads to storage, and drops the partition.
func (w *ArchiveWorker) archivePartition(ctx context.Context, p partitionInfo) error {
	if !validPartitionName.MatchString(p.name) {
		return fmt.Errorf("invalid partition name: %s", p.name)
	}

	rows, err := w.partitionRows(ctx, p.name)
	if err != nil {
		return fmt.Errorf("read partition %s: %w", p.name, err)
	}
	defer rows.Close()

	var (
		totalSignals int
		currentFile  *partitionArchiveFile
	)

	closeCurrent := func() error {
		if currentFile == nil {
			return nil
		}
		size, err := currentFile.Upload(ctx, w.storage)
		if err != nil {
			currentFile.Cleanup()
			return err
		}
		if instrumentation.IsStreamEnabled(instrumentation.StreamRisk) {
			logging.Info(ctx, "signal_archive.partition_archived",
				slog.String("partition", p.name),
				slog.String("instance_id", currentFile.instanceID),
				slog.Int("signal_count", currentFile.count),
				slog.Int64("parquet_bytes", size),
				slog.String("path", currentFile.path),
			)
		}
		currentFile.Cleanup()
		currentFile = nil
		return nil
	}

	for rows.Next() {
		sig, err := scanArchiveSignal(rows)
		if err != nil {
			if currentFile != nil {
				currentFile.Cleanup()
			}
			return err
		}
		if currentFile == nil || sig.InstanceID != currentFile.instanceID {
			if err := closeCurrent(); err != nil {
				return err
			}
			currentFile, err = newPartitionArchiveFile(sig.InstanceID, p.upperBound.Add(-1*time.Hour))
			if err != nil {
				return err
			}
		}
		if err := currentFile.WriteSignal(sig); err != nil {
			currentFile.Cleanup()
			return err
		}
		totalSignals++
	}
	if err := rows.Err(); err != nil {
		if currentFile != nil {
			currentFile.Cleanup()
		}
		return fmt.Errorf("iterate partition rows: %w", err)
	}
	if err := closeCurrent(); err != nil {
		return err
	}

	// Drop the partition.
	if _, err := w.db.ExecContext(ctx,
		fmt.Sprintf("DROP TABLE IF EXISTS signals.%s", p.name),
	); err != nil {
		return fmt.Errorf("drop partition %s: %w", p.name, err)
	}

	logging.Info(ctx, "signal_archive.partition_dropped",
		slog.String("partition", p.name),
		slog.Int("signals_archived", totalSignals),
	)
	return nil
}

func (w *ArchiveWorker) partitionRows(ctx context.Context, name string) (*sql.Rows, error) {
	if !validPartitionName.MatchString(name) {
		return nil, fmt.Errorf("invalid partition name: %s", name)
	}
	return w.db.QueryContext(ctx,
		fmt.Sprintf(`SELECT instance_id, created_at, caller_id, user_id, session_id,
		                    fingerprint_id, stream, operation, resource, outcome,
		                    ip, user_agent, country
		             FROM signals.%s
		             ORDER BY instance_id, created_at, caller_id, user_id, session_id,
		                      fingerprint_id, stream, operation, resource, outcome,
		                      ip, user_agent, country`, name),
	)
}

func scanArchiveSignal(rows *sql.Rows) (Signal, error) {
	var sig Signal
	var (
		userID, sessionID, fpID, resource sql.NullString
		ip, ua, country                   sql.NullString
	)
	if err := rows.Scan(
		&sig.InstanceID, &sig.Timestamp, &sig.CallerID,
		&userID, &sessionID, &fpID,
		&sig.Stream, &sig.Operation, &resource, &sig.Outcome,
		&ip, &ua, &country,
	); err != nil {
		return Signal{}, fmt.Errorf("scan signal: %w", err)
	}
	sig.UserID = userID.String
	sig.SessionID = sessionID.String
	sig.FingerprintID = fpID.String
	sig.Resource = resource.String
	sig.IP = ip.String
	sig.UserAgent = ua.String
	sig.Country = country.String
	return sig, nil
}

type partitionArchiveFile struct {
	instanceID string
	path       string
	file       *os.File
	writer     *parquetStreamWriter
	count      int
}

func newPartitionArchiveFile(instanceID string, archiveTime time.Time) (*partitionArchiveFile, error) {
	f, err := os.CreateTemp("", "zitadel-risk-archive-*.parquet")
	if err != nil {
		return nil, fmt.Errorf("create temp parquet file: %w", err)
	}
	return &partitionArchiveFile{
		instanceID: instanceID,
		path:       ArchivePath(instanceID, archiveTime),
		file:       f,
		writer:     newParquetStreamWriter(f),
	}, nil
}

func (f *partitionArchiveFile) WriteSignal(sig Signal) error {
	if err := f.writer.WriteSignal(sig); err != nil {
		return err
	}
	f.count++
	return nil
}

func (f *partitionArchiveFile) Upload(ctx context.Context, storage ArchiveStorage) (int64, error) {
	if err := f.writer.Close(); err != nil {
		return 0, err
	}
	info, err := f.file.Stat()
	if err != nil {
		return 0, fmt.Errorf("stat temp parquet file: %w", err)
	}
	if _, err := f.file.Seek(0, 0); err != nil {
		return 0, fmt.Errorf("seek temp parquet file: %w", err)
	}
	if err := storage.Write(ctx, f.path, f.file, info.Size()); err != nil {
		return 0, fmt.Errorf("upload parquet %s: %w", f.path, err)
	}
	return info.Size(), nil
}

func (f *partitionArchiveFile) Cleanup() {
	if f == nil || f.file == nil {
		return
	}
	name := f.file.Name()
	_ = f.file.Close()
	_ = os.Remove(name)
	f.file = nil
}

// applyStreamRetention deletes rows from streams that have exceeded their
// per-stream retention, even if the partition is still within the global
// retention window. This allows high-volume streams (e.g. "request") to be
// cleaned up faster than low-volume ones (e.g. "auth").
func (w *ArchiveWorker) applyStreamRetention(ctx context.Context, now time.Time) error {
	if len(w.cfg.StreamRetention) == 0 {
		return nil
	}

	for stream, retention := range w.cfg.StreamRetention {
		cutoff := now.Add(-retention)
		result, err := w.db.ExecContext(ctx,
			`DELETE FROM signals.signals WHERE stream = $1 AND created_at < $2`,
			string(stream), cutoff,
		)
		if err != nil {
			logging.WithError(ctx, err).Warn("signal_archive.stream_retention_failed",
				slog.String("stream", string(stream)),
			)
			continue
		}
		affected, _ := result.RowsAffected()
		if affected > 0 && instrumentation.IsStreamEnabled(instrumentation.StreamRisk) {
			logging.Info(ctx, "signal_archive.stream_retention_applied",
				slog.String("stream", string(stream)),
				slog.Int64("deleted", affected),
				slog.Time("cutoff", cutoff),
			)
		}
	}
	return nil
}

// RegisterArchiveWorker registers the archival worker with the queue.
// No-op when worker is nil.
func RegisterArchiveWorker(ctx context.Context, q *queue.Queue, worker *ArchiveWorker) {
	if worker == nil {
		return
	}
	q.AddWorkers(ctx, worker)
}

// StartArchiveSchedule adds the periodic archival job. Must be called after
// q.Start(). No-op when worker is nil.
func StartArchiveSchedule(ctx context.Context, q *queue.Queue, worker *ArchiveWorker) {
	if worker == nil {
		return
	}
	interval := worker.cfg.Interval
	if interval <= 0 {
		interval = time.Hour
	}
	schedule, err := cron.ParseStandard(fmt.Sprintf("@every %s", interval))
	if err != nil {
		logging.WithError(ctx, err).Error("signal_archive.schedule_parse_failed")
		return
	}
	q.AddPeriodicJob(
		ctx,
		schedule,
		&ArchiveArgs{},
		queue.WithQueueName(archiveQueueName),
		queue.WithMaxAttempts(3),
	)
}
