package signals

import (
	"strings"
	"testing"
	"time"
)

// TestFiltersToSQL_InstanceIDAlwaysPresent verifies that instance_id
// is always the first clause — this is the tenant isolation invariant.
func TestFiltersToSQL_InstanceIDAlwaysPresent(t *testing.T) {
	f := SignalFilters{InstanceID: "inst-123"}
	where, args := filtersToSQL(f)

	if !strings.HasPrefix(where, "instance_id = ?") {
		t.Errorf("expected instance_id as first clause, got: %s", where)
	}
	if len(args) == 0 || args[0] != "inst-123" {
		t.Errorf("expected first arg to be instance_id, got: %v", args)
	}
}

// TestFiltersToSQL_EmptyInstanceID ensures even an empty instance_id is
// included in the WHERE clause (defense-in-depth: the handler sets it
// from auth context, but the SQL must never drop the predicate).
func TestFiltersToSQL_EmptyInstanceID(t *testing.T) {
	f := SignalFilters{}
	where, args := filtersToSQL(f)

	if !strings.Contains(where, "instance_id = ?") {
		t.Error("instance_id clause missing from WHERE")
	}
	if len(args) < 1 {
		t.Error("expected at least 1 arg for instance_id")
	}
}

func TestFiltersToSQL_AllFields(t *testing.T) {
	now := time.Now().UTC()
	later := now.Add(time.Hour)
	f := SignalFilters{
		InstanceID: "inst-1",
		UserID:     "user-1",
		SessionID:  "sess-1",
		IP:         "10.0.0.1",
		Operation:  "/zitadel.user",
		Stream:     "requests",
		Outcome:    "success",
		Country:    "DE",
		Resource:   "user/123",
		OrgID:      "org-1",
		ProjectID:  "proj-1",
		ClientID:   "client-1",
		Payload:    "password",
		TraceID:    "abc123",
		SpanID:     "span456",
		After:      &now,
		Before:     &later,
	}
	where, args := filtersToSQL(f)

	// Should have 17 top-level filter fields. The user_id filter uses a
	// compound clause with a subquery, adding 2 extra args (instance_id
	// and user_id repeated for the IN subquery).
	if len(args) != 19 {
		t.Errorf("expected 19 args, got %d", len(args))
	}

	// Verify parameterized queries (no string interpolation)
	if strings.Contains(where, "user-1") {
		t.Error("filter value should not appear in WHERE clause (SQL injection risk)")
	}
	if strings.Contains(where, "10.0.0.1") {
		t.Error("IP value should not appear in WHERE clause")
	}
}

// TestFiltersToSQL_OperationUsesILIKE verifies substring matching
// for operation filters (case-insensitive).
func TestFiltersToSQL_OperationUsesILIKE(t *testing.T) {
	f := SignalFilters{
		InstanceID: "inst-1",
		Operation:  "user.create",
	}
	where, args := filtersToSQL(f)

	if !strings.Contains(where, "operation ILIKE ?") {
		t.Error("operation filter should use ILIKE")
	}
	// Verify the arg is wrapped with %
	for _, arg := range args {
		if s, ok := arg.(string); ok && strings.Contains(s, "user.create") {
			if s != "%user.create%" {
				t.Errorf("operation arg should be wrapped with %%, got %q", s)
			}
		}
	}
}

// TestFiltersToSQL_UserIDTraceCorrelation verifies that filtering by
// user_id uses a subquery to also include signals sharing a trace_id.
func TestFiltersToSQL_UserIDTraceCorrelation(t *testing.T) {
	f := SignalFilters{
		InstanceID: "inst-1",
		UserID:     "user-42",
	}
	where, args := filtersToSQL(f)

	if !strings.Contains(where, "user_id = ?") {
		t.Error("should include direct user_id match")
	}
	if !strings.Contains(where, "trace_id IN (SELECT DISTINCT trace_id FROM signals") {
		t.Error("should include trace_id subquery for correlation")
	}
	// 1 (instance_id) + 3 (user_id compound: user_id, instance_id, user_id)
	if len(args) != 4 {
		t.Errorf("expected 4 args, got %d", len(args))
	}
}

