package command

import (
	"context"
	_ "embed"
	"fmt"

	"github.com/open-policy-agent/opa/v1/rego"
	"github.com/zitadel/logging"

	"github.com/zitadel/zitadel/internal/domain"
)

//go:embed lockout_policy.rego
var lockoutRegoSource string

// OPALockoutResult holds the result of an OPA lockout policy evaluation.
type OPALockoutResult struct {
	Lock   bool
	Reason string
}

// LockoutPolicyOPA evaluates lockout decisions using OPA/Rego.
type LockoutPolicyOPA struct {
	query rego.PreparedEvalQuery
}

// NewLockoutPolicyOPA compiles the embedded Rego rules and prepares a query for evaluation.
func NewLockoutPolicyOPA() (*LockoutPolicyOPA, error) {
	query, err := rego.New(
		rego.Query("data.zitadel.lockout"),
		rego.Module("lockout_policy.rego", lockoutRegoSource),
	).PrepareForEval(context.Background())
	if err != nil {
		return nil, fmt.Errorf("failed to prepare OPA lockout query: %w", err)
	}
	return &LockoutPolicyOPA{query: query}, nil
}

// Evaluate runs the OPA lockout policy and returns whether the user should be locked.
func (o *LockoutPolicyOPA) Evaluate(ctx context.Context, checkType string, failedAttempts uint64, policy *domain.LockoutPolicy) OPALockoutResult {
	input := map[string]interface{}{
		"check_type":      checkType,
		"failed_attempts": failedAttempts,
		"policy": map[string]interface{}{
			"max_password_attempts": policy.MaxPasswordAttempts,
			"max_otp_attempts":      policy.MaxOTPAttempts,
		},
	}

	results, err := o.query.Eval(ctx, rego.EvalInput(input))
	if err != nil {
		logging.WithError(err).Warn("OPA lockout policy evaluation failed")
		return OPALockoutResult{}
	}

	if len(results) == 0 || len(results[0].Expressions) == 0 {
		return OPALockoutResult{}
	}

	resultMap, ok := results[0].Expressions[0].Value.(map[string]interface{})
	if !ok {
		return OPALockoutResult{}
	}

	result := OPALockoutResult{}
	if lock, ok := resultMap["lock"].(bool); ok {
		result.Lock = lock
	}
	if reason, ok := resultMap["reason"].(string); ok {
		result.Reason = reason
	}
	return result
}

// logOPALockoutComparison logs a structured comparison of Go vs OPA lockout decisions.
func logOPALockoutComparison(goShouldLock bool, opaResult OPALockoutResult, checkType string, failedAttempts uint64, resourceOwner string) {
	match := goShouldLock == opaResult.Lock

	entry := logging.WithFields(
		"opa_poc", "lockout",
		"check_type", checkType,
		"failed_attempts", failedAttempts,
		"go_lock", goShouldLock,
		"opa_lock", opaResult.Lock,
		"opa_reason", opaResult.Reason,
		"match", match,
		"resource_owner", resourceOwner,
	)

	if !match {
		entry.Warn("OPA lockout result DIVERGES from Go engine")
	} else {
		entry.Info("OPA lockout result matches Go engine")
	}
}
