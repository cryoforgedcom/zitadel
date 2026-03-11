package domain

import (
	"context"

	"github.com/zitadel/zitadel/backend/v3/storage/database"
)

type AdministratorRole struct {
	Name        string   `json:"name,omitempty" db:"role_name"`
	Permissions []string `json:"permissions,omitempty" db:"permissions"`
}

type administratorRoleColumns interface {
	PrimaryKeyColumns() []database.Column
	RoleNameColumn() database.Column
	PermissionColumn() database.Column
}

type administratorRoleConditions interface {
	PrimaryKeyCondition(roleName, permission string) database.Condition
	NameCondition(op database.TextOperation, name string) database.Condition
	PermissionCondition(op database.TextOperation, permission string) database.Condition
}

//go:generate mockgen -typed -package domainmock -destination ./mock/administrator_role.mock.go . AdministratorRoleRepository
type AdministratorRoleRepository interface {
	Repository

	administratorRoleColumns
	administratorRoleConditions

	AddPermissions(ctx context.Context, client database.QueryExecutor, role string, permissions ...string) (int64, error)
	RemovePermissions(ctx context.Context, client database.QueryExecutor, role string, permissionsToRemove ...string) (int64, error)
}
