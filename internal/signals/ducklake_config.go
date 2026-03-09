package signals

import (
	"fmt"
	"time"
)

// DuckLakeConfig configures the DuckLake-based signal store.
// When enabled, signals are stored as Parquet files with catalog metadata
// in PostgreSQL via DuckDB's DuckLake extension.
type DuckLakeConfig struct {
	// Enabled activates the DuckLake signal store.
	// When true, this replaces the PG signal store pipeline.
	Enabled bool
	// DataPath is the root path for Parquet data files.
	// For filesystem backend: "/var/lib/zitadel/signals"
	// For S3 backend: "s3://bucket/signals/"
	DataPath string
	// Backend selects the storage backend: "fs" (default) or "s3".
	Backend ArchiveBackend
	// S3 configures S3-compatible storage when Backend is "s3".
	S3 ArchiveS3Config
	// FlushInterval is how often the emitter flushes buffered signals
	// to DuckLake Parquet files. Default: 30s.
	FlushInterval time.Duration
	// CompactionInterval is how often the compaction worker runs to
	// merge small Parquet files into larger ones. Default: 1h.
	CompactionInterval time.Duration
}

// Validate checks the DuckLake configuration for consistency.
func (c DuckLakeConfig) Validate() error {
	if !c.Enabled {
		return nil
	}
	if c.DataPath == "" {
		return fmt.Errorf("risk signal store ducklake data_path must not be empty")
	}
	if c.Backend == ArchiveBackendS3 {
		if c.S3.Bucket == "" {
			return fmt.Errorf("risk signal store ducklake s3 bucket must not be empty")
		}
	}
	return nil
}
