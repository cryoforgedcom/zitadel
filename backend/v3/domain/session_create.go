package domain

import (
	"context"
	"strings"
	"time"

	"github.com/zitadel/zitadel/backend/v3/storage/database"
	"github.com/zitadel/zitadel/internal/eventstore"
	"github.com/zitadel/zitadel/internal/zerrors"
)

type CreateSessionCommand struct {
	instanceID string
	creatorID  string
	sessionID  string

	checks     []sessionCheckSubCommand
	challenges []sessionChallengeSubCommand
	userAgent  *SessionUserAgent
	lifetime   *time.Duration
	metadata   []*SessionMetadata

	user lazyGetter[*User]
}

type CreateSessionOption interface {
	ApplyOnCreateSessionCommand(parent *CreateSessionCommand)
}

func NewCreateSessionCommand(instanceID, creatorID string, userAgent *SessionUserAgent, opts ...CreateSessionOption) *CreateSessionCommand {
	cmd := &CreateSessionCommand{
		instanceID: instanceID,
		creatorID:  creatorID,
		userAgent:  userAgent,
	}

	for _, opt := range opts {
		opt.ApplyOnCreateSessionCommand(cmd)
	}

	return cmd
}

// Events implements [Commander].
func (c *CreateSessionCommand) Events(ctx context.Context, opts *InvokeOpts) ([]eventstore.Command, error) {
	panic("unimplemented")
}

// Execute implements [Commander].
func (c *CreateSessionCommand) Execute(ctx context.Context, opts *InvokeOpts) (err error) {
	c.sessionID = opts.MustNewID()
	session := &Session{
		InstanceID: c.instanceID,
		ID:         c.sessionID,
		CreatorID:  c.creatorID,
	}
	if c.lifetime != nil && *c.lifetime > 0 {
		session.Lifetime = *c.lifetime
	}
	return opts.sessionRepo.Create(ctx, opts.DB(), session)
}

// String implements [Commander].
func (c *CreateSessionCommand) String() string {
	return "CreateSessionCommand"
}

// Validate implements [Commander].
func (c *CreateSessionCommand) Validate(ctx context.Context, opts *InvokeOpts) (err error) {
	if c.instanceID = strings.TrimSpace(c.instanceID); c.instanceID == "" {
		return zerrors.ThrowInvalidArgument(nil, "DOM-9n8sdf", "invalid instance ID")
	}
	if c.creatorID = strings.TrimSpace(c.creatorID); c.creatorID == "" {
		return zerrors.ThrowInvalidArgument(nil, "DOM-9n8sdf", "invalid creator ID")
	}
	return nil
}

// ID implements [CheckUserParent].
func (c *CreateSessionCommand) ID() string {
	return c.sessionID
}

// InstanceID implements [CheckUserParent].
func (c *CreateSessionCommand) InstanceID() string {
	return c.instanceID
}

// setUserConditionProvider implements [CheckUserParent].
func (c *CreateSessionCommand) setUserConditionProvider(provider userConditionProvider) {
	c.user = lazyGetter[*User]{
		get: func(ctx context.Context, opts *InvokeOpts) (*User, error) {
			return opts.userRepo.Get(ctx, opts.DB(), database.WithCondition(database.And(
				opts.userRepo.InstanceIDCondition(c.instanceID),
				provider(ctx, opts),
			)))
		},
	}
}

// user implements [CheckUserParent].
func (c *CreateSessionCommand) fetchUser(ctx context.Context, opts *InvokeOpts) (user *User, err error) {
	return c.user.fetch(ctx, opts)
}

// reloadUser implements [CheckUserParent].
func (c *CreateSessionCommand) reloadUser(ctx context.Context, opts *InvokeOpts) (user *User, err error) {
	return c.user.reload(ctx, opts)
}

var (
	_ Commander           = (*CreateSessionCommand)(nil)
	_ CheckUserParent     = (*CreateSessionCommand)(nil)
	_ CheckPasswordParent = (*CreateSessionCommand)(nil)
)

type sessionCheckSubCommand interface {
	Commander
	checkResult() SessionFactor
}

type sessionChallengeSubCommand interface {
	Commander
	challengeResult() SessionChallenge
}

