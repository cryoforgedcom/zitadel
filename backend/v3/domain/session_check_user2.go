package domain

import (
	"context"
	"time"

	"golang.org/x/text/language"

	"github.com/zitadel/zitadel/backend/v3/storage/database"
	"github.com/zitadel/zitadel/internal/eventstore"
	"github.com/zitadel/zitadel/internal/zerrors"
)

// --------------------------------------
// User Check Sub Command
// --------------------------------------

type CheckSessionUserSubCommand struct {
	parent CheckSessionUserParent

	instanceID string

	UserID    *string
	LoginName *string

	factor *SessionFactorUser

	PreferredUserLanguage *language.Tag
	UserCheckedAt         time.Time
}

// Events implements [Commander].
func (cmd *CheckSessionUserSubCommand) Events(ctx context.Context, opts *InvokeOpts) ([]eventstore.Command, error) {
	panic("unimplemented")
}

func WithCheckSessionUserSubCommand(instanceID string, userID, loginName *string) *CheckSessionUserSubCommand {
	return &CheckSessionUserSubCommand{
		instanceID: instanceID,
		UserID:     userID,
		LoginName:  loginName,
	}
}

func NewCheckSessionUserCommand(parent CheckSessionUserParent, userID, loginName *string) *CheckSessionUserSubCommand {
	cmd := &CheckSessionUserSubCommand{
		parent:    parent,
		UserID:    userID,
		LoginName: loginName,
	}
	if createSession, ok := parent.(*CreateSessionCommand); ok {
		cmd.ApplyOnCreateSessionCommand(createSession)
	}

	return cmd
}

// ApplyOnCreateSessionCommand implements [SessionCommandOption].
func (cmd *CheckSessionUserSubCommand) ApplyOnCreateSessionCommand(parent *CreateSessionCommand) {
	cmd.parent = parent
	cmd.instanceID = parent.instanceID
	parent.checks = append(parent.checks, cmd)
}

var (
	_ SessionCommandOption = (*CheckSessionUserSubCommand)(nil)
	_ Commander            = (*CheckSessionUserSubCommand)(nil)
)

type CheckSessionUserParent interface {
	setUserCondition(condition database.Condition) error
	user(ctx context.Context, opts *InvokeOpts) (*User, error)
}

func (cmd *CheckSessionUserSubCommand) PreValidation(ctx context.Context, opts *InvokeOpts) error {
	var cond database.Condition
	if cmd.UserID != nil {
		cond = opts.userRepo.IDCondition(*cmd.UserID)
	} else if cmd.LoginName != nil {
		cond = opts.userRepo.LoginNameCondition(database.TextOperationEqualIgnoreCase, *cmd.LoginName)
	}
	if cond == nil {
		return zerrors.ThrowInvalidArgument(nil, "DOMAI-D0UTe", "neither login name nor id provided")
	}

	return cmd.parent.setUserCondition(database.And(opts.userRepo.InstanceIDCondition(cmd.instanceID), cond))
}

// String implements [Commander].
func (u *CheckSessionUserSubCommand) String() string {
	return "UserCheckSubcommand"
}

// Validate implements [Commander].
func (u *CheckSessionUserSubCommand) Validate(ctx context.Context, opts *InvokeOpts) (err error) {
	if u.instanceID == "" {
		return zerrors.ThrowPreconditionFailed(nil, "DOM-Oe1dtz", "Errors.Missing.InstanceID")
	}

	// TODO(adlerhurst): Would it be simpler to have a method which returns the permission(s) required for the command and let the invoker handle the permission check?
	// This would also allow us to check for multiple permissions if needed.
	// if authZErr := opts.Permissions.CheckSessionPermission(ctx, SessionWritePermission, u.SessionID); authZErr != nil {
	// 	return zerrors.ThrowPermissionDenied(authZErr, "DOM-4qz3mt", "Errors.PermissionDenied")
	// }

	if err = u.PreValidation(ctx, opts); err != nil {
		return err
	}

	user, err := u.parent.user(ctx, opts)
	if err != nil {
		return err
	}

	if user.State != UserStateActive {
		return zerrors.ThrowPreconditionFailed(nil, "DOM-vgDIu9", "Errors.User.NotActive")
	}

	return nil
}

// Execute implements [Commander].
func (u *CheckSessionUserSubCommand) Execute(ctx context.Context, opts *InvokeOpts) (err error) {
	user, err := u.parent.user(ctx, opts)
	if err != nil {
		return err
	}
	if human := user.Human; human != nil {
		if !human.PreferredLanguage.IsRoot() {
			u.PreferredUserLanguage = &human.PreferredLanguage
		}
	}

	u.factor = &SessionFactorUser{
		UserID: user.ID,
	}

	return err
}

func (u *CheckSessionUserSubCommand) sessionUserIdentifier() {}

