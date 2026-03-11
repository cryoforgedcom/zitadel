package signals

import (
	"context"
	"time"
)

// SignalSink accepts batches of recorded signals for persistence.
type SignalSink interface {
	WriteBatch(ctx context.Context, signals []RecordedSignal) error
}

// SignalReader queries stored signals for the admin API.
type SignalReader interface {
	SearchSignals(ctx context.Context, filters SignalFilters, offset, limit int) ([]RecordedSignal, int64, error)
	AggregateSignals(ctx context.Context, filters SignalFilters, req AggregateRequest) ([]AggregationBucket, error)
}

// SignalFilters defines query predicates for signal searches and aggregations.
type SignalFilters struct {
	InstanceID string
	UserID     string
	SessionID  string
	IP         string
	Stream     string
	Outcome    string
	Operation  string
	Country    string
	Resource   string
	OrgID      string
	ProjectID  string
	ClientID   string
	Payload    string // substring ILIKE match
	TraceID    string
	SpanID     string
	After      *time.Time
	Before     *time.Time
}

// AggregateRequest defines an aggregation query.
type AggregateRequest struct {
	// GroupBy is the field to aggregate on (e.g. "stream", "outcome", "time_bucket").
	GroupBy string
	// TimeBucket is the interval for time-based aggregation (e.g. "5 minutes").
	// Only used when GroupBy is "time_bucket".
	TimeBucket string
	// Metric is the aggregation function: "count" (default) or "distinct_count".
	Metric string
	// SecondaryGroupBy adds a second dimension (e.g. "operation") to produce
	// per-series results when GroupBy is "time_bucket".
	SecondaryGroupBy string
	// Limit caps the number of secondary series (default 5, max 20).
	Limit int
}

// AggregationBucket holds a single aggregation result.
type AggregationBucket struct {
	Key    string
	Count  int64
	Value  float64 // numeric result for avg/sum/percentile metrics
	Series string  // populated when SecondaryGroupBy is set
}
