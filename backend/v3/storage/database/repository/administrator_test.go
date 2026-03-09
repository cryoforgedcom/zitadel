package repository_test

import (
	"testing"
	"time"

	"github.com/muhlemmer/gu"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/zitadel/zitadel/backend/v3/domain"
	"github.com/zitadel/zitadel/backend/v3/storage/database"
	"github.com/zitadel/zitadel/backend/v3/storage/database/repository"
	"github.com/zitadel/zitadel/internal/integration"
)

func TestAdministratorRepository_CRUDAcrossScopes(t *testing.T) {
	tx, rollback := transactionForRollback(t)
	defer rollback()

	instanceID := createInstance(t, tx)
	orgID := createOrganization(t, tx, instanceID)
	projectID := createProject(t, tx, instanceID, orgID)
	grantedOrgID := createOrganization(t, tx, instanceID)
	projectGrantID := createProjectGrant(t, tx, instanceID, orgID, grantedOrgID, projectID, nil)
	userID := createHumanUser(t, tx, instanceID, orgID)

	adminRepo := repository.AdministratorRepository()

	tests := []struct {
		name          string
		administrator *domain.Administrator
		filter        database.Condition
	}{
		{
			name: "instance",
			administrator: &domain.Administrator{
				InstanceID: instanceID,
				UserID:     userID,
				Scope:      domain.AdministratorScopeInstance,
				Roles:      []string{"IAM_OWNER"},
			},
			filter: database.And(adminRepo.InstanceAdministratorCondition(instanceID), adminRepo.UserIDCondition(userID)),
		},
		{
			name: "organization",
			administrator: &domain.Administrator{
				InstanceID:     instanceID,
				UserID:         userID,
				Scope:          domain.AdministratorScopeOrganization,
				OrganizationID: gu.Ptr(orgID),
				Roles:          []string{"ORG_OWNER"},
			},
			filter: database.And(adminRepo.OrganizationAdministratorCondition(instanceID, orgID), adminRepo.UserIDCondition(userID)),
		},
		{
			name: "project",
			administrator: &domain.Administrator{
				InstanceID: instanceID,
				UserID:     userID,
				Scope:      domain.AdministratorScopeProject,
				ProjectID:  gu.Ptr(projectID),
				Roles:      []string{"PROJECT_OWNER"},
			},
			filter: database.And(adminRepo.ProjectAdministratorCondition(instanceID, projectID), adminRepo.UserIDCondition(userID)),
		},
		{
			name: "project grant",
			administrator: &domain.Administrator{
				InstanceID:     instanceID,
				UserID:         userID,
				Scope:          domain.AdministratorScopeProjectGrant,
				ProjectGrantID: gu.Ptr(projectGrantID),
				Roles:          []string{"PROJECT_OWNER"},
			},
			filter: database.And(adminRepo.ProjectGrantAdministratorCondition(instanceID, projectGrantID), adminRepo.UserIDCondition(userID)),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			savepoint, rollback := savepointForRollback(t, tx)
			defer rollback()

			err := adminRepo.Create(t.Context(), savepoint, tt.administrator)
			require.NoError(t, err)
			assert.NotEmpty(t, tt.administrator.ID)
			assert.NotEmpty(t, tt.administrator.CreatedAt)
			assert.NotEmpty(t, tt.administrator.UpdatedAt)

			got, err := adminRepo.Get(t.Context(), savepoint, database.WithCondition(
				adminRepo.PrimaryKeyCondition(instanceID, tt.administrator.ID),
			))
			require.NoError(t, err)
			assert.Equal(t, tt.administrator.ID, got.ID)
			assert.Equal(t, tt.administrator.Scope, got.Scope)
			assert.Equal(t, tt.administrator.Roles, got.Roles)

			list, err := adminRepo.List(t.Context(), savepoint, database.WithCondition(
				database.And(tt.filter, adminRepo.RoleCondition(database.TextOperationEqual, tt.administrator.Roles[0])),
			))
			require.NoError(t, err)
			if assert.Len(t, list, 1) {
				assert.Equal(t, tt.administrator.ID, list[0].ID)
			}

			updatedAt := time.Now().Add(time.Second)
			_, err = adminRepo.Update(t.Context(), savepoint,
				adminRepo.PrimaryKeyCondition(instanceID, tt.administrator.ID),
				adminRepo.SetUpdatedAt(updatedAt),
				adminRepo.SetRoles([]string{tt.administrator.Roles[0], "AUDITOR"}),
			)
			require.NoError(t, err)

			got, err = adminRepo.Get(t.Context(), savepoint, database.WithCondition(
				adminRepo.PrimaryKeyCondition(instanceID, tt.administrator.ID),
			))
			require.NoError(t, err)
			assert.Equal(t, []string{tt.administrator.Roles[0], "AUDITOR"}, got.Roles)
			assert.Equal(t, updatedAt.UTC(), got.UpdatedAt.UTC())

			_, err = adminRepo.Update(t.Context(), savepoint,
				adminRepo.PrimaryKeyCondition(instanceID, tt.administrator.ID),
				adminRepo.AddRole("SECOND"),
				adminRepo.RemoveRole("AUDITOR"),
			)
			require.NoError(t, err)

			got, err = adminRepo.Get(t.Context(), savepoint, database.WithCondition(
				adminRepo.PrimaryKeyCondition(instanceID, tt.administrator.ID),
			))
			require.NoError(t, err)
			assert.Equal(t, []string{tt.administrator.Roles[0], "SECOND"}, got.Roles)

			_, err = adminRepo.Delete(t.Context(), savepoint,
				adminRepo.PrimaryKeyCondition(instanceID, tt.administrator.ID),
			)
			require.NoError(t, err)

			_, err = adminRepo.Get(t.Context(), savepoint, database.WithCondition(
				adminRepo.PrimaryKeyCondition(instanceID, tt.administrator.ID),
			))
			require.ErrorIs(t, err, database.NewNoRowFoundError(nil))
		})
	}
}

