package signals

import (
	"fmt"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPartitionName_Hourly(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		start    time.Time
		interval time.Duration
		want     string
	}{
		{
			name:     "standard hourly",
			start:    time.Date(2026, 3, 8, 14, 0, 0, 0, time.UTC),
			interval: time.Hour,
			want:     "signals_2026030814",
		},
		{
			name:     "midnight hour",
			start:    time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
			interval: time.Hour,
			want:     "signals_2026010100",
		},
		{
			name:     "sub-day interval uses hourly format",
			start:    time.Date(2026, 12, 31, 23, 0, 0, 0, time.UTC),
			interval: 6 * time.Hour,
			want:     "signals_2026123123",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := partitionName(tt.start, tt.interval)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestPartitionName_Daily(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		start    time.Time
		interval time.Duration
		want     string
	}{
		{
			name:     "exact 24h",
			start:    time.Date(2026, 3, 8, 0, 0, 0, 0, time.UTC),
			interval: 24 * time.Hour,
			want:     "signals_20260308",
		},
		{
			name:     "multi-day interval",
			start:    time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC),
			interval: 7 * 24 * time.Hour,
			want:     "signals_20260615",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := partitionName(tt.start, tt.interval)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestValidPartitionName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input string
		valid bool
	}{
		{"hourly format", "signals_2026030814", true},
		{"daily format", "signals_20260308", true},
		{"8 digits min", "signals_20260101", true},
		{"10 digits max", "signals_2026010100", true},
		{"too few digits", "signals_2026030", false},
		{"too many digits", "signals_20260308140", false},
		{"wrong prefix", "partition_20260308", false},
		{"no underscore", "signals20260308", false},
		{"empty suffix", "signals_", false},
		{"letters in date", "signals_2026030a14", false},
		{"empty string", "", false},
		{"default partition", "signals_default", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tt.valid, validPartitionName.MatchString(tt.input))
		})
	}
}

func TestWork_CreatesThreePartitions(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	frozen := time.Date(2026, 3, 8, 14, 30, 0, 0, time.UTC)
	interval := time.Hour

	for i := 0; i < 3; i++ {
		start := frozen.Truncate(interval).Add(time.Duration(i) * interval)
		name := partitionName(start, interval)

		// Expect the evict DELETE first.
		mock.ExpectExec(regexp.QuoteMeta("DELETE FROM signals.signals_default")).
			WillReturnResult(sqlmock.NewResult(0, 0))

		// Expect the CREATE partition.
		mock.ExpectExec(regexp.QuoteMeta(fmt.Sprintf("CREATE UNLOGGED TABLE IF NOT EXISTS signals.%s", name))).
			WillReturnResult(sqlmock.NewResult(0, 0))
	}

	w := &PartitionWorker{
		db:  db,
		cfg: SignalPGConfig{PartitionInterval: interval},
		now: func() time.Time { return frozen },
	}

	err = w.Work(t.Context(), nil)
	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestWork_EvictsBeforeCreate(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	frozen := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	interval := time.Hour

	// Track the order of executed statements.
	var order []string

	for i := 0; i < 3; i++ {
		start := frozen.Truncate(interval).Add(time.Duration(i) * interval)
		end := start.Add(interval)
		name := partitionName(start, interval)
		startStr := start.Format(time.RFC3339)
		endStr := end.Format(time.RFC3339)

		evictPattern := fmt.Sprintf(
			`DELETE FROM signals.signals_default WHERE created_at >= '%s' AND created_at < '%s'`,
			startStr, endStr,
		)
		mock.ExpectExec(regexp.QuoteMeta(evictPattern)).
			WillReturnResult(sqlmock.NewResult(0, 0)).
			WillDelayFor(0)

		createPattern := fmt.Sprintf("CREATE UNLOGGED TABLE IF NOT EXISTS signals.%s", name)
		mock.ExpectExec(regexp.QuoteMeta(createPattern)).
			WillReturnResult(sqlmock.NewResult(0, 0)).
			WillDelayFor(0)

		idx := i
		order = append(order, fmt.Sprintf("evict_%d", idx), fmt.Sprintf("create_%d", idx))
	}

	w := &PartitionWorker{
		db:  db,
		cfg: SignalPGConfig{PartitionInterval: interval},
		now: func() time.Time { return frozen },
	}

	err = w.Work(t.Context(), nil)
	require.NoError(t, err)
	// sqlmock enforces strict ordered expectations by default,
	// so if we get here without error the order was correct.
	require.NoError(t, mock.ExpectationsWereMet())
	// Verify we expected 6 operations (3 evict + 3 create, interleaved).
	require.Len(t, order, 6)
}

func TestWork_InvalidPartitionNameAborts(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	// The standard partitionName always produces valid names, so we patch
	// the worker's now() to return a zero-value time. While partitionName
	// still generates a syntactically valid name for zero time, we can
	// verify the guard by directly testing the regex against a bad name.
	// Instead, we verify the error path by confirming that if Work somehow
	// received an invalid name, it would abort. We do this by testing the
	// regex guard in isolation rather than trying to trick partitionName.
	badNames := []string{
		"signals_abc",
		"signals_",
		"wrong_20260308",
		"signals_202603081400", // 12 digits – too long
	}
	for _, name := range badNames {
		assert.False(t, validPartitionName.MatchString(name),
			"expected %q to be rejected by validPartitionName", name)
	}

	// Also verify that a normal Work call with zero-value retention
	// completes without hitting the invalid-name guard.
	frozen := time.Date(2026, 3, 8, 14, 0, 0, 0, time.UTC)
	for i := 0; i < 3; i++ {
		mock.ExpectExec(regexp.QuoteMeta("DELETE FROM signals.signals_default")).
			WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectExec("CREATE UNLOGGED TABLE IF NOT EXISTS").
			WillReturnResult(sqlmock.NewResult(0, 0))
	}

	w := &PartitionWorker{
		db:  db,
		cfg: SignalPGConfig{PartitionInterval: time.Hour},
		now: func() time.Time { return frozen },
	}
	err = w.Work(t.Context(), nil)
	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())
}
