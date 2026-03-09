package projection

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	repoDomain "github.com/zitadel/zitadel/backend/v3/domain"
	"github.com/zitadel/zitadel/backend/v3/storage/database"
	"github.com/zitadel/zitadel/backend/v3/storage/database/repository"
	"github.com/zitadel/zitadel/internal/repository/instance"
	"github.com/zitadel/zitadel/internal/repository/org"
	"github.com/zitadel/zitadel/internal/repository/project"
)

func TestAdministratorRelationalReducers(t *testing.T) {
	t.Run("instance administrator", func(t *testing.T) {
		rawTx, tx := getTransactions(t)
		t.Cleanup(func() {
			require.NoError(t, rawTx.Rollback())
		})

		instanceID, userID, _, _, _ := seedAdministratorRelationalState(t, tx)
		adminRepo := repository.AdministratorRepository()
		handler := &administratorRelationalProjection{}
		ctx := t.Context()

		added := instance.NewMemberAddedEvent(ctx, &instance.NewAggregate(instanceID).Aggregate, userID, "IAM_OWNER")
		require.True(t, callReduce(t, ctx, rawTx, handler, added))

		admin, err := adminRepo.Get(ctx, tx, database.WithCondition(
			database.And(adminRepo.InstanceAdministratorCondition(instanceID), adminRepo.UserIDCondition(userID)),
		))
		require.NoError(t, err)
		assert.Equal(t, []string{"IAM_OWNER"}, admin.Roles)

		changed := instance.NewMemberChangedEvent(ctx, &instance.NewAggregate(instanceID).Aggregate, userID, "IAM_OWNER_VIEWER")
		require.True(t, callReduce(t, ctx, rawTx, handler, changed))

		admin, err = adminRepo.Get(ctx, tx, database.WithCondition(
			database.And(adminRepo.InstanceAdministratorCondition(instanceID), adminRepo.UserIDCondition(userID)),
		))
		require.NoError(t, err)
		assert.Equal(t, []string{"IAM_OWNER_VIEWER"}, admin.Roles)

		removed := instance.NewMemberRemovedEvent(ctx, &instance.NewAggregate(instanceID).Aggregate, userID)
		require.True(t, callReduce(t, ctx, rawTx, handler, removed))

		_, err = adminRepo.Get(ctx, tx, database.WithCondition(
			database.And(adminRepo.InstanceAdministratorCondition(instanceID), adminRepo.UserIDCondition(userID)),
		))
		require.ErrorIs(t, err, database.NewNoRowFoundError(nil))
	})

	t.Run("organization administrator", func(t *testing.T) {
		rawTx, tx := getTransactions(t)
		t.Cleanup(func() {
			require.NoError(t, rawTx.Rollback())
		})

		instanceID, userID, orgID, _, _ := seedAdministratorRelationalState(t, tx)
		adminRepo := repository.AdministratorRepository()
		handler := &administratorRelationalProjection{}
		ctx := t.Context()

		orgAggregate := org.NewAggregate(orgID)
		orgAggregate.InstanceID = instanceID

		added := org.NewMemberAddedEvent(ctx, &orgAggregate.Aggregate, userID, "ORG_OWNER")
		require.True(t, callReduce(t, ctx, rawTx, handler, added))

		admin, err := adminRepo.Get(ctx, tx, database.WithCondition(
			database.And(adminRepo.OrganizationAdministratorCondition(instanceID, orgID), adminRepo.UserIDCondition(userID)),
		))
		require.NoError(t, err)
		assert.Equal(t, []string{"ORG_OWNER"}, admin.Roles)

		changed := org.NewMemberChangedEvent(ctx, &orgAggregate.Aggregate, userID, "ORG_OWNER_VIEWER")
		require.True(t, callReduce(t, ctx, rawTx, handler, changed))

		admin, err = adminRepo.Get(ctx, tx, database.WithCondition(
			database.And(adminRepo.OrganizationAdministratorCondition(instanceID, orgID), adminRepo.UserIDCondition(userID)),
		))
		require.NoError(t, err)
		assert.Equal(t, []string{"ORG_OWNER_VIEWER"}, admin.Roles)

		removed := org.NewMemberRemovedEvent(ctx, &orgAggregate.Aggregate, userID)
		require.True(t, callReduce(t, ctx, rawTx, handler, removed))

		_, err = adminRepo.Get(ctx, tx, database.WithCondition(
			database.And(adminRepo.OrganizationAdministratorCondition(instanceID, orgID), adminRepo.UserIDCondition(userID)),
		))
		require.ErrorIs(t, err, database.NewNoRowFoundError(nil))
	})

	t.Run("project administrator", func(t *testing.T) {
		rawTx, tx := getTransactions(t)
		t.Cleanup(func() {
			require.NoError(t, rawTx.Rollback())
		})

		instanceID, userID, orgID, projectID, _ := seedAdministratorRelationalState(t, tx)
		adminRepo := repository.AdministratorRepository()
		handler := &administratorRelationalProjection{}
		ctx := t.Context()

		projectAggregate := project.NewAggregate(projectID, orgID)
		projectAggregate.InstanceID = instanceID

		added := project.NewProjectMemberAddedEvent(ctx, &projectAggregate.Aggregate, userID, "PROJECT_OWNER")
		require.True(t, callReduce(t, ctx, rawTx, handler, added))

		admin, err := adminRepo.Get(ctx, tx, database.WithCondition(
			database.And(adminRepo.ProjectAdministratorCondition(instanceID, projectID), adminRepo.UserIDCondition(userID)),
		))
		require.NoError(t, err)
		assert.Equal(t, []string{"PROJECT_OWNER"}, admin.Roles)

		changed := project.NewProjectMemberChangedEvent(ctx, &projectAggregate.Aggregate, userID, "PROJECT_OWNER_VIEWER")
		require.True(t, callReduce(t, ctx, rawTx, handler, changed))

		admin, err = adminRepo.Get(ctx, tx, database.WithCondition(
			database.And(adminRepo.ProjectAdministratorCondition(instanceID, projectID), adminRepo.UserIDCondition(userID)),
		))
		require.NoError(t, err)
		assert.Equal(t, []string{"PROJECT_OWNER_VIEWER"}, admin.Roles)

		removed := project.NewProjectMemberRemovedEvent(ctx, &projectAggregate.Aggregate, userID)
		require.True(t, callReduce(t, ctx, rawTx, handler, removed))

		_, err = adminRepo.Get(ctx, tx, database.WithCondition(
			database.And(adminRepo.ProjectAdministratorCondition(instanceID, projectID), adminRepo.UserIDCondition(userID)),
		))
		require.ErrorIs(t, err, database.NewNoRowFoundError(nil))
	})

	t.Run("project grant administrator cascade removed", func(t *testing.T) {
		rawTx, tx := getTransactions(t)
		t.Cleanup(func() {
			require.NoError(t, rawTx.Rollback())
		})

		instanceID, userID, orgID, projectID, grantID := seedAdministratorRelationalState(t, tx)
		adminRepo := repository.AdministratorRepository()
		handler := &administratorRelationalProjection{}
		ctx := t.Context()

		projectAggregate := project.NewAggregate(projectID, orgID)
		projectAggregate.InstanceID = instanceID

		added := project.NewProjectGrantMemberAddedEvent(ctx, &projectAggregate.Aggregate, userID, grantID, "PROJECT_OWNER")
		require.True(t, callReduce(t, ctx, rawTx, handler, added))

		admin, err := adminRepo.Get(ctx, tx, database.WithCondition(
			database.And(adminRepo.ProjectGrantAdministratorCondition(instanceID, grantID), adminRepo.UserIDCondition(userID)),
		))
		require.NoError(t, err)
		assert.Equal(t, []string{"PROJECT_OWNER"}, admin.Roles)

		changed := project.NewProjectGrantMemberChangedEvent(ctx, &projectAggregate.Aggregate, userID, grantID, "PROJECT_OWNER_VIEWER")
		require.True(t, callReduce(t, ctx, rawTx, handler, changed))

		admin, err = adminRepo.Get(ctx, tx, database.WithCondition(
			database.And(adminRepo.ProjectGrantAdministratorCondition(instanceID, grantID), adminRepo.UserIDCondition(userID)),
		))
		require.NoError(t, err)
		assert.Equal(t, []string{"PROJECT_OWNER_VIEWER"}, admin.Roles)

		removed := project.NewProjectGrantMemberCascadeRemovedEvent(ctx, &projectAggregate.Aggregate, userID, grantID)
		require.True(t, callReduce(t, ctx, rawTx, handler, removed))

		_, err = adminRepo.Get(ctx, tx, database.WithCondition(
			database.And(adminRepo.ProjectGrantAdministratorCondition(instanceID, grantID), adminRepo.UserIDCondition(userID)),
		))
		require.ErrorIs(t, err, database.NewNoRowFoundError(nil))
	})
}

