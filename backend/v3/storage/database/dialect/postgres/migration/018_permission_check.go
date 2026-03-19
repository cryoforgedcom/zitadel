package migration

import (
	_ "embed"
)

var (
	//go:embed 018_permission_check/up.sql
	up018PermissionCheck string
	//go:embed 018_permission_check/down.sql
	down018PermissionCheck string
)

func init() {
	registerSQLMigration(18, up018PermissionCheck, down018PermissionCheck)
}
