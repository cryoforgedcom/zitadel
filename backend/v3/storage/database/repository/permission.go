package repository

import (
	"slices"

	"github.com/zitadel/zitadel/backend/v3/storage/database"
)

type CheckPermissionOpt func(*permissionCondition)

func WithOrganizationID(organizationID string) CheckPermissionOpt {
	return func(p *permissionCondition) {
		p.organizationID = &organizationID
	}
}

func WithProjectID(projectID string) CheckPermissionOpt {
	return func(p *permissionCondition) {
		p.projectID = &projectID
	}
}

func WithProjectGrantID(projectGrantID string) CheckPermissionOpt {
	return func(p *permissionCondition) {
		p.projectGrantID = &projectGrantID
	}
}

func WithRaiseIfDenied() CheckPermissionOpt {
	return func(p *permissionCondition) {
		p.raiseIfDenied = true
	}
}

func CheckPermission(instanceID, userID, permission string, opts ...CheckPermissionOpt) database.Condition {
	cond := &permissionCondition{
		instanceID: instanceID,
		userID:     userID,
		permission: permission,
	}
	for _, opt := range opts {
		opt(cond)
	}
	return cond
}

type permissionCondition struct {
	instanceID     string
	userID         string
	permission     string
	raiseIfDenied  bool
	organizationID *string
	projectID      *string
	projectGrantID *string
}

// IsRestrictingColumn implements [database.Condition].
func (p *permissionCondition) IsRestrictingColumn(col database.Column) bool {
	return false
}

// Matches implements [database.Condition].
func (p *permissionCondition) Matches(x any) bool {
	toMatch, ok := x.(*permissionCondition)
	if !ok {
		return false
	}
	var builder, toMatchBuilder database.StatementBuilder
	p.Write(&builder)
	toMatch.Write(&toMatchBuilder)
	return builder.String() == toMatchBuilder.String() && slices.Equal(builder.Args(), toMatchBuilder.Args())
}

// String implements [database.Condition].
func (p *permissionCondition) String() string {
	return "permissionCondition"
}

// Write implements [database.Condition].
func (p *permissionCondition) Write(builder *database.StatementBuilder) {
	builder.WriteString("zitadel.check_permission(")
	builder.WriteArgs(p.instanceID, p.userID, p.permission)
	if p.organizationID != nil {
		builder.WriteString(", p_organization_id => ")
		builder.WriteArgs(*p.organizationID)
	}
	if p.projectID != nil {
		builder.WriteString(", p_project_id => ")
		builder.WriteArgs(*p.projectID)
	}
	if p.projectGrantID != nil {
		builder.WriteString(", p_project_grant_id => ")
		builder.WriteArgs(*p.projectGrantID)
	}
	if p.raiseIfDenied {
		builder.WriteString(", p_raise_if_denied => ")
		builder.WriteArgs(true)
	}
	builder.WriteString(")")
}

var _ database.Condition = (*permissionCondition)(nil)
