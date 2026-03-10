//go:build integration

package events_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/zitadel/zitadel/backend/v3/domain"
	"github.com/zitadel/zitadel/backend/v3/storage/database"
	"github.com/zitadel/zitadel/backend/v3/storage/database/repository"
	"github.com/zitadel/zitadel/internal/integration"
	admin_pb "github.com/zitadel/zitadel/pkg/grpc/admin"
	mgmt_pb "github.com/zitadel/zitadel/pkg/grpc/management"
	org_pb "github.com/zitadel/zitadel/pkg/grpc/org/v2beta"
	project_pb "github.com/zitadel/zitadel/pkg/grpc/project/v2beta"
)

func TestServer_AdministratorReduces(t *testing.T) {
	instanceID := Instance.ID()
	orgID := Instance.DefaultOrg.Id
	orgCtx := Instance.WithAuthorizationToken(CTX, integration.UserTypeOrgOwner)
	iamCtx := IAMCTX
	adminRepo := repository.AdministratorRepository()
	projectGrantRepo := repository.ProjectGrantRepository()
	retryDuration, tick := integration.WaitForAndTickWithMaxDuration(CTX, time.Minute)

	t.Run("instance administrator", func(t *testing.T) {
		user := Instance.CreateHumanUserVerified(IAMCTX, orgID, integration.Email(), integration.Phone())

		_, err := AdminClient.AddIAMMember(IAMCTX, &admin_pb.AddIAMMemberRequest{
			UserId: user.GetUserId(),
			Roles:  []string{"IAM_OWNER"},
		})
		require.NoError(t, err)

		assert.EventuallyWithT(t, func(collect *assert.CollectT) {
			admin, err := adminRepo.Get(CTX, pool, database.WithCondition(
				database.And(adminRepo.InstanceAdministratorCondition(instanceID), adminRepo.UserIDCondition(user.GetUserId())),
			))
			require.NoError(collect, err)
			assert.Equal(collect, []string{"IAM_OWNER"}, admin.Roles)
		}, retryDuration, tick)

		_, err = AdminClient.UpdateIAMMember(IAMCTX, &admin_pb.UpdateIAMMemberRequest{
			UserId: user.GetUserId(),
			Roles:  []string{"IAM_OWNER_VIEWER"},
		})
		require.NoError(t, err)

		assert.EventuallyWithT(t, func(collect *assert.CollectT) {
			admin, err := adminRepo.Get(CTX, pool, database.WithCondition(
				database.And(adminRepo.InstanceAdministratorCondition(instanceID), adminRepo.UserIDCondition(user.GetUserId())),
			))
			require.NoError(collect, err)
			assert.Equal(collect, []string{"IAM_OWNER_VIEWER"}, admin.Roles)
		}, retryDuration, tick)

		_, err = AdminClient.RemoveIAMMember(IAMCTX, &admin_pb.RemoveIAMMemberRequest{
			UserId: user.GetUserId(),
		})
		require.NoError(t, err)

		assert.EventuallyWithT(t, func(collect *assert.CollectT) {
			_, err := adminRepo.Get(CTX, pool, database.WithCondition(
				database.And(adminRepo.InstanceAdministratorCondition(instanceID), adminRepo.UserIDCondition(user.GetUserId())),
			))
			require.ErrorIs(collect, err, database.NewNoRowFoundError(nil))
		}, retryDuration, tick)
	})

	t.Run("organization administrator", func(t *testing.T) {
		user := Instance.CreateHumanUserVerified(IAMCTX, orgID, integration.Email(), integration.Phone())

		_, err := MgmtClient.AddOrgMember(orgCtx, &mgmt_pb.AddOrgMemberRequest{
			UserId: user.GetUserId(),
			Roles:  []string{"ORG_OWNER"},
		})
		require.NoError(t, err)

		assert.EventuallyWithT(t, func(collect *assert.CollectT) {
			admin, err := adminRepo.Get(CTX, pool, database.WithCondition(
				database.And(adminRepo.OrganizationAdministratorCondition(instanceID, orgID), adminRepo.UserIDCondition(user.GetUserId())),
			))
			require.NoError(collect, err)
			assert.Equal(collect, []string{"ORG_OWNER"}, admin.Roles)
		}, retryDuration, tick)

		_, err = MgmtClient.UpdateOrgMember(orgCtx, &mgmt_pb.UpdateOrgMemberRequest{
			UserId: user.GetUserId(),
			Roles:  []string{"ORG_OWNER_VIEWER"},
		})
		require.NoError(t, err)

		assert.EventuallyWithT(t, func(collect *assert.CollectT) {
			admin, err := adminRepo.Get(CTX, pool, database.WithCondition(
				database.And(adminRepo.OrganizationAdministratorCondition(instanceID, orgID), adminRepo.UserIDCondition(user.GetUserId())),
			))
			require.NoError(collect, err)
			assert.Equal(collect, []string{"ORG_OWNER_VIEWER"}, admin.Roles)
		}, retryDuration, tick)

		_, err = MgmtClient.RemoveOrgMember(orgCtx, &mgmt_pb.RemoveOrgMemberRequest{
			UserId: user.GetUserId(),
		})
		require.NoError(t, err)

		assert.EventuallyWithT(t, func(collect *assert.CollectT) {
			_, err := adminRepo.Get(CTX, pool, database.WithCondition(
				database.And(adminRepo.OrganizationAdministratorCondition(instanceID, orgID), adminRepo.UserIDCondition(user.GetUserId())),
			))
			require.ErrorIs(collect, err, database.NewNoRowFoundError(nil))
		}, retryDuration, tick)
	})

	t.Run("project administrator", func(t *testing.T) {
		user := Instance.CreateHumanUserVerified(IAMCTX, orgID, integration.Email(), integration.Phone())
		projectResp, err := ProjectClient.CreateProject(IAMCTX, &project_pb.CreateProjectRequest{
			OrganizationId: orgID,
			Name:           integration.ProjectName(),
		})
		require.NoError(t, err)

		_, err = MgmtClient.AddProjectMember(iamCtx, &mgmt_pb.AddProjectMemberRequest{
			ProjectId: projectResp.GetId(),
			UserId:    user.GetUserId(),
			Roles:     []string{"PROJECT_OWNER"},
		})
		require.NoError(t, err)

		assert.EventuallyWithT(t, func(collect *assert.CollectT) {
			admin, err := adminRepo.Get(CTX, pool, database.WithCondition(
				database.And(adminRepo.ProjectAdministratorCondition(instanceID, projectResp.GetId()), adminRepo.UserIDCondition(user.GetUserId())),
			))
			require.NoError(collect, err)
			assert.Equal(collect, []string{"PROJECT_OWNER"}, admin.Roles)
		}, retryDuration, tick)

		_, err = MgmtClient.UpdateProjectMember(iamCtx, &mgmt_pb.UpdateProjectMemberRequest{
			ProjectId: projectResp.GetId(),
			UserId:    user.GetUserId(),
			Roles:     []string{"PROJECT_OWNER_VIEWER"},
		})
		require.NoError(t, err)

		assert.EventuallyWithT(t, func(collect *assert.CollectT) {
			admin, err := adminRepo.Get(CTX, pool, database.WithCondition(
				database.And(adminRepo.ProjectAdministratorCondition(instanceID, projectResp.GetId()), adminRepo.UserIDCondition(user.GetUserId())),
			))
			require.NoError(collect, err)
			assert.Equal(collect, []string{"PROJECT_OWNER_VIEWER"}, admin.Roles)
		}, retryDuration, tick)

		_, err = MgmtClient.RemoveProjectMember(iamCtx, &mgmt_pb.RemoveProjectMemberRequest{
			ProjectId: projectResp.GetId(),
			UserId:    user.GetUserId(),
		})
		require.NoError(t, err)

		assert.EventuallyWithT(t, func(collect *assert.CollectT) {
			_, err := adminRepo.Get(CTX, pool, database.WithCondition(
				database.And(adminRepo.ProjectAdministratorCondition(instanceID, projectResp.GetId()), adminRepo.UserIDCondition(user.GetUserId())),
			))
			require.ErrorIs(collect, err, database.NewNoRowFoundError(nil))
		}, retryDuration, tick)
	})

	t.Run("project grant administrator", func(t *testing.T) {
		user := Instance.CreateHumanUserVerified(IAMCTX, orgID, integration.Email(), integration.Phone())
		projectResp, err := ProjectClient.CreateProject(IAMCTX, &project_pb.CreateProjectRequest{
			OrganizationId: orgID,
			Name:           integration.ProjectName(),
		})
		require.NoError(t, err)
		grantedOrgResp, err := OrgClient.CreateOrganization(IAMCTX, &org_pb.CreateOrganizationRequest{
			Name: integration.OrganizationName(),
		})
		require.NoError(t, err)
		_, err = ProjectClient.CreateProjectGrant(iamCtx, &project_pb.CreateProjectGrantRequest{
			ProjectId:             projectResp.GetId(),
			GrantedOrganizationId: grantedOrgResp.GetId(),
		})
		require.NoError(t, err)
		var projectGrant *domain.ProjectGrant
		require.EventuallyWithT(t, func(collect *assert.CollectT) {
			var err error
			projectGrant, err = projectGrantRepo.Get(CTX, pool, database.WithCondition(
				database.And(
					projectGrantRepo.InstanceIDCondition(instanceID),
					projectGrantRepo.ProjectIDCondition(projectResp.GetId()),
					projectGrantRepo.GrantedOrganizationIDCondition(grantedOrgResp.GetId()),
				),
			))
			require.NoError(collect, err)
		}, retryDuration, tick)

		_, err = MgmtClient.AddProjectGrantMember(iamCtx, &mgmt_pb.AddProjectGrantMemberRequest{
			ProjectId: projectResp.GetId(),
			GrantId:   projectGrant.ID,
			UserId:    user.GetUserId(),
			Roles:     []string{"PROJECT_GRANT_OWNER"},
		})
		require.NoError(t, err)

		assert.EventuallyWithT(t, func(collect *assert.CollectT) {
			admin, err := adminRepo.Get(CTX, pool, database.WithCondition(
				database.And(adminRepo.ProjectGrantAdministratorCondition(instanceID, projectGrant.ID), adminRepo.UserIDCondition(user.GetUserId())),
			))
			require.NoError(collect, err)
			assert.Equal(collect, []string{"PROJECT_GRANT_OWNER"}, admin.Roles)
		}, retryDuration, tick)

		_, err = MgmtClient.UpdateProjectGrantMember(iamCtx, &mgmt_pb.UpdateProjectGrantMemberRequest{
			ProjectId: projectResp.GetId(),
			GrantId:   projectGrant.ID,
			UserId:    user.GetUserId(),
			Roles:     []string{"PROJECT_GRANT_OWNER_VIEWER"},
		})
		require.NoError(t, err)

		assert.EventuallyWithT(t, func(collect *assert.CollectT) {
			admin, err := adminRepo.Get(CTX, pool, database.WithCondition(
				database.And(adminRepo.ProjectGrantAdministratorCondition(instanceID, projectGrant.ID), adminRepo.UserIDCondition(user.GetUserId())),
			))
			require.NoError(collect, err)
			assert.Equal(collect, []string{"PROJECT_GRANT_OWNER_VIEWER"}, admin.Roles)
		}, retryDuration, tick)

		_, err = MgmtClient.RemoveProjectGrantMember(iamCtx, &mgmt_pb.RemoveProjectGrantMemberRequest{
			ProjectId: projectResp.GetId(),
			GrantId:   projectGrant.ID,
			UserId:    user.GetUserId(),
		})
		require.NoError(t, err)

		assert.EventuallyWithT(t, func(collect *assert.CollectT) {
			_, err := adminRepo.Get(CTX, pool, database.WithCondition(
				database.And(adminRepo.ProjectGrantAdministratorCondition(instanceID, projectGrant.ID), adminRepo.UserIDCondition(user.GetUserId())),
			))
			require.ErrorIs(collect, err, database.NewNoRowFoundError(nil))
		}, retryDuration, tick)
	})
}
