package domain

import (
	"context"

	"github.com/zitadel/zitadel/backend/v3/storage/database"
	"github.com/zitadel/zitadel/internal/eventstore"
	"github.com/zitadel/zitadel/internal/zerrors"
)

type CheckUserCommand struct {
	parent CheckUserParent

	userID    *string
	loginName *string
}

// PreValidate implements [PreValidator].
func (cmd *CheckUserCommand) PreValidate(ctx context.Context, opts *InvokeOpts) (err error) {
	var cond database.Condition
	if cmd.userID != nil {
		cond = opts.userRepo.IDCondition(*cmd.userID)
	} else if cmd.loginName != nil {
		cond = opts.userRepo.LoginNameCondition(database.TextOperationEqualIgnoreCase, *cmd.loginName)
	}
	if cond == nil {
		return zerrors.ThrowInvalidArgument(nil, "DOMAI-D0UTe", "neither login name nor id provided")
	}

	return cmd.parent.setUserCondition(database.And(opts.userRepo.InstanceIDCondition(cmd.instanceID), cond))
}

// Events implements [Commander].
func (c *CheckUserCommand) Events(ctx context.Context, opts *InvokeOpts) ([]eventstore.Command, error) {
	panic("unimplemented")
}

// Execute implements [Commander].
func (c *CheckUserCommand) Execute(ctx context.Context, opts *InvokeOpts) (err error) {
	panic("unimplemented")
}

// String implements [Commander].
func (c *CheckUserCommand) String() string {
	panic("unimplemented")
}

// Validate implements [Commander].
func (c *CheckUserCommand) Validate(ctx context.Context, opts *InvokeOpts) (err error) {
	panic("unimplemented")
}

var (
	_ Commander    = (*CheckUserCommand)(nil)
	_ PreValidator = (*CheckUserCommand)(nil)
)

type CheckUserParent interface {
	// setUserCondition is used to set the condition for fetching the user.
	setUserCondition(condition database.Condition) error
	// user is used to fetch the user based on the condition set by setUserCondition.
	// It might get called multiple times, so it should be implemented with caching in mind.
	user(ctx context.Context, opts *InvokeOpts) (user *User, err error)
	// reloadUser is used refresh the user data, if it has been changed during the execution of the command.
	reloadUser(ctx context.Context, opts *InvokeOpts) (user *User, err error)
}