func TestAdministratorRepository_ScopeConditionsAndNonPKOperations(t *testing.T) {
	tx, rollback := transactionForRollback(t)
	defer rollback()

	instanceID := createInstance(t, tx)
	orgID := createOrganization(t, tx, instanceID)
	projectID := createProject(t, tx, instanceID, orgID)
	grantedOrgID := createOrganization(t, tx, instanceID)
	projectGrantID := createProjectGrant(t, tx, instanceID, orgID, grantedOrgID, projectID, nil)
	userID := createHumanUser(t, tx, instanceID, orgID)

	adminRepo := repository.AdministratorRepository()

	tests := []struct {
		name            string
		administrator   *domain.Administrator
		helperCondition database.Condition
		manualCondition database.Condition
	}{
		{
			name: "instance",
			administrator: &domain.Administrator{
				InstanceID: instanceID,
				UserID:     userID,
				Scope:      domain.AdministratorScopeInstance,
				Roles:      []string{"IAM_OWNER"},
			},
			helperCondition: database.And(
				adminRepo.InstanceAdministratorCondition(instanceID),
				adminRepo.UserIDCondition(userID),
			),
			manualCondition: database.And(
				adminRepo.InstanceIDCondition(instanceID),
				adminRepo.ScopeCondition(domain.AdministratorScopeInstance),
				adminRepo.UserIDCondition(userID),
			),
		},
		{
			name: "organization",
			administrator: &domain.Administrator{
				InstanceID:     instanceID,
				UserID:         userID,
				Scope:          domain.AdministratorScopeOrganization,
				OrganizationID: gu.Ptr(orgID),
				Roles:          []string{"ORG_OWNER"},
			},
			helperCondition: database.And(
				adminRepo.OrganizationAdministratorCondition(instanceID, orgID),
				adminRepo.UserIDCondition(userID),
			),
			manualCondition: database.And(
				adminRepo.InstanceIDCondition(instanceID),
				adminRepo.ScopeCondition(domain.AdministratorScopeOrganization),
				adminRepo.OrganizationIDCondition(orgID),
				adminRepo.UserIDCondition(userID),
			),
		},
		{
			name: "project",
			administrator: &domain.Administrator{
				InstanceID: instanceID,
				UserID:     userID,
				Scope:      domain.AdministratorScopeProject,
				ProjectID:  gu.Ptr(projectID),
				Roles:      []string{"PROJECT_OWNER"},
			},
			helperCondition: database.And(
				adminRepo.ProjectAdministratorCondition(instanceID, projectID),
				adminRepo.UserIDCondition(userID),
			),
			manualCondition: database.And(
				adminRepo.InstanceIDCondition(instanceID),
				adminRepo.ScopeCondition(domain.AdministratorScopeProject),
				adminRepo.ProjectIDCondition(projectID),
				adminRepo.UserIDCondition(userID),
			),
		},
		{
			name: "project grant",
			administrator: &domain.Administrator{
				InstanceID:     instanceID,
				UserID:         userID,
				Scope:          domain.AdministratorScopeProjectGrant,
				ProjectGrantID: gu.Ptr(projectGrantID),
				Roles:          []string{"PROJECT_OWNER"},
			},
			helperCondition: database.And(
				adminRepo.ProjectGrantAdministratorCondition(instanceID, projectGrantID),
				adminRepo.UserIDCondition(userID),
			),
			manualCondition: database.And(
				adminRepo.InstanceIDCondition(instanceID),
				adminRepo.ScopeCondition(domain.AdministratorScopeProjectGrant),
				adminRepo.ProjectGrantIDCondition(projectGrantID),
				adminRepo.UserIDCondition(userID),
			),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			savepoint, rollback := savepointForRollback(t, tx)
			defer rollback()

			err := adminRepo.Create(t.Context(), savepoint, tt.administrator)
			require.NoError(t, err)

			byHelper, err := adminRepo.List(t.Context(), savepoint, database.WithCondition(tt.helperCondition))
			require.NoError(t, err)
			if assert.Len(t, byHelper, 1) {
				assert.Equal(t, tt.administrator.ID, byHelper[0].ID)
			}

			byManual, err := adminRepo.List(t.Context(), savepoint, database.WithCondition(tt.manualCondition))
			require.NoError(t, err)
			if assert.Len(t, byManual, 1) {
				assert.Equal(t, tt.administrator.ID, byManual[0].ID)
			}

			_, err = adminRepo.Update(t.Context(), savepoint, tt.helperCondition, adminRepo.SetRoles([]string{"UPDATED"}))
			require.NoError(t, err)

			got, err := adminRepo.Get(t.Context(), savepoint, database.WithCondition(
				adminRepo.PrimaryKeyCondition(instanceID, tt.administrator.ID),
			))
			require.NoError(t, err)
			assert.Equal(t, []string{"UPDATED"}, got.Roles)

			_, err = adminRepo.Delete(t.Context(), savepoint, tt.helperCondition)
			require.NoError(t, err)

			_, err = adminRepo.Get(t.Context(), savepoint, database.WithCondition(
				adminRepo.PrimaryKeyCondition(instanceID, tt.administrator.ID),
			))
			require.ErrorIs(t, err, database.NewNoRowFoundError(nil))
		})
	}
}

