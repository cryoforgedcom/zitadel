//go:build cgo

package signals

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"time"
)

// CompactionWorker merges small Parquet files written by DuckLake into
// larger time-aligned files. This reduces file count on S3/filesystem
// and improves query performance.
type CompactionWorker struct {
	store    *DuckLakeStore
	interval time.Duration
	done     chan struct{}
}

// NewCompactionWorker creates a compaction worker.
func NewCompactionWorker(store *DuckLakeStore, interval time.Duration) *CompactionWorker {
	if interval <= 0 {
		interval = 1 * time.Hour
	}
	return &CompactionWorker{
		store:    store,
		interval: interval,
		done:     make(chan struct{}),
	}
}

// Start runs the compaction loop. It blocks until ctx is cancelled.
func (w *CompactionWorker) Start(ctx context.Context) {
	defer close(w.done)

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			w.run(ctx)
		case <-ctx.Done():
			return
		}
	}
}

// Done returns a channel closed when the worker has stopped.
func (w *CompactionWorker) Done() <-chan struct{} {
	return w.done
}

func (w *CompactionWorker) run(ctx context.Context) {
	if w.store == nil {
		return
	}

	db := w.store.DB()
	if db == nil {
		return
	}

	compacted, err := runCompaction(ctx, db)
	if err != nil {
		slog.ErrorContext(ctx, "identity_signals.compaction_failed",
			slog.String("error", err.Error()),
		)
		return
	}

	if compacted > 0 {
		slog.InfoContext(ctx, "identity_signals.compaction_complete",
			slog.Int("files_compacted", compacted),
		)
	}
}

func runCompaction(ctx context.Context, db *sql.DB) (int, error) {
	var fileCount int
	err := db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM ducklake_data_files('signals', 'signals')",
	).Scan(&fileCount)
	if err != nil {
		slog.WarnContext(ctx, "identity_signals.compaction_skip",
			slog.String("reason", "cannot query data files"),
			slog.String("error", err.Error()),
		)
		return 0, nil
	}

	if fileCount < 10 {
		return 0, nil
	}

	_, err = db.ExecContext(ctx, `
		CREATE OR REPLACE TABLE signals.signals_compacted AS 
		SELECT * FROM signals.signals
	`)
	if err != nil {
		return 0, fmt.Errorf("create compacted table: %w", err)
	}

	_, err = db.ExecContext(ctx, "DROP TABLE IF EXISTS signals.signals")
	if err != nil {
		return 0, fmt.Errorf("drop original table: %w", err)
	}

	_, err = db.ExecContext(ctx, "ALTER TABLE signals.signals_compacted RENAME TO signals")
	if err != nil {
		return 0, fmt.Errorf("rename compacted table: %w", err)
	}

	return fileCount, nil
}
