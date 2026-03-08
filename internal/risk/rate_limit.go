package risk

import (
	"hash/fnv"
	"sync"
	"time"
)

const rateLimiterShards = 64

// RateLimiter provides a thread-safe in-memory sliding-window rate limiter.
// Each key tracks a count within a fixed time window. When the window expires
// the counter resets. Keys are distributed across shards to reduce lock
// contention under high concurrency.
type RateLimiter struct {
	shards [rateLimiterShards]rateShard
}

type rateShard struct {
	mu       sync.Mutex
	counters map[string]*windowCounter
}

type windowCounter struct {
	count       int
	windowStart time.Time
	window      time.Duration
	max         int
}

// NewRateLimiter creates a new in-memory rate limiter.
func NewRateLimiter() *RateLimiter {
	rl := &RateLimiter{}
	for i := range rl.shards {
		rl.shards[i].counters = make(map[string]*windowCounter)
	}
	return rl
}

func (rl *RateLimiter) shard(key string) *rateShard {
	h := fnv.New32a()
	_, _ = h.Write([]byte(key))
	return &rl.shards[h.Sum32()%rateLimiterShards]
}

// Check increments the counter for key and returns the current count and
// whether the request is still within the limit. The window and max are
// per-rule and provided at check time. Expired counters encountered during
// lookup are lazily evicted to bound memory growth.
func (rl *RateLimiter) Check(key string, window time.Duration, max int, now time.Time) (count int, allowed bool) {
	s := rl.shard(key)
	s.mu.Lock()
	defer s.mu.Unlock()

	wc, ok := s.counters[key]
	if !ok || now.Sub(wc.windowStart) >= wc.window {
		s.counters[key] = &windowCounter{
			count:       1,
			windowStart: now,
			window:      window,
			max:         max,
		}
		return 1, true
	}

	wc.count++
	return wc.count, wc.count <= max
}

// Len returns the number of tracked counter keys (for testing/monitoring).
func (rl *RateLimiter) Len() int {
	total := 0
	for i := range rl.shards {
		rl.shards[i].mu.Lock()
		total += len(rl.shards[i].counters)
		rl.shards[i].mu.Unlock()
	}
	return total
}

// Prune removes expired counters. Call periodically to prevent unbounded growth.
func (rl *RateLimiter) Prune(now time.Time) {
	for i := range rl.shards {
		rl.shards[i].mu.Lock()
		for key, wc := range rl.shards[i].counters {
			if now.Sub(wc.windowStart) >= wc.window {
				delete(rl.shards[i].counters, key)
			}
		}
		rl.shards[i].mu.Unlock()
	}
}
