package signals

import (
	"context"
	"time"

	"github.com/zitadel/zitadel/internal/eventstore"
)

// NewEventSignalHook returns a hook function suitable for
// [eventstore/v3.WithSignalHook]. Every pushed event is converted to a
// Signal on the "events" stream and emitted fire-and-forget through the
// given Emitter. This replaces the old signalprojection handler.
func NewEventSignalHook(emitter *Emitter) func(ctx context.Context, events []eventstore.Event) {
	return func(_ context.Context, events []eventstore.Event) {
		for _, e := range events {
			agg := e.Aggregate()
			ts := e.CreatedAt()
			if ts.IsZero() {
				ts = time.Now().UTC()
			}

			var payload string
			if b := e.DataAsBytes(); len(b) > 0 {
				payload = string(b)
			}

			emitter.Emit(Signal{
				InstanceID: agg.InstanceID,
				UserID:     agg.ID,
				CallerID:   e.Creator(),
				SessionID:  agg.ID,
				Operation:  string(e.Type()),
				Stream:     StreamEvents,
				Resource:   string(agg.Type),
				Outcome:    OutcomeSuccess,
				Timestamp:  ts,
				Payload:    payload,
			})
		}
	}
}
