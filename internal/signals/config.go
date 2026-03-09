package signals

import "time"

type SnapshotConfig struct {
	HistoryWindow        time.Duration
	ContextChangeWindow  time.Duration
	MaxSignalsPerUser    int
	MaxSignalsPerSession int
}

type SignalStoreConfig struct {
	// Enabled activates the persistent signal store.
	Enabled bool
	// ChannelSize is the buffer size for the fire-and-forget emission channel.
	// Signals are dropped (and counted) when the channel is full.
	ChannelSize int
	// Debounce controls batching of signal writes.
	Debounce DebouncerConfig
	// DuckLake configures the DuckLake-based signal store (Parquet + PG catalog).
	DuckLake DuckLakeConfig
}

// DebouncerConfig controls how signals are batched before writing.
type DebouncerConfig struct {
	// MinFrequency is the maximum time between flushes.
	MinFrequency time.Duration
	// MaxBulkSize is the maximum batch size before a flush is triggered.
	MaxBulkSize uint
}

func (c SignalStoreConfig) Validate() error {
	if !c.Enabled {
		return nil
	}
	return c.DuckLake.Validate()
}
