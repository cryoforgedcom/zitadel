package command

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/zitadel/zitadel/internal/domain"
)

func TestOPALockoutParity(t *testing.T) {
	opa, err := NewLockoutPolicyOPA()
	require.NoError(t, err)

	tests := []struct {
		name           string
		checkType      string
		failedAttempts uint64
		policy         *domain.LockoutPolicy
		wantLock       bool
	}{
		{
			name:           "password: under limit, no lock",
			checkType:      "password",
			failedAttempts: 2,
			policy:         &domain.LockoutPolicy{MaxPasswordAttempts: 5},
			wantLock:       false,
		},
		{
			name:           "password: at limit, lock",
			checkType:      "password",
			failedAttempts: 4,
			policy:         &domain.LockoutPolicy{MaxPasswordAttempts: 5},
			wantLock:       true,
		},
		{
			name:           "password: over limit, lock",
			checkType:      "password",
			failedAttempts: 6,
			policy:         &domain.LockoutPolicy{MaxPasswordAttempts: 5},
			wantLock:       true,
		},
		{
			name:           "password: disabled (0), no lock",
			checkType:      "password",
			failedAttempts: 100,
			policy:         &domain.LockoutPolicy{MaxPasswordAttempts: 0},
			wantLock:       false,
		},
		{
			name:           "password: first failure, limit 1, lock",
			checkType:      "password",
			failedAttempts: 0,
			policy:         &domain.LockoutPolicy{MaxPasswordAttempts: 1},
			wantLock:       true,
		},
		{
			name:           "otp: under limit, no lock",
			checkType:      "otp",
			failedAttempts: 1,
			policy:         &domain.LockoutPolicy{MaxOTPAttempts: 3},
			wantLock:       false,
		},
		{
			name:           "otp: at limit, lock",
			checkType:      "otp",
			failedAttempts: 2,
			policy:         &domain.LockoutPolicy{MaxOTPAttempts: 3},
			wantLock:       true,
		},
		{
			name:           "otp: disabled (0), no lock",
			checkType:      "otp",
			failedAttempts: 50,
			policy:         &domain.LockoutPolicy{MaxOTPAttempts: 0},
			wantLock:       false,
		},
		{
			name:           "password check ignores otp limit",
			checkType:      "password",
			failedAttempts: 10,
			policy:         &domain.LockoutPolicy{MaxPasswordAttempts: 0, MaxOTPAttempts: 3},
			wantLock:       false,
		},
		{
			name:           "otp check ignores password limit",
			checkType:      "otp",
			failedAttempts: 10,
			policy:         &domain.LockoutPolicy{MaxPasswordAttempts: 3, MaxOTPAttempts: 0},
			wantLock:       false,
		},
		{
			name:           "both limits set, password check",
			checkType:      "password",
			failedAttempts: 4,
			policy:         &domain.LockoutPolicy{MaxPasswordAttempts: 5, MaxOTPAttempts: 3},
			wantLock:       true,
		},
		{
			name:           "both limits set, otp check",
			checkType:      "otp",
			failedAttempts: 2,
			policy:         &domain.LockoutPolicy{MaxPasswordAttempts: 5, MaxOTPAttempts: 3},
			wantLock:       true,
		},
		{
			name:           "zero failures, no lock",
			checkType:      "password",
			failedAttempts: 0,
			policy:         &domain.LockoutPolicy{MaxPasswordAttempts: 5},
			wantLock:       false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Go engine logic (mirrors the actual lockout check)
			var goShouldLock bool
			switch tt.checkType {
			case "password":
				goShouldLock = tt.policy.MaxPasswordAttempts > 0 && tt.failedAttempts+1 >= tt.policy.MaxPasswordAttempts
			case "otp":
				goShouldLock = tt.policy.MaxOTPAttempts > 0 && tt.failedAttempts+1 >= tt.policy.MaxOTPAttempts
			}

			// OPA engine
			opaResult := opa.Evaluate(context.Background(), tt.checkType, tt.failedAttempts, tt.policy)

			// Parity check
			assert.Equal(t, goShouldLock, opaResult.Lock, "Go and OPA should agree on lock decision")
			assert.Equal(t, tt.wantLock, goShouldLock, "Go engine result")
			assert.Equal(t, tt.wantLock, opaResult.Lock, "OPA engine result")

			// Verify reason is set when locking
			if opaResult.Lock {
				assert.NotEmpty(t, opaResult.Reason, "OPA should provide a reason when locking")
			}
		})
	}
}
