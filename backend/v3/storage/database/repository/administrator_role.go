package repository

import (
	"context"

	"github.com/zitadel/zitadel/backend/v3/domain"
	"github.com/zitadel/zitadel/backend/v3/storage/database"
)

var _ domain.AdministratorRoleRepository = (*administratorRole)(nil)

type administratorRole struct{}

func AdministratorRoleRepository() domain.AdministratorRoleRepository {
	return new(administratorRole)
}

func (administratorRole) unqualifiedTableName() string {
	return "administrator_role_permissions"
}

func (a administratorRole) qualifiedTableName() string {
	return "zitadel." + a.unqualifiedTableName()
}

func (a administratorRole) AddPermissions(ctx context.Context, client database.QueryExecutor, role string, permissions ...string) (int64, error) {
	if len(permissions) == 0 {
		return 0, database.ErrNoChanges
	}
	builder := database.NewStatementBuilder(
		"INSERT INTO zitadel.administrator_role_permissions (role_name, permission)"+
			" SELECT $1::text, unnest($2::text[])"+
			" ON CONFLICT (permission, role_name) DO NOTHING", role, permissions,
	)
	return client.Exec(ctx, builder.String(), builder.Args()...)
}

func (a administratorRole) RemovePermissions(ctx context.Context, client database.QueryExecutor, role string, permissionsToRemove ...string) (int64, error) {
	if len(permissionsToRemove) == 0 {
		return 0, database.ErrNoChanges
	}
	builder := database.NewStatementBuilder(
		"DELETE FROM zitadel.administrator_role_permissions"+
			" WHERE role_name = $1 AND permission = ANY($2::text[])", role, permissionsToRemove,
	)
	return client.Exec(ctx, builder.String(), builder.Args()...)
}

func (a administratorRole) PrimaryKeyCondition(roleName, permission string) database.Condition {
	return database.And(
		a.NameCondition(database.TextOperationEqual, roleName),
		a.PermissionCondition(database.TextOperationEqual, permission),
	)
}

func (a administratorRole) NameCondition(op database.TextOperation, name string) database.Condition {
	return database.NewTextCondition(a.RoleNameColumn(), op, name)
}

func (a administratorRole) PermissionCondition(op database.TextOperation, permission string) database.Condition {
	return database.NewTextCondition(a.PermissionColumn(), op, permission)
}

func (a administratorRole) PrimaryKeyColumns() []database.Column {
	return []database.Column{
		a.PermissionColumn(),
		a.RoleNameColumn(),
	}
}

func (a administratorRole) RoleNameColumn() database.Column {
	return database.NewColumn(a.unqualifiedTableName(), "role_name")
}

func (a administratorRole) PermissionColumn() database.Column {
	return database.NewColumn(a.unqualifiedTableName(), "permission")
}