// TestFiltersToSQL_PayloadUsesILIKE verifies substring matching for payload.
func TestFiltersToSQL_PayloadUsesILIKE(t *testing.T) {
	f := SignalFilters{
		InstanceID: "inst-1",
		Payload:    "clientID",
	}
	where, _ := filtersToSQL(f)

	if !strings.Contains(where, "payload ILIKE ?") {
		t.Error("payload filter should use ILIKE")
	}
}

// TestFiltersToSQL_SQLInjectionAttempts tests that malicious filter
// values don't produce unsafe SQL.
func TestFiltersToSQL_SQLInjectionAttempts(t *testing.T) {
	injections := []string{
		"'; DROP TABLE signals; --",
		"1 OR 1=1",
		"' UNION SELECT * FROM pg_shadow --",
		"Robert'); DROP TABLE students;--",
	}
	for _, inject := range injections {
		f := SignalFilters{
			InstanceID: inject,
			UserID:     inject,
			IP:         inject,
		}
		where, args := filtersToSQL(f)

		// Values must NEVER appear in the SQL string — only as ? params
		if strings.Contains(where, inject) {
			t.Errorf("injection value %q leaked into WHERE clause: %s", inject, where)
		}
		// All values must be in args
		foundCount := 0
		for _, arg := range args {
			if s, ok := arg.(string); ok && s == inject {
				foundCount++
			}
		}
		if foundCount < 1 {
			t.Errorf("expected injection value %q in args, not found", inject)
		}
	}
}

func TestIsAllowedInterval(t *testing.T) {
	valid := []string{
		"1 minute", "5 minutes", "10 minutes", "15 minutes", "30 minutes",
		"1 hour", "3 hours", "6 hours", "12 hours",
		"1 day", "1 week", "1 month",
	}
	for _, v := range valid {
		if !isAllowedInterval(v) {
			t.Errorf("expected %q to be allowed", v)
		}
	}

	invalid := []string{
		"",
		"2 hours",
		"1 year",
		"1'; DROP TABLE signals; --",
		"1 second",
		"0 minutes",
		"INTERVAL '1 hour'",
		"1 hour); DROP TABLE signals; --",
	}
	for _, v := range invalid {
		if isAllowedInterval(v) {
			t.Errorf("expected %q to be rejected", v)
		}
	}
}

func TestAllowedGroupByFields(t *testing.T) {
	valid := []string{
		"stream", "outcome", "operation", "country", "user_id",
		"ip", "org_id", "project_id", "client_id", "resource",
		"user_agent", "referer",
	}
	for _, v := range valid {
		if _, ok := allowedGroupByFields[v]; !ok {
			t.Errorf("expected %q in allowedGroupByFields", v)
		}
	}

	invalid := []string{
		"",
		"instance_id",        // must never be groupable (tenant isolation)
		"password",
		"1; DROP TABLE x; --",
		"payload",            // payload should not be groupable
		"findings",
	}
	for _, v := range invalid {
		if _, ok := allowedGroupByFields[v]; ok {
			t.Errorf("expected %q to NOT be in allowedGroupByFields", v)
		}
	}
}

func TestValidateGroupBy(t *testing.T) {
	// time_bucket is special
	col, err := validateGroupBy("time_bucket")
	if err != nil || col != "time_bucket" {
		t.Errorf("time_bucket should be valid, got col=%q err=%v", col, err)
	}

	// valid field
	col, err = validateGroupBy("stream")
	if err != nil || col != "stream" {
		t.Errorf("stream should be valid, got col=%q err=%v", col, err)
	}

	// invalid field
	_, err = validateGroupBy("DROP TABLE")
	if err == nil {
		t.Error("expected error for invalid group_by field")
	}
}

func TestEscapeSQLString(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"hello", "hello"},
		{"it's", "it''s"},
		{"a'b'c", "a''b''c"},
		{"", ""},
		{"no_quotes", "no_quotes"},
	}
	for _, tt := range tests {
		if got := escapeSQLString(tt.input); got != tt.want {
			t.Errorf("escapeSQLString(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}
