package domain

import "time"

type SessionCommandOption interface {
	CreateSessionOption
}

func WithSessionMetadata(metadata ...*SessionMetadata) SessionCommandOption {
	return sessionMetadataOption{metadata: metadata}
}

type sessionMetadataOption struct {
	metadata []*SessionMetadata
}

func (smo sessionMetadataOption) ApplyOnCreateSessionCommand(cmd *CreateSessionCommand) {
	cmd.metadata = append(cmd.metadata, smo.metadata...)
}

var _ CreateSessionOption = sessionMetadataOption{}

func WithSessionUserAgent(userAgent *SessionUserAgent) SessionCommandOption {
	return sessionUserAgentOption{userAgent: userAgent}
}

type sessionUserAgentOption struct {
	userAgent *SessionUserAgent
}

func (sua sessionUserAgentOption) ApplyOnCreateSessionCommand(cmd *CreateSessionCommand) {
	cmd.userAgent = sua.userAgent
}

var _ CreateSessionOption = sessionUserAgentOption{}

func WithSessionLifetime(lifetime time.Duration) SessionCommandOption {
	return sessionLifetimeOption{lifetime: lifetime}
}

type sessionLifetimeOption struct {
	lifetime time.Duration
}

func (slo sessionLifetimeOption) ApplyOnCreateSessionCommand(cmd *CreateSessionCommand) {
	cmd.lifetime = &slo.lifetime
}

var _ CreateSessionOption = sessionLifetimeOption{}

type SessionCheckOption func(*CreateSessionCommand) Commander

// ApplyOnCreateSessionCommand implements [CreateSessionOption].
func (s SessionCheckOption) ApplyOnCreateSessionCommand(cmd *CreateSessionCommand) {
	// cmd.checks = append(cmd.checks, s)
	panic("unimplemented")
}

var _ CreateSessionOption = SessionCheckOption(nil)

type SessionChallengeOption func(*CreateSessionCommand) Commander

// ApplyOnCreateSessionCommand implements [CreateSessionOption].
func (s SessionChallengeOption) ApplyOnCreateSessionCommand(cmd *CreateSessionCommand) {
	// cmd.challenges = append(cmd.challenges, s)
	panic("unimplemented")
}

var _ CreateSessionOption = SessionChallengeOption(nil)
