package domain

import (
	"context"

	"github.com/zitadel/zitadel/backend/v3/storage/database"
)

type SetSessionCommand struct {
	InstanceID string
	SessionID  string

	identifierCheck Commander

	// fetchSession  func(ctx context.Context, opts *InvokeOpts) (*Session, error)
	userCondition database.Condition

	fetchUser    func(ctx context.Context, opts *InvokeOpts) (*User, error)
	fetchSession func(ctx context.Context, opts *InvokeOpts) (*Session, error)
}

// setUserCondition implements [checkSessionUserParent].
func (s *SetSessionCommand) setUserCondition(database.Condition) error {
	panic("unimplemented")
}

// user implements [checkSessionUserParent].
func (s *SetSessionCommand) user(ctx context.Context, opts *InvokeOpts) (*User, error) {
	panic("unimplemented")
}

// func newSetSessionCommand(instanceID, sessionID string) *SetSessionCommand {
// 	session := &SetSessionCommand{
// 		InstanceID: instanceID,
// 		SessionID:  sessionID,
// 	}
// 	session.fetchUser = func(ctx context.Context, opts *InvokeOpts) (*User, error) {
// 		sync.OnceValues(func() (*User, error) {
// 			session, err := opts.sessionRepo.Get(ctx, opts.DB(), database.WithCondition(opts.sessionRepo.PrimaryKeyCondition(instanceID, sessionID)))
// 			if err != nil {
// 				return nil, err
// 			}
// 			return session, nil
// 		})
// 	}
// 	session.fetchSession = func(ctx context.Context, opts *InvokeOpts) (*Session, error) {
// 		sync.OnceValues(func() (*Session, error) {
// 			return opts.sessionRepo.Get(ctx, opts.DB(), database.WithCondition(opts.sessionRepo.PrimaryKeyCondition(instanceID, sessionID)))
// 		})
// 	}

// 	return session
// }

// func (cmd *SetSessionCommand) session(ctx context.Context, opts *InvokeOpts) (session *Session, err error) {
// 	return cmd.fetchSession(ctx, opts)
// }

// func (cmd *SetSessionCommand) setUserCondition(condition database.Condition) error {
// 	if cmd.userCondition != nil {
// 		if cmd.userCondition.Matches(condition) {
// 			return nil
// 		}
// 		return zerrors.ThrowInvalidArgument(nil, "DOMAI-D0UTe", "user condition already set")
// 	}
// 	if cmd.fetchUser != nil {
// 		return nil
// 	}
// 	cmd.userCondition = condition
// 	return nil
// }

// func (cmd *SetSessionCommand) user(ctx context.Context, opts *InvokeOpts) (user *User, err error) {
// 	if cmd.fetchUser != nil {
// 		return cmd.fetchUser(ctx, opts)
// 	}
// 	session, err := cmd.session(ctx, opts)
// 	if err != nil {
// 		return nil, err
// 	}

// }

// type CreateSessionCommand2 struct {
// 	InstanceID string

// 	checks []Commander

// 	fetchUser func() (*User, error)
// }

// func (cmd *CreateSessionCommand2) user(ctx context.Context, opts *InvokeOpts) (user *User, err error) {
// 	if cmd.fetchUser != nil {
// 		return cmd.fetchUser()
// 	}
// 	identifierCheck := cmd.identifierCheck()
// 	if identifierCheck == nil {
// 		return nil, zerrors.ThrowInvalidArgument(nil, "DOMAI-D0UTf", "identifier check not found")
// 	}
// 	cmd.fetchUser = sync.OnceValues(func() (*User, error) {
// 		return opts.userRepo.Get(ctx, opts.DB(), database.WithCondition(identifierCheck.userCondition()))
// 	})
// 	return cmd.fetchUser()
// }

// func (cmd *CreateSessionCommand2) identifierCheck() SessionCheckUserIdentifier {
// 	for _, check := range cmd.checks {
// 		if userIdentifier, ok := check.(SessionCheckUserIdentifier); ok {
// 			return userIdentifier
// 		}
// 	}
// 	return nil
// }

// type SessionCheckUserIdentifier interface {
// 	userCondition() database.Condition
// }