func TestAdministratorRepository_CreateErrors(t *testing.T) {
	tx, rollback := transactionForRollback(t)
	defer rollback()

	instanceID := createInstance(t, tx)
	orgID := createOrganization(t, tx, instanceID)
	projectID := createProject(t, tx, instanceID, orgID)
	grantedOrgID := createOrganization(t, tx, instanceID)
	projectGrantID := createProjectGrant(t, tx, instanceID, orgID, grantedOrgID, projectID, nil)
	userID := createHumanUser(t, tx, instanceID, orgID)

	adminRepo := repository.AdministratorRepository()
	valid := &domain.Administrator{
		InstanceID:     instanceID,
		UserID:         userID,
		Scope:          domain.AdministratorScopeOrganization,
		OrganizationID: gu.Ptr(orgID),
		Roles:          []string{"ORG_OWNER"},
	}

	err := adminRepo.Create(t.Context(), tx, valid)
	require.NoError(t, err)

	tests := []struct {
		name          string
		administrator *domain.Administrator
		wantErr       error
	}{
		{
			name: "duplicate admin",
			administrator: &domain.Administrator{
				InstanceID:     instanceID,
				UserID:         userID,
				Scope:          domain.AdministratorScopeOrganization,
				OrganizationID: gu.Ptr(orgID),
				Roles:          []string{"ORG_OWNER"},
			},
			wantErr: new(database.UniqueError),
		},
		{
			name: "missing user",
			administrator: &domain.Administrator{
				InstanceID:     instanceID,
				UserID:         integration.ID(),
				Scope:          domain.AdministratorScopeOrganization,
				OrganizationID: gu.Ptr(orgID),
				Roles:          []string{"ORG_OWNER"},
			},
			wantErr: new(database.ForeignKeyError),
		},
		{
			name: "missing organization",
			administrator: &domain.Administrator{
				InstanceID:     instanceID,
				UserID:         userID,
				Scope:          domain.AdministratorScopeOrganization,
				OrganizationID: gu.Ptr(integration.ID()),
				Roles:          []string{"ORG_OWNER"},
			},
			wantErr: new(database.ForeignKeyError),
		},
		{
			name: "missing project",
			administrator: &domain.Administrator{
				InstanceID: instanceID,
				UserID:     userID,
				Scope:      domain.AdministratorScopeProject,
				ProjectID:  gu.Ptr(integration.ID()),
				Roles:      []string{"PROJECT_OWNER"},
			},
			wantErr: new(database.ForeignKeyError),
		},
		{
			name: "missing project grant",
			administrator: &domain.Administrator{
				InstanceID:     instanceID,
				UserID:         userID,
				Scope:          domain.AdministratorScopeProjectGrant,
				ProjectGrantID: gu.Ptr(integration.ID()),
				Roles:          []string{"PROJECT_OWNER"},
			},
			wantErr: new(database.ForeignKeyError),
		},
		{
			name: "invalid scope alignment",
			administrator: &domain.Administrator{
				InstanceID:     instanceID,
				UserID:         userID,
				Scope:          domain.AdministratorScopeProjectGrant,
				ProjectID:      gu.Ptr(projectID),
				ProjectGrantID: gu.Ptr(projectGrantID),
				Roles:          []string{"PROJECT_OWNER"},
			},
			wantErr: new(database.CheckError),
		},
		{
			name: "empty role",
			administrator: &domain.Administrator{
				InstanceID:     instanceID,
				UserID:         createHumanUser(t, tx, instanceID, orgID),
				Scope:          domain.AdministratorScopeOrganization,
				OrganizationID: gu.Ptr(orgID),
				Roles:          []string{""},
			},
			wantErr: new(database.CheckError),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			savepoint, rollback := savepointForRollback(t, tx)
			defer rollback()

			err := adminRepo.Create(t.Context(), savepoint, tt.administrator)
			require.ErrorIs(t, err, tt.wantErr)
		})
	}
}
