package signals

import (
	"fmt"
	"strings"
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

	if f.UserID != "" {
		clauses = append(clauses, "user_id = ?")
		args = append(args, f.UserID)
	}
	if f.SessionID != "" {
		clauses = append(clauses, "session_id = ?")
		args = append(args, f.SessionID)
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
		clauses = append(clauses, "org_id = ?")
		args = append(args, f.OrgID)
	}
	if f.ProjectID != "" {
		clauses = append(clauses, "project_id = ?")
		args = append(args, f.ProjectID)
	}
	if f.ClientID != "" {
		clauses = append(clauses, "client_id = ?")
		args = append(args, f.ClientID)
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
