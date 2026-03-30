package domain

import (
	"context"
	"errors"

	"github.com/zitadel/passwap"

	"github.com/zitadel/zitadel/internal/eventstore"
	"github.com/zitadel/zitadel/internal/zerrors"
)

type CheckPasswordCommand struct {
	parent CheckPasswordParent

	verifyPassword func(encoded, password string) (updated string, err error)

	validatedUser        *User
	password             string
	updatedPassword      string
	passwordVerification VerificationType

	verificationErr error
}

func NewCheckPasswordCommand2(parent CheckPasswordParent, password string) *CheckPasswordCommand {
	cmd := &CheckPasswordCommand{
		parent:         parent,
		password:       password,
		verifyPassword: passwordHasher.Verify,
	}
	return cmd
}

// Events implements [Commander].
func (c *CheckPasswordCommand) Events(ctx context.Context, opts *InvokeOpts) ([]eventstore.Command, error) {
	panic("unimplemented")
}

// Execute implements [Commander].
func (c *CheckPasswordCommand) Execute(ctx context.Context, opts *InvokeOpts) (err error) {
	if c.verificationErr != nil {
		return nil
	}

	latestUser, err := c.parent.reloadUser(ctx, opts)
	if err != nil {
		return err
	}
	if latestUser.Human == nil {
		return zerrors.ThrowInvalidArgument(nil, "DOM-9n8sdf", "user is not human")
	}

	if latestUser.Human.Password.Hash != c.validatedUser.Human.Password.Hash {
		return zerrors.ThrowInvalidArgument(nil, "DOM-9n8sdf", "password has changed since last check")
	}

	return nil
}

// String implements [Commander].
func (c *CheckPasswordCommand) String() string {
	return "CheckPasswordCommand"
}

// Validate implements [Commander].
func (c *CheckPasswordCommand) Validate(ctx context.Context, opts *InvokeOpts) (err error) {
	panic("unimplemented")
}

// PreValidate implements [PreValidator].
func (c *CheckPasswordCommand) PreValidate(ctx context.Context, opts *InvokeOpts) (err error) {
	c.validatedUser, err = c.parent.fetchUser(ctx, opts)
	if err != nil {
		return err
	}

	if c.validatedUser.Human == nil {
		return zerrors.ThrowInvalidArgument(nil, "DOM-9n8sdf", "user is not human")
	}

	c.updatedPassword, c.verificationErr = c.verifyPassword(c.validatedUser.Human.Password.Hash, c.password)
	if c.verificationErr == nil {
		c.passwordVerification = new(VerificationTypeSucceeded)
		return nil
	}

	if errors.Is(c.verificationErr, passwap.ErrPasswordMismatch) {
		c.verificationErr = zerrors.ThrowInvalidArgument(
			NewPasswordVerificationError(c.validatedUser.Human.Password.FailedAttempts+1),
			"DOM-3gcfDV",
			"Errors.User.Password.Invalid",
		)
	}
	c.passwordVerification = new(VerificationTypeFailed)
	return nil
}

func NewCheckPasswordCommand(parent CheckPasswordParent, password string) *CheckPasswordCommand {
	cmd := &CheckPasswordCommand{
		parent:   parent,
		password: password,
	}
	return cmd
}

type CheckPasswordParent interface {
	ID() string
	InstanceID() string

	fetchUser(ctx context.Context, opts *InvokeOpts) (user *User, err error)
	reloadUser(ctx context.Context, opts *InvokeOpts) (user *User, err error)
}

var (
	_ Commander    = (*CheckPasswordCommand)(nil)
	_ PreValidator = (*CheckPasswordCommand)(nil)
)