func seedAdministratorRelationalState(t *testing.T, tx database.QueryExecutor) (instanceID, userID, orgID, projectID, projectGrantID string) {
	t.Helper()

	instanceRepo := repository.InstanceRepository()
	orgRepo := repository.OrganizationRepository()
	projectRepo := repository.ProjectRepository()
	projectGrantRepo := repository.ProjectGrantRepository()
	userRepo := repository.UserRepository()

	now := time.Now().UnixNano()
	instanceID = fmt.Sprintf("instance-%d", now)
	err := instanceRepo.Create(t.Context(), tx, &repoDomain.Instance{
		ID:              instanceID,
		Name:            "instance",
		DefaultOrgID:    "default-org",
		IAMProjectID:    "iam-project",
		ConsoleClientID: "console-client",
		ConsoleAppID:    "console-app",
		DefaultLanguage: "en",
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	})
	require.NoError(t, err)

	orgID = fmt.Sprintf("org-%d", now+1)
	err = orgRepo.Create(t.Context(), tx, &repoDomain.Organization{
		InstanceID: instanceID,
		ID:         orgID,
		Name:       "org",
		State:      repoDomain.OrgStateActive,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	})
	require.NoError(t, err)

	projectID = fmt.Sprintf("project-%d", now+2)
	err = projectRepo.Create(t.Context(), tx, &repoDomain.Project{
		InstanceID:     instanceID,
		OrganizationID: orgID,
		ID:             projectID,
		Name:           "project",
		State:          repoDomain.ProjectStateActive,
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	})
	require.NoError(t, err)

	projectGrantID = fmt.Sprintf("grant-%d", now+3)
	err = projectGrantRepo.Create(t.Context(), tx, &repoDomain.ProjectGrant{
		InstanceID:             instanceID,
		ID:                     projectGrantID,
		ProjectID:              projectID,
		GrantingOrganizationID: orgID,
		GrantedOrganizationID:  orgID,
		State:                  repoDomain.ProjectGrantStateActive,
		CreatedAt:              time.Now(),
		UpdatedAt:              time.Now(),
	})
	require.NoError(t, err)

	userID = fmt.Sprintf("user-%d", now+4)
	err = userRepo.Create(t.Context(), tx, &repoDomain.User{
		InstanceID:     instanceID,
		OrganizationID: orgID,
		ID:             userID,
		Username:       userID,
		State:          repoDomain.UserStateActive,
		Machine: &repoDomain.MachineUser{
			Name: "machine",
		},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	require.NoError(t, err)

	return instanceID, userID, orgID, projectID, projectGrantID
}
