package signals

import (
"context"
"sort"
"sync"
"time"
)

type Store interface {
Snapshot(ctx context.Context, signal Signal, cfg SnapshotConfig) (Snapshot, error)
Save(ctx context.Context, signal Signal, findings []RecordedFinding, cfg SnapshotConfig) error
}

type MemoryStore struct {
mu             sync.RWMutex
cfg            SnapshotConfig
userSignals    map[string][]RecordedSignal
sessionSignals map[string][]RecordedSignal
sessionWindows map[string]time.Duration
}

func NewMemoryStore(cfg SnapshotConfig) *MemoryStore {
return &MemoryStore{
cfg:            cfg,
userSignals:    make(map[string][]RecordedSignal),
sessionSignals: make(map[string][]RecordedSignal),
sessionWindows: make(map[string]time.Duration),
}
}

func (s *MemoryStore) Snapshot(_ context.Context, signal Signal, cfg SnapshotConfig) (Snapshot, error) {
s.mu.RLock()
defer s.mu.RUnlock()

cfg = effectiveSnapshotConfig(cfg, s.cfg)
cutoff := signalCutoff(signal.Timestamp, cfg.HistoryWindow, cfg.ContextChangeWindow)

var snapshot Snapshot
if signal.UserID != "" {
snapshot.UserSignals = filterSignals(s.userSignals[userSignalKey(signal)], cutoff)
}
if signal.SessionID != "" {
snapshot.SessionSignals = filterSignals(s.sessionSignals[sessionSignalKey(signal)], cutoff)
}
return snapshot, nil
}

func (s *MemoryStore) Save(_ context.Context, signal Signal, findings []RecordedFinding, cfg SnapshotConfig) error {
s.mu.Lock()
defer s.mu.Unlock()

cfg = effectiveSnapshotConfig(cfg, s.cfg)
cutoff := signalCutoff(signal.Timestamp, cfg.HistoryWindow, cfg.ContextChangeWindow)

record := RecordedSignal{Signal: signal, Findings: append([]RecordedFinding(nil), findings...)}
if signal.UserID != "" {
key := userSignalKey(signal)
records := append(s.userSignals[key], record)
s.userSignals[key] = pruneSignals(records, cutoff, cfg.MaxSignalsPerUser)
}
if signal.SessionID != "" {
key := sessionSignalKey(signal)
records := append(s.sessionSignals[key], record)
s.sessionSignals[key] = pruneSignals(records, cutoff, cfg.MaxSignalsPerSession)
window := maxDuration(cfg.HistoryWindow, cfg.ContextChangeWindow)
if window > s.sessionWindows[key] {
s.sessionWindows[key] = window
}
}
return nil
}

// PruneSessions removes session entries whose most recent signal is older than
// the configured history window. Call periodically to prevent unbounded growth
// of the sessionSignals map from finished sessions.
func (s *MemoryStore) PruneSessions(now time.Time) int {
s.mu.Lock()
defer s.mu.Unlock()

pruned := 0
defaultWindow := maxDuration(s.cfg.HistoryWindow, s.cfg.ContextChangeWindow)
for id, signals := range s.sessionSignals {
window := s.sessionWindows[id]
if window <= 0 {
window = defaultWindow
}
cutoff := now.Add(-window)
if len(signals) == 0 || signals[len(signals)-1].Timestamp.Before(cutoff) {
delete(s.sessionSignals, id)
delete(s.sessionWindows, id)
pruned++
}
}
return pruned
}

// signalCutoff computes the cutoff time for filtering/pruning signals.
func signalCutoff(signalTime time.Time, historyWindow, contextChangeWindow time.Duration) time.Time {
base := signalTime
if base.IsZero() {
base = time.Now().UTC()
}
return base.Add(-maxDuration(historyWindow, contextChangeWindow))
}

// filterSignals returns only signals at or after the cutoff time.
// Signals are stored in chronological order, so we use binary search to find
// the cutoff index and return a sub-slice (zero allocation for large histories).
func filterSignals(signals []RecordedSignal, cutoff time.Time) []RecordedSignal {
if len(signals) == 0 {
return nil
}
// Binary search: find the first signal at or after cutoff.
idx := sort.Search(len(signals), func(i int) bool {
return !signals[i].Timestamp.Before(cutoff)
})
if idx >= len(signals) {
return nil
}
return signals[idx:]
}

func pruneSignals(signals []RecordedSignal, cutoff time.Time, max int) []RecordedSignal {
pruned := filterSignals(signals, cutoff)
if len(pruned) <= max {
return pruned
}
return pruned[len(pruned)-max:]
}

func maxDuration(a, b time.Duration) time.Duration {
if a > b {
return a
}
return b
}

func effectiveSnapshotConfig(cfg, fallback SnapshotConfig) SnapshotConfig {
if cfg.HistoryWindow <= 0 {
cfg.HistoryWindow = fallback.HistoryWindow
}
if cfg.ContextChangeWindow <= 0 {
cfg.ContextChangeWindow = fallback.ContextChangeWindow
}
if cfg.MaxSignalsPerUser <= 0 {
cfg.MaxSignalsPerUser = fallback.MaxSignalsPerUser
}
if cfg.MaxSignalsPerSession <= 0 {
cfg.MaxSignalsPerSession = fallback.MaxSignalsPerSession
}
return cfg
}

func userSignalKey(signal Signal) string {
return signal.InstanceID + ":" + signal.UserID
}

func sessionSignalKey(signal Signal) string {
return signal.InstanceID + ":" + signal.SessionID
}
