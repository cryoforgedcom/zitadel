package signals

import (
	"context"
	"database/sql/driver"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"
)

type jsonContainsMatcher struct {
	substrings []string
}

func (m jsonContainsMatcher) Match(v driver.Value) bool {
	value, ok := v.(string)
	if !ok {
		return false
	}
	for _, substring := range m.substrings {
		if !strings.Contains(value, substring) {
			return false
		}
	}
	return true
}

func TestPGStoreInsertSignal_PersistsLegacyFindingNames(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	mock.ExpectExec(`INSERT INTO signals\.signals`).
		WithArgs(
			"instance-1",
			sqlmock.AnyArg(),
			"caller-1",
			"user-1",
			"session-1",
			"fp-1",
			string(StreamAuth),
			"session.create",
			"sessions",
			string(OutcomeBlocked),
			"1.2.3.4",
			"Mozilla/5.0",
			"CH",
			jsonContainsMatcher{substrings: []string{`"findings":[`, `"finding_names":["legacy-rule"]`}},
		).
		WillReturnResult(sqlmock.NewResult(1, 1))

	store := NewPGStore(db, SnapshotConfig{})
	err = store.insertSignal(context.Background(), db, Signal{
		InstanceID:    "instance-1",
		CallerID:      "caller-1",
		UserID:        "user-1",
		SessionID:     "session-1",
		FingerprintID: "fp-1",
		Stream:        StreamAuth,
		Operation:     "session.create",
		Resource:      "sessions",
		Outcome:       OutcomeBlocked,
		IP:            "1.2.3.4",
		UserAgent:     "Mozilla/5.0",
		Country:       "CH",
		Timestamp:     time.Unix(1700000000, 0).UTC(),
	}, []RecordedFinding{{
		Name:       "legacy-rule",
		Message:    "flagged",
		Block:      true,
		Confidence: 0.9,
	}})
	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestPGStoreQuerySignals_FallsBackToLegacyFindingNames(t *testing.T) {
	t.Parallel()

	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	createdAt := time.Unix(1700000000, 0).UTC()
	meta := `{"finding_names":["legacy-block","legacy-stepup"]}`
	rows := sqlmock.NewRows([]string{
		"instance_id", "created_at", "caller_id", "user_id", "session_id", "fingerprint_id",
		"stream", "operation", "resource", "outcome", "ip", "user_agent", "country", "metadata",
	}).AddRow(
		"instance-1", createdAt, "caller-1", "user-1", "session-1", "fp-1",
		string(StreamAuth), "session.create", "sessions", string(OutcomeBlocked), "1.2.3.4", "Mozilla/5.0", "CH", meta,
	)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT signals")).
		WillReturnRows(rows)

	store := NewPGStore(db, SnapshotConfig{})
	signals, err := store.querySignals(context.Background(), "SELECT signals")
	require.NoError(t, err)
	require.Len(t, signals, 1)
	require.Equal(t, []RecordedFinding{
		{Name: "legacy-block"},
		{Name: "legacy-stepup"},
	}, signals[0].Findings)
	require.NoError(t, mock.ExpectationsWereMet())
}
