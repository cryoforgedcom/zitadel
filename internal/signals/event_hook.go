package signals

import (
	"context"
	"strings"
	"time"

	"github.com/zitadel/zitadel/internal/eventstore"
	"github.com/zitadel/zitadel/internal/telemetry/tracing"
)

// NewEventSignalHook returns a hook function that converts every pushed
// event into a Signal on the "events" stream. The conversion runs in a
// background goroutine so the eventstore push path is never delayed.
// Events are emitted fire-and-forget through the given Emitter.
func NewEventSignalHook(emitter *Emitter) func(ctx context.Context, events []eventstore.Event) {
	return func(ctx context.Context, events []eventstore.Event) {
		traceID := tracing.TraceIDFromCtx(ctx)
		spanID := spanIDFromCtx(ctx)

		// Snapshot event data before spawning goroutine — Event
		// interface values may not be safe to read after Push returns.
		type snap struct {
			instanceID string
			aggID      string
			aggType    string
			creator    string
			eventType  string
			ts         time.Time
			payload    string
		}
		snaps := make([]snap, len(events))
		for i, e := range events {
			agg := e.Aggregate()
			ts := e.CreatedAt()
			if ts.IsZero() {
				ts = time.Now().UTC()
			}
			var payload string
			if b := e.DataAsBytes(); len(b) > 0 {
				payload = string(b)
			}
			snaps[i] = snap{
				instanceID: agg.InstanceID,
				aggID:      agg.ID,
				aggType:    string(agg.Type),
				creator:    e.Creator(),
				eventType:  string(e.Type()),
				ts:         ts,
				payload:    payload,
			}
		}

		go func() {
			for _, s := range snaps {
				// Only set UserID/SessionID when the aggregate
				// actually represents a user or session. For other
				// aggregate types the ID is a resource identifier,
				// not a user/session.
				var userID, sessionID string
				switch {
				case strings.HasPrefix(s.aggType, "user"):
					userID = s.aggID
				case strings.HasPrefix(s.aggType, "session"):
					sessionID = s.aggID
				}

				emitter.Emit(Signal{
					InstanceID: s.instanceID,
					UserID:     userID,
					CallerID:   s.creator,
					SessionID:  sessionID,
					Operation:  s.eventType,
					Stream:     StreamEvents,
					Resource:   s.aggType + "/" + s.aggID,
					Outcome:    outcomeFromEventType(s.eventType),
					Timestamp:  s.ts,
					Payload:    s.payload,
					TraceID:    traceID,
					SpanID:     spanID,
				})
			}
		}()
	}
}

// outcomeFromEventType derives the outcome from an event type name.
// Events ending in ".failed" are classified as failures; all others
// are treated as successes.
func outcomeFromEventType(eventType string) Outcome {
	if strings.HasSuffix(eventType, ".failed") {
		return OutcomeFailure
	}
	return OutcomeSuccess
}
