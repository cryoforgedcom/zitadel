package zitadel.lockout

import rego.v1

# Custom lockout policy example — demonstrates what an advanced user
# could configure via the Policy Rules API.
#
# Features beyond the default policy:
#   1. Stricter limits for service accounts
#   2. Immediate lock for specific high-risk IP ranges

default lock := false

# Standard password lockout
lock if {
	input.check_type == "password"
	input.policy.max_password_attempts > 0
	input.failed_attempts + 1 >= input.policy.max_password_attempts
}

# Standard OTP lockout
lock if {
	input.check_type == "otp"
	input.policy.max_otp_attempts > 0
	input.failed_attempts + 1 >= input.policy.max_otp_attempts
}

# Stricter limit for service accounts: lock after 3 attempts instead of 5
lock if {
	input.check_type == "password"
	input.user.type == "machine"
	input.failed_attempts + 1 >= 3
}

# Immediate lock for known malicious IP ranges
lock if {
	net.cidr_contains("10.0.0.0/8", input.request.ip)
}
