package domain

import (
	"context"
	"time"

	"golang.org/x/text/language"

	"github.com/zitadel/zitadel/backend/v3/storage/database"
	"github.com/zitadel/zitadel/internal/eventstore"
	"github.com/zitadel/zitadel/internal/repository/session"
	"github.com/zitadel/zitadel/internal/zerrors"
)

type CheckUserCommand struct {
	parent CheckUserParent

	userID    *string
	loginName *string

	user *User
}

// Result implements [Querier].
func (cmd *CheckUserCommand) Result() *SessionCheckError {
	panic("unimplemented")
}

func NewCheckUserCommand(parent CheckUserParent, userID, loginName *string) *CheckUserCommand {
	cmd := &CheckUserCommand{
		parent:    parent,
		userID:    userID,
		loginName: loginName,
	}
	cmd.parent.setUserConditionProvider(cmd.userCondition)
	return cmd
}

// Events implements [Commander].
func (cmd *CheckUserCommand) Events(ctx context.Context, opts *InvokeOpts) ([]eventstore.Command, error) {
	var preferredLanguage *language.Tag
	if cmd.user.Human != nil && !cmd.user.Human.PreferredLanguage.IsRoot() {
		preferredLanguage = &cmd.user.Human.PreferredLanguage
	}
	return []eventstore.Command{
		session.NewUserCheckedEvent(
			ctx,
			&session.NewAggregate(cmd.parent.ID(), cmd.parent.InstanceID()).Aggregate,
			cmd.user.ID,
			cmd.user.OrganizationID,
			time.Now(), // TODO(adlerhurst): use a consistent time source
			preferredLanguage,
		),
	}, nil
}

// Execute implements [Commander].
func (cmd *CheckUserCommand) Execute(ctx context.Context, opts *InvokeOpts) (err error) {
	cmd.user, err = cmd.parent.fetchUser(ctx, opts)
	return err
}

// String implements [Commander].
func (cmd *CheckUserCommand) String() string {
	return "CheckUserCommand"
}

// Validate implements [Commander].
func (cmd *CheckUserCommand) Validate(ctx context.Context, opts *InvokeOpts) (err error) {
	if cmd.userID == nil && cmd.loginName == nil {
		return zerrors.ThrowInvalidArgument(nil, "DOMAI-D0UTe", "neither login name nor id provided")
	}
	return nil
}

func (cmd *CheckUserCommand) userCondition(ctx context.Context, opts *InvokeOpts) (condition database.Condition) {
	if cmd.userID != nil {
		return opts.userRepo.IDCondition(*cmd.userID)
	}
	return opts.userRepo.LoginNameCondition(database.TextOperationEqualIgnoreCase, *cmd.loginName)
}

// checkResult implements [sessionCheckSubCommand].
func (cmd *CheckUserCommand) checkResult() SessionFactor {
	return &SessionFactorUser{
		UserID:         cmd.user.ID,
		LastVerifiedAt: time.Now(), // TODO(adlerhurst): use a consistent time source
	}
}

var (
	_ Commander                   = (*CheckUserCommand)(nil)
	_ Querier[*SessionCheckError] = (*CheckUserCommand)(nil)
	_ sessionCheckSubCommand      = (*CheckUserCommand)(nil)
)

type CheckUserParent interface {
	// setUserConditionProvider is used to set the user condition provider for the command.
	setUserConditionProvider(provider userConditionProvider)

	// ID returns the session ID for the command.
	// It is used to generate the events.
	ID() string
	// InstanceID returns the instance ID for the command.
	// It is used to generate the events.
	InstanceID() string

	// fetchUser is used to fetch the user based on the condition set by setUserConditionProvider.
	// It might get called multiple times, so it should be implemented with caching in mind.
	fetchUser(ctx context.Context, opts *InvokeOpts) (user *User, err error)
	// reloadUser is used refresh the user data, if it has been changed during the execution of the command.
	reloadUser(ctx context.Context, opts *InvokeOpts) (user *User, err error)
}

type userConditionProvider func(ctx context.Context, opts *InvokeOpts) (condition database.Condition)
