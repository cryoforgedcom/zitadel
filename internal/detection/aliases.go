package detection

import (
	"github.com/zitadel/zitadel/internal/captcha"
	"github.com/zitadel/zitadel/internal/llm"
	"github.com/zitadel/zitadel/internal/ratelimit"
	"github.com/zitadel/zitadel/internal/signals"
)

type Signal = signals.Signal
type Snapshot = signals.Snapshot
type RecordedSignal = signals.RecordedSignal
type Outcome = signals.Outcome
type SignalStream = signals.SignalStream
type HTTPContext = signals.HTTPContext
type Emitter = signals.Emitter
type SignalStoreConfig = signals.SignalStoreConfig
type DebouncerConfig = signals.DebouncerConfig
type DuckLakeConfig = signals.DuckLakeConfig
type ArchiveBackend = signals.ArchiveBackend
type ArchiveS3Config = signals.ArchiveS3Config

type Prompt = llm.Prompt
type Classification = llm.Classification
type LLMClient = llm.LLMClient
type LLMConfig = llm.Config
type LLMMode = llm.LLMMode

type RateLimitConfig = ratelimit.Config
type RateLimitMode = ratelimit.Mode

type CaptchaConfig = captcha.CaptchaConfig
type CaptchaVerifier = captcha.CaptchaVerifier

const (
	StreamRequest      = signals.StreamRequest
	StreamAuth         = signals.StreamAuth
	StreamAccount      = signals.StreamAccount
	StreamNotification = signals.StreamNotification

	OutcomeSuccess    = signals.OutcomeSuccess
	OutcomeFailure    = signals.OutcomeFailure
	OutcomeBlocked    = signals.OutcomeBlocked
	OutcomeChallenged = signals.OutcomeChallenged

	ArchiveBackendFS = signals.ArchiveBackendFS
	ArchiveBackendS3 = signals.ArchiveBackendS3

	LLMModeDisabled = llm.LLMModeDisabled
	LLMModeObserve  = llm.LLMModeObserve
	LLMModeEnforce  = llm.LLMModeEnforce

	RateLimitModeMemory = ratelimit.ModeMemory
	RateLimitModeRedis  = ratelimit.ModeRedis
	RateLimitModePG     = ratelimit.ModePG
)

var ErrCircuitOpen = llm.ErrCircuitOpen
