package zitadel.lockout

import rego.v1

# Lockout policy evaluates whether a user should be locked
# after a failed authentication attempt.
#
# Input:
#   - check_type: "password" or "otp"
#   - failed_attempts: current failed attempt count (before this attempt)
#
# Policy (via input.policy):
#   - max_password_attempts: max password failures before lock (0 = disabled)
#   - max_otp_attempts: max OTP failures before lock (0 = disabled)
#
# Output:
#   - lock: true if the user should be locked after this attempt
#   - reason: human-readable reason for locking

default lock := false

lock if {
	input.check_type == "password"
	input.policy.max_password_attempts > 0
	input.failed_attempts + 1 >= input.policy.max_password_attempts
}

lock if {
	input.check_type == "otp"
	input.policy.max_otp_attempts > 0
	input.failed_attempts + 1 >= input.policy.max_otp_attempts
}

reason := msg if {
	lock
	input.check_type == "password"
	msg := "max password attempts exceeded"
}

reason := msg if {
	lock
	input.check_type == "otp"
	msg := "max OTP attempts exceeded"
}
