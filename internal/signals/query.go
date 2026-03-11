package signals

import (
	"fmt"
	"strings"
	"time"
)

// allowedGroupByFields maps API group_by values to SQL column names.
// This is a strict allowlist — unknown fields are rejected.
var allowedGroupByFields = map[string]string{
	"stream":     "stream",
	"outcome":    "outcome",
	"operation":  "operation",
	"country":    "country",
	"user_id":    "user_id",
	"ip":         "ip",
	"org_id":     "org_id",
	"project_id": "project_id",
	"client_id":  "client_id",
	"resource":   "resource",
	"user_agent": "user_agent",
	"referer":    "referer",
}

// allowedIntervals is a strict allowlist for time_bucket intervals
// to prevent SQL injection through the interval parameter.
var allowedIntervals = map[string]bool{
	"1 minute":   true,
	"5 minutes":  true,
	"10 minutes": true,
	"15 minutes": true,
	"30 minutes": true,
	"1 hour":     true,
	"3 hours":    true,
	"6 hours":    true,
	"12 hours":   true,
	"1 day":      true,
	"1 week":     true,
	"1 month":    true,
}

func isAllowedInterval(interval string) bool {
	return allowedIntervals[interval]
}

// filtersToSQL builds a WHERE clause from SignalFilters using
// parameterised queries (?-placeholders). The instance_id filter is
// always included as the first clause to enforce tenant isolation.
func filtersToSQL(f SignalFilters) (string, []any) {
	var clauses []string
	var args []any

	clauses = append(clauses, "instance_id = ?")
	args = append(args, f.InstanceID)

	// Entity filters use trace correlation: include signals that belong
	// to the entity directly, plus any signals sharing a trace_id with
	// the entity's signals. This correlates request signals (e.g.
	// CreateSession made by a service user) with the event signals they
	// produced for the actual end user.
	if f.UserID != "" {
		c, a := traceCorrelationClause("user_id", f.UserID, f.InstanceID, f.After, f.Before)
		clauses = append(clauses, c)
		args = append(args, a...)
	}
	if f.SessionID != "" {
		c, a := traceCorrelationClause("session_id", f.SessionID, f.InstanceID, f.After, f.Before)
		clauses = append(clauses, c)
		args = append(args, a...)
	}
	if f.IP != "" {
		clauses = append(clauses, "ip = ?")
		args = append(args, f.IP)
	}
	if f.Operation != "" {
		clauses = append(clauses, "operation ILIKE ?")
		args = append(args, "%"+f.Operation+"%")
	}
	if f.Stream != "" {
		clauses = append(clauses, "stream = ?")
		args = append(args, f.Stream)
	}
	if f.Outcome != "" {
		clauses = append(clauses, "outcome = ?")
		args = append(args, f.Outcome)
	}
	if f.Country != "" {
		clauses = append(clauses, "country = ?")
		args = append(args, f.Country)
	}
	if f.Resource != "" {
		clauses = append(clauses, "resource = ?")
		args = append(args, f.Resource)
	}
	if f.OrgID != "" {
		c, a := traceCorrelationClause("org_id", f.OrgID, f.InstanceID, f.After, f.Before)
		clauses = append(clauses, c)
		args = append(args, a...)
	}
	if f.ProjectID != "" {
		clauses = append(clauses, "project_id = ?")
		args = append(args, f.ProjectID)
	}
	if f.ClientID != "" {
		c, a := traceCorrelationClause("client_id", f.ClientID, f.InstanceID, f.After, f.Before)
		clauses = append(clauses, c)
		args = append(args, a...)
	}
	if f.Payload != "" {
		clauses = append(clauses, "payload ILIKE ?")
		args = append(args, "%"+f.Payload+"%")
	}
	if f.TraceID != "" {
		clauses = append(clauses, "trace_id = ?")
		args = append(args, f.TraceID)
	}
	if f.SpanID != "" {
		clauses = append(clauses, "span_id = ?")
		args = append(args, f.SpanID)
	}
	if f.After != nil {
		clauses = append(clauses, "created_at >= ?")
		args = append(args, f.After.UTC())
	}
	if f.Before != nil {
		clauses = append(clauses, "created_at < ?")
		args = append(args, f.Before.UTC())
	}

	return strings.Join(clauses, " AND "), args
}

// traceCorrelationClause builds a compound filter that matches a field
// directly OR via trace_id correlation. The subquery finds trace_ids
// associated with the entity and the outer clause includes any signal
// sharing one of those trace_ids.
//
// Time bounds are passed into the subquery to prevent full table scans.
func traceCorrelationClause(field, value, instanceID string, after, before *time.Time) (string, []any) {
	// Args for the outer clause: (field = ? OR ...)
	// followed by args for the subquery: instance_id = ? AND field = ? [AND time bounds]
	var subClauses []string
	var subArgs []any

	subClauses = append(subClauses, "instance_id = ?")
	subArgs = append(subArgs, instanceID)

	subClauses = append(subClauses, field+" = ?")
	subArgs = append(subArgs, value)

	subClauses = append(subClauses, "trace_id != ''")

	if after != nil {
		subClauses = append(subClauses, "created_at >= ?")
		subArgs = append(subArgs, after.UTC())
	}
	if before != nil {
		subClauses = append(subClauses, "created_at < ?")
		subArgs = append(subArgs, before.UTC())
	}

	subWhere := strings.Join(subClauses, " AND ")
	clause := fmt.Sprintf(
		"(%s = ? OR (trace_id != '' AND trace_id IN ("+
			"SELECT DISTINCT trace_id FROM signals.signals "+
			"WHERE %s"+
			")))",
		field, subWhere,
	)

	// First arg is for the outer "field = ?", rest are subquery args
	args := append([]any{value}, subArgs...)
	return clause, args
}

func escapeSQLString(s string) string {
	return strings.ReplaceAll(s, "'", "''")
}

// validateGroupBy checks that the group_by field is in the allowlist.
// Returns the SQL column name or an error.
func validateGroupBy(field string) (string, error) {
	if field == "time_bucket" {
		return "time_bucket", nil
	}
	col, ok := allowedGroupByFields[field]
	if !ok {
		return "", fmt.Errorf("unsupported group_by field: %q", field)
	}
	return col, nil
}
