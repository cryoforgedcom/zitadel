package domain

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/zitadel/zitadel/backend/v3/storage/database"
	"github.com/zitadel/zitadel/internal/eventstore"
	"github.com/zitadel/zitadel/internal/zerrors"
)

type CreateSessionCommand struct {
	instanceID string
	creatorID  string

	checks     []sessionCheckSubCommand
	challenges []sessionChallengeSubCommand
	userAgent  *SessionUserAgent
	lifetime   *time.Duration
	metadata   []*SessionMetadata

	userCond    database.Condition
	fetchedUser func() (*User, error)
}

func NewCreateSessionCommand(instanceID, creatorID string, userAgent *SessionUserAgent, opts ...CreateSessionOption) Commander {
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

type CreateSessionOption interface {
	ApplyOnCreateSessionCommand(parent *CreateSessionCommand)
}

type sessionCheckSubCommand interface {
	Commander
	checkResult() SessionFactor
}

type sessionChallengeSubCommand interface {
	Commander
	challengeResult() SessionChallenge
}

// Events implements [Commander].
func (c *CreateSessionCommand) Events(ctx context.Context, opts *InvokeOpts) ([]eventstore.Command, error) {
	// TODO(adlerhurst): add create session event
	var events []eventstore.Command
	for _, check := range c.checks {
		subEvents, err := check.Events(ctx, opts)
		if err != nil {
			return nil, err
		}
		events = append(events, subEvents...)
	}
	return events, nil
}

// Execute implements [Commander].
func (c *CreateSessionCommand) Execute(ctx context.Context, opts *InvokeOpts) (err error) {
	session := &Session{
		ID:         opts.MustNewID(),
		InstanceID: c.instanceID,
		CreatorID:  c.creatorID,
		Metadata:   c.metadata,
		UserAgent:  c.userAgent,
	}
	if c.lifetime != nil {
		session.Lifetime = *c.lifetime
	}

	for _, check := range c.checks {
		if err := opts.Invoke(ctx, check); err != nil {
			return err
		}
		session.Factors = append(session.Factors, check.checkResult())
	}

	for _, challenge := range c.challenges {
		if err := opts.Invoke(ctx, challenge); err != nil {
			return err
		}
		session.Challenges = append(session.Challenges, challenge.challengeResult())
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

var _ Commander = (*CreateSessionCommand)(nil)

var _ checkSessionUserParent = (*CreateSessionCommand)(nil)

func (cmd *CreateSessionCommand) identifierCheck() SessionCheckUserIdentifier {
	for _, check := range cmd.checks {
		if userIdentifier, ok := check.(SessionCheckUserIdentifier); ok {
			return userIdentifier
		}
	}
	return nil
}

func (cmd *CreateSessionCommand) setUserCondition(condition database.Condition) error {
	if cmd.userCond != nil {
		if cmd.userCond.Matches(condition) {
			return nil
		}
		return zerrors.ThrowInvalidArgument(nil, "DOMAI-D0UTe", "user condition already set")
	}
	cmd.userCond = condition
	return nil
}

func (cmd *CreateSessionCommand) user(ctx context.Context, opts *InvokeOpts) (user *User, err error) {
	if cmd.fetchedUser != nil {
		return cmd.fetchedUser()
	}
	cmd.fetchedUser = sync.OnceValues(func() (*User, error) {
		user, err := opts.userRepo.Get(ctx, opts.DB(), database.WithCondition(cmd.userCondition(ctx, opts)))
		if err != nil {
			if errors.Is(err, &database.NoRowFoundError{}) {
				return nil, zerrors.ThrowNotFound(err, "DOM-lcZeXI", "user not found")
			}
			return nil, zerrors.ThrowInternal(err, "DOM-Y846I0", "failed fetching user")
		}
		return user, nil
	})
	return cmd.fetchedUser()
}

type SessionCheckUserIdentifier interface {
	PreValidation(ctx context.Context, opts *InvokeOpts) error
	sessionUserIdentifier()
}

func (cmd *CreateSessionCommand) userCondition(ctx context.Context, opts *InvokeOpts) database.Condition {
	if cmd.userCond != nil {
		return cmd.userCond
	}
	identifierCheck := cmd.identifierCheck()
	if identifierCheck == nil {
		return nil
	}
	if err := identifierCheck.PreValidation(ctx, opts); err != nil {
		return nil
	}
	return cmd.userCond
}
