package signals

import (
	"fmt"
	"strings"
	"time"
)

type SnapshotConfig struct {
	HistoryWindow        time.Duration
	ContextChangeWindow  time.Duration
	MaxSignalsPerUser    int
	MaxSignalsPerSession int
}

// CBConfig mirrors the circuit-breaker knobs used for the Redis signal sink.
type CBConfig struct {
	Interval               time.Duration
	MaxConsecutiveFailures uint32
	MaxFailureRatio        float64
	Timeout                time.Duration
	MaxRetryRequests       uint32
	FailOpen               bool
}

// SignalStoreMode determines the hot-tier write target for signals.
type SignalStoreMode string

const (
	// SignalStoreModePG writes signals directly to PostgreSQL (default).
	SignalStoreModePG SignalStoreMode = "pg"
	// SignalStoreModeRedis writes signals to a Redis Stream, which a drain
	// worker flushes to PostgreSQL in batches.
	SignalStoreModeRedis SignalStoreMode = "redis"
)

type SignalStoreConfig struct {
	// Enabled activates the persistent signal store.
	// When false, the in-memory store is used (default, backward compatible).
	Enabled bool
	// Mode selects the hot-tier write target: "pg" (default) or "redis".
	Mode SignalStoreMode
	// ChannelSize is the buffer size for the fire-and-forget emission channel.
	// Signals are dropped (and counted) when the channel is full.
	ChannelSize int
	// Debounce controls batching of signal writes.
	Debounce DebouncerConfig
	// Postgres configures the warm-tier PG signal table.
	Postgres SignalPGConfig
	// Redis configures the hot-tier Redis Stream (used when Mode is "redis").
	Redis SignalRedisConfig
	// Archive configures the cold-tier Parquet archival.
	Archive ArchiveConfig
	// DuckLake configures the DuckLake-based signal store (Parquet + PG catalog).
	// When DuckLake.Enabled is true, it replaces the PG/Redis/Archive pipeline.
	DuckLake DuckLakeConfig
}

// EffectiveMode returns the configured mode, defaulting to PG.
func (c SignalStoreConfig) EffectiveMode() SignalStoreMode {
	if c.Mode == SignalStoreModeRedis {
		return SignalStoreModeRedis
	}
	return SignalStoreModePG
}

// DebouncerConfig controls how signals are batched before writing to PG.
type DebouncerConfig struct {
	// MinFrequency is the maximum time between flushes.
	MinFrequency time.Duration
	// MaxBulkSize is the maximum batch size before a flush is triggered.
	MaxBulkSize uint
}

// SignalPGConfig configures the PostgreSQL signal table.
type SignalPGConfig struct {
	// PartitionInterval is the time range for each partition (e.g. "1h").
	PartitionInterval time.Duration
	// Retention is how long signals are kept in PG before partition cleanup.
	Retention time.Duration
}

// SignalRedisConfig configures the Redis Stream hot tier.
type SignalRedisConfig struct {
	// MaxLen is the approximate max stream length enforced via XADD MAXLEN ~.
	// 0 means unlimited (not recommended in production).
	MaxLen int64
	// DrainInterval is how often the drain worker reads from Redis and writes
	// to PG. Default: 5s.
	DrainInterval time.Duration
	// DrainBatchSize is the max number of entries read per drain cycle.
	// Default: 500.
	DrainBatchSize int64
	// CircuitBreaker configures the circuit breaker for Redis sink failures.
	// When tripped, signals are dropped to protect the database.
	CircuitBreaker *CBConfig
}

// ArchiveBackend selects the cold-tier storage backend.
type ArchiveBackend string

const (
	ArchiveBackendFS ArchiveBackend = "fs"
	ArchiveBackendS3 ArchiveBackend = "s3"
)

// ArchiveConfig configures the cold-tier Parquet archival.
type ArchiveConfig struct {
	// Enabled activates periodic archival of old signal partitions to Parquet.
	Enabled bool
	// Backend selects the storage backend: "fs" (default) or "s3".
	Backend ArchiveBackend
	// FSPath is the local filesystem path for the "fs" backend.
	FSPath string
	// S3 configures the S3-compatible storage for the "s3" backend.
	S3 ArchiveS3Config
	// Interval is how often the archival worker runs. Default: 1h.
	Interval time.Duration
	// StreamRetention is the per-stream retention in PG before archival.
	// Streams not listed use the global Postgres.Retention.
	// Example: {"request": "24h", "auth": "168h"}
	StreamRetention map[SignalStream]time.Duration
}

// ArchiveS3Config configures S3-compatible storage for signal archival.
type ArchiveS3Config struct {
	Endpoint  string
	Bucket    string
	AccessKey string
	SecretKey string
	UseSSL    bool
}

// EffectiveBackend returns the archive backend, defaulting to FS.
func (c ArchiveConfig) EffectiveBackend() ArchiveBackend {
	if c.Backend == ArchiveBackendS3 {
		return ArchiveBackendS3
	}
	return ArchiveBackendFS
}

func (c SignalStoreConfig) Validate() error {
	if !c.Enabled {
		return nil
	}
	// DuckLake mode replaces PG/Redis pipeline — validate independently.
	if c.DuckLake.Enabled {
		return c.DuckLake.Validate()
	}
	if c.ChannelSize <= 0 {
		return fmt.Errorf("risk signal store channel size must be greater than 0")
	}
	if c.Debounce.MinFrequency <= 0 {
		return fmt.Errorf("risk signal store debounce interval must be greater than 0")
	}
	if c.Postgres.PartitionInterval <= 0 {
		return fmt.Errorf("risk signal store partition interval must be greater than 0")
	}
	if c.Postgres.Retention <= 0 {
		return fmt.Errorf("risk signal store retention must be greater than 0")
	}
	if c.Mode == SignalStoreModeRedis && c.Redis.MaxLen <= 0 {
		return fmt.Errorf("risk signal store redis max_len must be greater than 0")
	}
	if c.Archive.Enabled && c.Archive.EffectiveBackend() == ArchiveBackendFS && strings.TrimSpace(c.Archive.FSPath) == "" {
		return fmt.Errorf("risk signal store archive fs_path must not be empty when backend is fs")
	}
	return nil
}