// func (c *CreateSessionCommand) PreValidation(ctx context.Context, opts *InvokeOpts) error {
// 	for _, check := range c.checks {
// 		if preValidator, ok := check.(PreValidator); ok {
// 			if err := preValidator.PreValidate(ctx, opts); err != nil {
// 				return err
// 			}
// 		}
// 	}
// 	for _, challenge := range c.challenges {
// 		if preValidator, ok := challenge.(PreValidator); ok {
// 			if err := preValidator.PreValidate(ctx, opts); err != nil {
// 				return err
// 			}
// 		}
// 	}
// 	return nil
// }

// // Events implements [Commander].
// func (c *CreateSessionCommand) Events(ctx context.Context, opts *InvokeOpts) ([]eventstore.Command, error) {
// 	// TODO(adlerhurst): add create session event
// 	var events []eventstore.Command
// 	for _, check := range c.checks {
// 		subEvents, err := check.Events(ctx, opts)
// 		if err != nil {
// 			return nil, err
// 		}
// 		events = append(events, subEvents...)
// 	}
// 	return events, nil
// }

// // Execute implements [Commander].
// func (c *CreateSessionCommand) Execute(ctx context.Context, opts *InvokeOpts) (err error) {
// 	session := &Session{
// 		ID:         opts.MustNewID(),
// 		InstanceID: c.instanceID,
// 		CreatorID:  c.creatorID,
// 		Metadata:   c.metadata,
// 		UserAgent:  c.userAgent,
// 	}
// 	if c.lifetime != nil {
// 		session.Lifetime = *c.lifetime
// 	}

// 	for _, check := range c.checks {
// 		if err := opts.Invoke(ctx, check); err != nil {
// 			return err
// 		}
// 		session.Factors = append(session.Factors, check.checkResult())
// 	}

// 	for _, challenge := range c.challenges {
// 		if err := opts.Invoke(ctx, challenge); err != nil {
// 			return err
// 		}
// 		session.Challenges = append(session.Challenges, challenge.challengeResult())
// 	}

// 	return opts.sessionRepo.Create(ctx, opts.DB(), session)
// }

// // String implements [Commander].
// func (c *CreateSessionCommand) String() string {
// 	return "CreateSessionCommand"
// }

// // Validate implements [Commander].
// func (c *CreateSessionCommand) Validate(ctx context.Context, opts *InvokeOpts) (err error) {
// 	if c.instanceID = strings.TrimSpace(c.instanceID); c.instanceID == "" {
// 		return zerrors.ThrowInvalidArgument(nil, "DOM-9n8sdf", "invalid instance ID")
// 	}
// 	if c.creatorID = strings.TrimSpace(c.creatorID); c.creatorID == "" {
// 		return zerrors.ThrowInvalidArgument(nil, "DOM-9n8sdf", "invalid creator ID")
// 	}
// 	return nil
// }

// var (
// 	_ Commander                  = (*CreateSessionCommand)(nil)
// 	_ CheckSessionUserParent     = (*CreateSessionCommand)(nil)
// 	_ CheckSessionPasswordParent = (*CreateSessionCommand)(nil)
// )

// func (cmd *CreateSessionCommand) identifierCheck() SessionCheckUserIdentifier {
// 	for _, check := range cmd.checks {
// 		if userIdentifier, ok := check.(SessionCheckUserIdentifier); ok {
// 			return userIdentifier
// 		}
// 	}
// 	return nil
// }

// func (cmd *CreateSessionCommand) user(ctx context.Context, opts *InvokeOpts) (user *User, err error) {
// 	if cmd.fetchedUser != nil {
// 		return cmd.fetchedUser()
// 	}
// 	cmd.fetchedUser = sync.OnceValues(func() (*User, error) {
// 		user, err := opts.userRepo.Get(ctx, opts.DB(), database.WithCondition(cmd.userCondition(ctx, opts)))
// 		if err != nil {
// 			if errors.Is(err, &database.NoRowFoundError{}) {
// 				return nil, zerrors.ThrowNotFound(err, "DOM-lcZeXI", "user not found")
// 			}
// 			return nil, zerrors.ThrowInternal(err, "DOM-Y846I0", "failed fetching user")
// 		}
// 		return user, nil
// 	})
// 	return cmd.fetchedUser()
// }

// func (cmd *CreateSessionCommand) userCondition(ctx context.Context, opts *InvokeOpts) database.Condition {
// 	if cmd.userCond != nil {
// 		return cmd.userCond
// 	}
// 	identifierCheck := cmd.identifierCheck()
// 	if identifierCheck == nil {
// 		return nil
// 	}
// 	if err := identifierCheck.PreValidation(ctx, opts); err != nil {
// 		return nil
// 	}
// 	return cmd.userCond
// }