func (u *CheckSessionUserSubCommand) checkResult() SessionFactor {
	return u.factor
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Password Check Sub Command
// ---------------------------------------------------------------------------------------------------------------------------------------------

type CheckSessionPasswordSubCommand struct {
	parent   CheckSessionPasswordParent
	password string

	tarpitFunc tarpitFn
	verifierFn func(encoded, password string) (updated string, err error)

	result error
}

// Events implements [Commander].
func (cmd *CheckSessionPasswordSubCommand) Events(ctx context.Context, opts *InvokeOpts) ([]eventstore.Command, error) {
	panic("unimplemented")
}

func WithCheckSessionPasswordSubCommand(password string) *CheckSessionPasswordSubCommand {
	return &CheckSessionPasswordSubCommand{
		password: password,
	}
}

func NewCheckSessionPasswordCommand(parent CheckSessionPasswordParent, password string) *CheckSessionPasswordSubCommand {
	cmd := &CheckSessionPasswordSubCommand{
		parent:   parent,
		password: password,
	}
	if createSession, ok := parent.(*CreateSessionCommand); ok {
		cmd.ApplyOnCreateSessionCommand(createSession)
	}

	return cmd
}

// ApplyOnCreateSessionCommand implements [SessionCommandOption].
func (cmd *CheckSessionPasswordSubCommand) ApplyOnCreateSessionCommand(parent *CreateSessionCommand) {
	cmd.parent = parent
	parent.checks = append(parent.checks, cmd)
}

// Execute implements [Querier].
func (cmd *CheckSessionPasswordSubCommand) Execute(ctx context.Context, opts *InvokeOpts) (err error) {
	// 1. calculate changes to user (e.g. failed attempts, last failed attempt, etc.)
	// 2. check if password of user has changed between prevalidation and execution, if so, return an error
	// write changes to user (if any)
	// return error if anything else than password check failed, password mismatch is no error (store it in result)
	panic("unimplemented")
}

// Result implements [Querier].
func (cmd *CheckSessionPasswordSubCommand) Result() error {
	return cmd.result
}

// String implements [Querier].
func (cmd *CheckSessionPasswordSubCommand) String() string {
	return "CheckSessionPasswordSubCommand"
}

// Validate implements [Querier].
func (cmd *CheckSessionPasswordSubCommand) Validate(ctx context.Context, opts *InvokeOpts) (err error) {
	panic("unimplemented")
}

func (cmd *CheckSessionPasswordSubCommand) PreValidation(ctx context.Context, opts *InvokeOpts) error {
	if cmd.password == "" {
		return zerrors.ThrowInvalidArgument(nil, "DOMAI-D0UTe", "no password provided")
	}
	user, err := cmd.parent.user()
	if err != nil {
		return err
	}
	if user.Human == nil {
		return zerrors.ThrowInvalidArgument(nil, "DOMAI-9n8sdf", "user is not a human")
	}

	updated, err := cmd.verifierFn(user.Human.Password.Hash, cmd.password)
	if err != nil {
		return err
	}
	_ = updated // TODO(adlerhurst): needs update on user
	return nil
}

// 	verification, err := cmd.verifyPassword()
// 	// updatedHash, err := cmd.verifierFn(user.Human.Password.Hash, cmd.password)
// 	// if err != nil {
// 	// 	if cmd.tarpitFunc != nil {
// 	// if !opts.passwordHasher.Compare(user.Human.Password.Hash, cmd.password) {
// 	// 	return zerrors.ThrowInvalidArgument(nil, "DOMAI-9n8sdf", "invalid password")
// 	// }
// 	return nil
// }

// func (cmd *CheckSessionPasswordSubCommand) verifyPassword() (VerificationType, error) {
// 	user, err := cmd.parent.user()
// 	if err != nil {
// 		return new(VerificationTypeFailed), err
// 	}
// 	if user.Human == nil {
// 		return new(VerificationTypeFailed), zerrors.ThrowInvalidArgument(nil, "DOMAI-9n8sdf", "user is not a human")
// 	}
// 	updatedHash, err := cmd.verifierFn(cmd.password, user.Human.Password.Hash)
// 	if err == nil {
// 		return new(VerificationTypeSucceeded), nil
// 	}

// 	// TODO(IAM-Marco): Do we actually want to differentiate? I feel that it's giving away relevant info
// 	// about the password
// 	if errors.Is(err, passwap.ErrPasswordMismatch) {
// 		err = zerrors.ThrowInvalidArgument(
// 			NewPasswordVerificationError(user.Human.Password.FailedAttempts+1),
// 			"DOM-3gcfDV",
// 			"Errors.User.Password.Invalid",
// 		)
// 		return new(VerificationTypeFailed), err
// 	}

// 	return new(VerificationTypeFailed), zerrors.ThrowInternal(err, "DOM-xceNzI", "Errors.Internal")
// }

var (
	_ SessionCommandOption = (*CheckSessionPasswordSubCommand)(nil)
	_ Commander            = (*CheckSessionPasswordSubCommand)(nil)
	_ Querier[error]       = (*CheckSessionPasswordSubCommand)(nil)
)

type CheckSessionPasswordParent interface {
	user(ctx context.Context, opts *InvokeOpts) (*User, error)
	reloadUser(ctx context.Context, opts *InvokeOpts) (*User, error)
}

func (cmd *CheckSessionPasswordSubCommand) checkResult() SessionFactor {
	return &SessionFactorPassword{}
}
