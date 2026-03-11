package projection

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/zitadel/zitadel/backend/v3/domain"
	"github.com/zitadel/zitadel/backend/v3/storage/database"
	"github.com/zitadel/zitadel/backend/v3/storage/database/repository"
	"github.com/zitadel/zitadel/internal/repository/permission"
)

type administratorRolePermission struct {
	RoleName   string `db:"role_name"`
	Permission string `db:"permission"`
}

func TestAdministratorRolePermissionReducers(t *testing.T) {
	handler := &relationalTablesProjection{}
	rawTx, tx := getTransactions(t)
	t.Cleanup(func() {
		require.NoError(t, rawTx.Rollback())
	})
	ctx := t.Context()

	repo := repository.AdministratorRoleRepository()

	t.Run("added event inserts a permission row", func(t *testing.T) {
		event := permission.NewAddedEvent(ctx, permission.NewAggregate("SYSTEM"), "ORG_OWNER", "org.read")
		require.True(t, callReduce(t, ctx, rawTx, handler, event))
		assert.Equal(t,
			[]administratorRolePermission{{RoleName: "ORG_OWNER", Permission: "org.read"}},
			listReducedAdministratorRolePermissions(t, tx),
		)
	})

	t.Run("removed event deletes only the matching permission row", func(t *testing.T) {
		require.NoError(t, repo.Set(ctx, tx, &domain.AdministratorRole{
			Name:        "INSTANCE_OWNER",
			Permissions: []string{"instance.read", "instance.write"},
		}))

		event := permission.NewRemovedEvent(ctx, permission.NewAggregate("SYSTEM"), "INSTANCE_OWNER", "instance.read")
		require.True(t, callReduce(t, ctx, rawTx, handler, event))
		assert.Equal(t,
			[]administratorRolePermission{{RoleName: "INSTANCE_OWNER", Permission: "instance.write"}},
			listReducedAdministratorRolePermissions(t, tx, repo.NameCondition(database.TextOperationEqual, "INSTANCE_OWNER")),
		)
	})
}

func listReducedAdministratorRolePermissions(t *testing.T, tx database.QueryExecutor, conditions ...database.Condition) []administratorRolePermission {
	t.Helper()

	builder := database.NewStatementBuilder(`SELECT role_name, permission FROM zitadel.administrator_role_permissions`)
	if len(conditions) > 0 && conditions[0] != nil {
		builder.WriteString(" WHERE ")
		conditions[0].Write(builder)
	}
	builder.WriteString(" ORDER BY role_name, permission")

	rows, err := tx.Query(t.Context(), builder.String(), builder.Args()...)
	require.NoError(t, err)

	var result []*administratorRolePermission
	require.NoError(t, rows.(database.CollectableRows).Collect(&result))

	out := make([]administratorRolePermission, len(result))
	for i, row := range result {
		out[i] = *row
	}
	return out
}
