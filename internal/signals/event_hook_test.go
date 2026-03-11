package signals

import "testing"

func TestOutcomeFromEventType(t *testing.T) {
	tests := []struct {
		eventType string
		want      Outcome
	}{
		{"user.created", OutcomeSuccess},
		{"session.added", OutcomeSuccess},
		{"user.token.added", OutcomeSuccess},
		{"user.password.check.failed", OutcomeFailure},
		{"user.login.failed", OutcomeFailure},
		{"session.mfa.failed", OutcomeFailure},
		{"", OutcomeSuccess},
		{"failed", OutcomeSuccess},       // must end with ".failed"
		{"x.failed.y", OutcomeSuccess},   // ".failed" not at end
		{"user.failed", OutcomeFailure},  // ends with ".failed"
	}
	for _, tt := range tests {
		t.Run(tt.eventType, func(t *testing.T) {
			if got := outcomeFromEventType(tt.eventType); got != tt.want {
				t.Errorf("outcomeFromEventType(%q) = %q, want %q", tt.eventType, got, tt.want)
			}
		})
	}
}
