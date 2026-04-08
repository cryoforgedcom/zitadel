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

	user   *User
	factor *SessionFactorUser
}

// Result implements [Querier].
func (cmd *CheckUserCommand) Result() *User {
	return cmd.user
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
	fetchedSession, err := cmd.parent.fetchSession(ctx, opts)
	if err != nil {
		return nil, err
	}
	return []eventstore.Command{
		session.NewUserCheckedEvent(
			ctx,
			&session.NewAggregate(fetchedSession.ID, fetchedSession.InstanceID).Aggregate,
			cmd.user.ID,
			cmd.user.OrganizationID,
			cmd.factor.LastVerifiedAt,
			preferredLanguage,
		),
	}, nil
}

// Execute implements [Commander].
func (cmd *CheckUserCommand) Execute(ctx context.Context, opts *InvokeOpts) (err error) {
	close, err := opts.ensureIsolated(ctx)
	if err != nil {
		return err
	}
	defer func() {
		err = close(err)
	}()
	cmd.user, err = cmd.parent.fetchUser(ctx, opts)
	if err != nil && zerrors.IsNotFound(err) {
		return nil
	}
	session, err := cmd.parent.fetchSession(ctx, opts)
	if err != nil {
		return err
	}
	if session.UserID != "" && cmd.user.ID != "" && session.UserID != cmd.user.ID {
		return zerrors.ThrowInvalidArgument(nil, "DOM-78g1TV", "user change not possible")
	}
	cmd.factor = &SessionFactorUser{
		UserID:         cmd.user.ID,
		LastVerifiedAt: time.Now(), // TODO(adlerhurst): use a consistent time source
	}

	return nil
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
	return cmd.factor
}

var (
	_ Commander      = (*CheckUserCommand)(nil)
	_ Querier[*User] = (*CheckUserCommand)(nil)
)

type CheckUserParent interface {
	// setUserConditionProvider is used to set the user condition provider for the command.
	setUserConditionProvider(provider userConditionProvider)

	// fetchSession is used to fetch the session.
	fetchSession(ctx context.Context, opts *InvokeOpts) (session *Session, err error)
	// fetchUser is used to fetch the user based on the condition set by setUserConditionProvider.
	// It might get called multiple times, so it should be implemented with caching in mind.
	fetchUser(ctx context.Context, opts *InvokeOpts) (user *User, err error)
}

type userConditionProvider func(ctx context.Context, opts *InvokeOpts) (condition database.Condition)
