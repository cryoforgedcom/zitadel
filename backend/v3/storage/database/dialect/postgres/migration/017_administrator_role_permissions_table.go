package migration

import (
	_ "embed"
)

var (
	//go:embed 017_administrator_role_permissions_table/up.sql
	up017AdministratorRolePermissionsTable string
	//go:embed 017_administrator_role_permissions_table/down.sql
	down017AdministratorRolePermissionsTable string
)

func init() {
	registerSQLMigration(17, up017AdministratorRolePermissionsTable, down017AdministratorRolePermissionsTable)
}
