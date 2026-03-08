# Design Doc: Tiered Signal Store for Risk Evaluation

**Status:** Draft (POC)  
**Authors:** ZITADEL Core Team  
**Date:** 2026-03-08

---

## 1. Problem Statement

ZITADEL's risk engine needs a complete picture of user and session activity to make
informed decisions — rate limiting, SLM/LLM classification, captcha challenges, and
anomaly detection. Today, the signal store (`internal/risk/store.go`) is **in-memory
only** (`MemoryStore`), which means:

- **Signals are lost on restart.** No persistence, no historical analysis.
- **No cross-instance correlation.** In multi-node deployments, each node sees only
  its own signals.
- **No archival.** There's no way to retain signals for audit or long-term pattern
  analysis.
- **Limited enrichment.** Only auth-flow signals are captured; API reads,
  notifications, and other operations are not part of the risk context.

Meanwhile, high-volume signals (HTTP access logs, API reads, notification sends) are
either discarded or sent to external systems via OTel — but they're **not queryable
by the risk engine**.

## 2. Goals

1. **Persist signals durably** without adding mandatory dependencies beyond
   PostgreSQL.
2. **Protect the transaction database** — signal writes must never degrade API
   latency.
3. **Enable a complete risk context** — auth events, API reads, notifications,
   session lifecycle — all in one queryable stream per user/session.
4. **Support tiered storage** — hot (in-memory / Redis) → warm (PostgreSQL) → cold
   (Parquet on FS/S3).
5. **Archive old signals efficiently** via River jobs, freeing PG storage.
6. **Follow existing patterns** — connector abstraction, debouncer, River workers.

## 3. Non-Goals

- Real-time streaming to external consumers (use OTel/instrumentation for that).
- Replacing the existing OTel instrumentation pipeline.
- Building a general-purpose analytics engine.
- Supporting non-PostgreSQL primary databases.
- Replacing `eventstore.events2` — domain events remain the audit log for state
  changes.

---

## 4. Current State

### 4.1 Signal Store (in-memory only)

```go
// internal/risk/store.go
type Store interface {
    Snapshot(ctx context.Context, signal Signal) (Snapshot, error)
    Save(ctx context.Context, signal Signal, findings []Finding) error
}
```

`MemoryStore` holds signals in `map[string][]RecordedSignal` keyed by `userID` and
`sessionID`. Signals are pruned by time window (`HistoryWindow` +
`ContextChangeWindow`) and per-user/session caps (`MaxSignalsPerUser`,
`MaxSignalsPerSession`).

### 4.2 Risk Context

The `RiskContext` struct (`internal/risk/context.go`) is built from a `Snapshot` and
provides counters (failure/success), delta flags (IP/UA/fingerprint changes),
cardinality (distinct IPs/countries), and behavioral signals (login velocity, hour of
day).

### 4.3 Overlap with `eventstore.events2`

The v3 eventstore already captures **domain state changes** as immutable events:

| Already in events2 | NOT in events2 (gaps) |
|--------------------|-----------------------|
| `session.user.checked` | HTTP access logs (path, status, timing) |
| `session.password.checked` | Read operations (who viewed what) |
| `session.totp.checked` | IP addresses / geolocation context |
| `user.password.changed` | Request velocity / behavioral patterns |
| `user.locked` / `user.unlocked` | Rate limit violations |
| `usergrant.created` / `removed` | Notification delivery status |
| `session.terminated` | Cross-operation correlation |

**Key distinction:** `events2` records **what changed** (domain mutations).
Signals record **what happened** (operational behavior). The risk engine needs both
dimensions, but they serve different purposes and have different volume/retention
characteristics.

Rather than making the risk engine query both `events2` and a signal table, **the
signal emitter fires a lightweight signal when relevant domain events occur**. This
keeps the risk engine reading from a single source (the signal table) without needing
to understand the eventstore query model.

### 4.4 Related Patterns Already in the Codebase

| Pattern | Location | Relevance |
|---------|----------|-----------|
| **Connector abstraction** | `internal/cache/connector/` | PG default, Redis optional, Memory fallback, Noop disabled |
| **Debouncer** | `internal/logstore/debouncer.go` | Generic `debouncer[T]` with time + size flush triggers |
| **River queue** | `internal/queue/` | PG-native async job queue with worker registration |
| **Instrumentation** | `backend/v3/instrumentation/` | OTel logs/traces/metrics with `StreamRisk` |
| **Unlogged PG tables** | `internal/cache/pg/` | Used for cache storage — no WAL overhead |

### 4.5 Existing Dependencies

| Dependency | Status |
|------------|--------|
| PostgreSQL | Required (always available) |
| Redis | Optional (connector + circuit breaker exist) |
| River | Available (`github.com/riverqueue/river`) |
| Minio S3 client | Available (`github.com/minio/minio-go/v7`) |
| DuckDB | **Not in go.mod** — new dependency for cold queries |
| Parquet (Go) | **Not in go.mod** — new dependency for archival |

---

## 5. Proposed Architecture

### 5.1 Overview

```
Signal Sources
(HTTP middleware, auth flow, API handlers, notification service, domain events)
         │
         ▼
┌─────────────────────────────────┐
│       Signal Emitter            │
│  (fire-and-forget, bounded)     │
│                                 │
│  signal → buffered channel ──┐  │
│     if full → drop + metric  │  │
└──────────────────────────────┼──┘
                               │
              ┌────────────────┴────────────────┐
              │     Background Goroutine         │
              │     (drains channel)             │
              └──────┬──────────┬───────────────┘
                     │          │
          ┌──────────┴──┐  ┌───┴───────────┐
          │  With Redis │  │ Without Redis  │
          │  (optional) │  │   (default)    │
          └──────┬──────┘  └───┬───────────┘
                 │             │
                 ▼             ▼
          ┌───────────┐  ┌──────────────────┐
          │  Redis    │  │  In-memory       │
          │  Stream   │  │  Ring Buffer     │
          │  (XADD)   │  │  + Debouncer     │
          └─────┬─────┘  └────────┬─────────┘
                │                 │
                │  River job      │  Batch INSERT
                │  (consumer)     │  (debounced)
                ▼                 ▼
          ┌───────────────────────────┐
          │  PostgreSQL Signal Table  │
          │  (unlogged, partitioned)  │
          │  ← Risk engine reads     │
          └─────────────┬─────────────┘
                        │
                        │  River periodic job
                        │  (archival)
                        ▼
          ┌───────────────────────────┐
          │  Cold Storage             │
          │  PG → Parquet             │
          │  FS or S3 (Minio)         │
          │  DuckDB for cold queries  │
          └───────────────────────────┘
```

### 5.2 Tier Responsibilities

| Tier | Storage | Retention | Purpose | Query Pattern |
|------|---------|-----------|---------|---------------|
| **Hot** | In-memory ring buffer or Redis Stream | Seconds–minutes | Decouple write path from PG | Not queried directly by risk engine |
| **Warm** | PostgreSQL (unlogged, partitioned) | Hours–days (configurable) | Risk engine reads, real-time evaluation | Indexed by `(instance_id, caller_id, timestamp)` and `(instance_id, session_id, timestamp)` |
| **Cold** | Parquet files on FS/S3 | Months–years | Historical analysis, audit, forensics | DuckDB with partition pruning |

---

## 6. One Table vs. One Table Per Stream

### 6.1 Decision: Single Table with `stream` Column

The instrumentation system defines 7 streams (`runtime`, `ready`, `request`,
`event_handler`, `queue`, `risk`, `event_pusher`). For signal storage, only a subset
is relevant (primarily `request` and `risk`). Two options were considered:

**Option A — Table per stream:** `signals_request`, `signals_risk`, `signals_audit`

- Pro: Schema tailored per stream, independent retention, easier to reason about volume.
- Con: Risk engine must JOIN/UNION across tables. Multiple archival jobs. Schema drift.

**Option B — Single table with `stream` column** ✅

- Pro: One index set, one archival job, one emitter. Risk engine reads one table.
  Different retention per stream handled by the archival job config.
- Con: Mixed volumes in one table (high-volume access logs alongside lower-volume risk signals).

**Why Option B wins:** The risk engine's primary query is "give me all signals for
caller X in time window Y" — this spans stream types. A user's access log entries,
auth events, and notification signals together form the behavioral picture. Splitting
by stream forces the risk engine to re-assemble what was naturally unified.

PG partitioning handles volume (partition by **time**, not by stream). The `stream`
column enables filtered queries when needed. Archival can apply different retention
per stream within the same River job.

### 6.2 Stream Types for Signals

| Stream | Description | Volume | Source |
|--------|-------------|--------|--------|
| `request` | HTTP/gRPC access logs | High | HTTP middleware |
| `auth` | Authentication flow events | Medium | Auth handlers, session commands |
| `account` | Account changes (from domain events) | Low | Event hooks on user/grant commands |
| `notification` | Notification lifecycle | Low | Notification service |

---

## 7. Signal Schema

### 7.1 Signal Struct (extended)

Every request in ZITADEL has an authenticated caller — even login/register flows use
the login UI's service account. There is no anonymous phase requiring back-fill.

```go
type Signal struct {
    // Identity (always present)
    InstanceID    string
    CallerID      string        // user ID or service account ID — always known
    SessionID     string        // set during auth flows
    FingerprintID string

    // Classification
    Stream        string        // "request", "auth", "account", "notification"
    Operation     string        // e.g., "login.started", "api.read", "notification.sent"
    Resource      string        // e.g., "users.list", "session.create"
    Outcome       Outcome       // success | failure | blocked | challenged

    // Context
    Timestamp     time.Time
    IP            string
    UserAgent     string

    // Tier 1 enrichment (from HTTP headers)
    AcceptLanguage string
    Country        string        // ISO 3166-1 alpha-2 (from GeoCountryHeader)
    ForwardedChain []string
    Referer        string
    SecFetchSite   string
    IsHTTPS        bool
}
```

### 7.2 PostgreSQL Table

```sql
CREATE UNLOGGED TABLE IF NOT EXISTS signals.signals (
    instance_id     TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),

    -- Identity
    caller_id       TEXT        NOT NULL,
    session_id      TEXT,
    fingerprint_id  TEXT,

    -- Classification
    stream          TEXT        NOT NULL,  -- 'request', 'auth', 'account', 'notification'
    operation       TEXT        NOT NULL,
    resource        TEXT,
    outcome         TEXT        NOT NULL,

    -- Context
    ip              INET,
    user_agent      TEXT,
    country         TEXT,
    metadata        JSONB       -- extensible: accept_language, referer, forwarded_chain, etc.
) PARTITION BY RANGE (created_at);

-- Risk engine query indices
CREATE INDEX idx_signals_caller
    ON signals.signals (instance_id, caller_id, created_at DESC);
CREATE INDEX idx_signals_session
    ON signals.signals (instance_id, session_id, created_at DESC)
    WHERE session_id IS NOT NULL;
-- Stream-filtered queries (e.g., "only auth signals for this user")
CREATE INDEX idx_signals_stream
    ON signals.signals (instance_id, caller_id, stream, created_at DESC);
```

**Why UNLOGGED:** Signal data is transient (hot/warm tier). It will be archived to
Parquet before being dropped. WAL overhead is unnecessary — if PG crashes, we lose
the current partition's signals (acceptable for risk heuristics). The cold tier
(Parquet) is the durable archive.

**Why a dedicated `signals` schema:** Keeps signal tables isolated from the
`eventstore`, `projections`, and `zitadel` schemas. Clean separation of concerns.

### 7.3 Partition Management

Rolling time partitions are created automatically:

```sql
-- Example: hourly partitions
CREATE TABLE signals.signals_2026030806 PARTITION OF signals.signals
    FOR VALUES FROM ('2026-03-08 06:00:00') TO ('2026-03-08 07:00:00');
```

A River periodic job creates future partitions and drops archived ones. This avoids
VACUUM entirely — `DROP TABLE` on a partition is instantaneous.

### 7.4 Redis Stream Keys

```
signals:{instance_id}    -- one stream per instance
```

Each entry contains signal fields as a flat hash. Capped with `MAXLEN ~ N`
(configurable, default 100000).

---

## 8. Write Path

### 8.1 Signal Emission (Request Path)

The request goroutine NEVER blocks on storage. All signal writes go through a bounded
channel:

```go
type Emitter struct {
    ch      chan Signal
    dropped atomic.Int64  // exposed as OTel metric: signal_store_dropped_total
}

func (e *Emitter) Emit(signal Signal) {
    select {
    case e.ch <- signal:
    default:
        e.dropped.Add(1)
    }
}
```

The channel size is configurable (default: 4096). If full, the signal is dropped and
a counter incremented — visible as a metric for capacity alerting.

### 8.2 Background Drain

A single goroutine drains the channel and writes to the configured hot tier using the
existing debouncer pattern (`internal/logstore/debouncer.go`):

- **Time trigger:** flush every `MinFrequency` (e.g., 1s)
- **Size trigger:** flush when `MaxBulkSize` reached (e.g., 100 signals)

### 8.3 Sink Implementations

```go
type SignalSink interface {
    WriteBatch(ctx context.Context, signals []Signal) error
}
```

| Sink | Behavior |
|------|----------|
| **PG (default)** | `COPY FROM` batch insert into the partitioned signal table. Uses a dedicated connection pool (2-3 conns, separate from transaction pool). |
| **Redis Stream** | `XADD` per signal with `MAXLEN ~ N`. Circuit breaker fallback to PG on failure. |

### 8.4 Redis → PG Bridge (River Consumer)

When Redis is configured as the hot tier, a River periodic job drains the stream into
PG:

```go
type SignalDrainArgs struct{}

func (SignalDrainArgs) Kind() string { return "signal.drain_redis" }

type SignalDrainWorker struct {
    river.WorkerDefaults[SignalDrainArgs]
    // ...
}

func (w *SignalDrainWorker) Work(ctx context.Context, job *river.Job[SignalDrainArgs]) error {
    // XREADGROUP from Redis Stream
    // Batch INSERT into PG signal table (COPY FROM)
    // XACK processed entries
}
```

Scheduled as a River periodic job (e.g., every 5s). `MaxWorkers: 1` to avoid
contention.

---

## 9. Read Path

### 9.1 Risk Engine Queries (Warm Tier — PG)

The `Store` interface is extended for query-oriented reads:

```go
type Store interface {
    // Existing
    Snapshot(ctx context.Context, signal Signal) (Snapshot, error)
    Save(ctx context.Context, signal Signal, findings []Finding) error

    // New: query-oriented reads
    CallerSignals(ctx context.Context, instanceID, callerID string, since time.Time, limit int) ([]RecordedSignal, error)
    SessionSignals(ctx context.Context, instanceID, sessionID string, since time.Time, limit int) ([]RecordedSignal, error)
}
```

The PG implementation uses index scans:

```sql
SELECT * FROM signals.signals
WHERE instance_id = $1 AND caller_id = $2 AND created_at > $3
ORDER BY created_at DESC
LIMIT $4;
```

Sub-millisecond for typical window sizes (50-100 signals over 30 minutes).

### 9.2 Enriched Risk Context

With the full signal stream, the `RiskContext` gains new dimensions:

```go
type RiskContext struct {
    // ... existing fields (counters, deltas, cardinality, behavioral) ...

    // New: cross-operation enrichment
    RecentAPIReads           int       // API read count in window
    RecentNotifications      int       // notifications sent in window
    PasswordChangeInWindow   bool      // password was changed recently
    MFAEnrolledInWindow      bool      // MFA was added recently
    DataAccessVelocity       float64   // API reads per minute
    DistinctResources        int       // unique resources accessed
}
```

This enables rules like:

```yaml
# Detect data exfiltration pattern
- id: data-exfil
  expr: 'DataAccessVelocity > 60 && DistinctResources > 10'
  engine: llm

# Captcha after suspicious pattern
- id: suspicious-pattern
  expr: 'FailureCount >= 3 && IPChanged && !MFAEnrolledInWindow'
  engine: captcha

# Notification flood
- id: notification-flood
  expr: 'RecentNotifications > 20'
  engine: rate_limit
  window: 1h
  limit: 20
  key: 'caller:{{.Current.CallerID}}'
```

### 9.3 Historical Queries (Cold Tier — DuckDB)

For historical analysis (not real-time risk), DuckDB queries Parquet directly:

```go
type ColdStore struct {
    db *sql.DB  // DuckDB connection (embedded)
}

func (s *ColdStore) QueryHistory(ctx context.Context, q HistoryQuery) ([]RecordedSignal, error) {
    // DuckDB reads Parquet from FS or S3:
    // SELECT * FROM read_parquet('s3://signals/instance=.../year=2026/month=03/*.parquet')
    // WHERE caller_id = ? AND created_at BETWEEN ? AND ?
}
```

DuckDB is embedded (Go driver: `github.com/marcboeker/go-duckdb`). It reads Parquet
from local FS and S3 natively.

---

## 10. Archival Path (River Periodic Job)

### 10.1 PG → Parquet Offload

A River periodic job archives old signal partitions:

```go
type SignalArchiveArgs struct{}

func (SignalArchiveArgs) Kind() string { return "signal.archive" }

func (w *SignalArchiveWorker) Work(ctx context.Context, job *river.Job[SignalArchiveArgs]) error {
    // 1. Identify partitions older than retention window
    // 2. SELECT * FROM signals_<partition> → write Parquet file
    // 3. Upload Parquet to FS/S3
    // 4. DROP TABLE signals_<partition> (instant, no VACUUM)
}
```

### 10.2 Per-Stream Retention

The archival job can apply different retention per stream. For example, keep `auth`
signals in PG for 7 days but `request` signals for only 24 hours:

```yaml
Archive:
  Retention:
    request: 24h
    auth: 168h      # 7 days
    account: 720h   # 30 days
    notification: 168h
```

Streams with shorter retention are archived (and their rows removed) earlier. Since
the table is partitioned by time (not stream), the archival job uses
`DELETE FROM ... WHERE stream = ? AND created_at < ?` for per-stream cleanup within a
partition, and `DROP TABLE` for fully-expired partitions.

### 10.3 Parquet Partitioning on Disk

```
signals/
├── instance=ins_abc123/
│   ├── year=2026/
│   │   └── month=03/
│   │       ├── day=07/
│   │       │   ├── hour=14.parquet
│   │       │   └── hour=15.parquet
│   │       └── day=08/
│   │           └── ...
```

### 10.4 Archive Storage Interface

```go
type ArchiveStorage interface {
    Write(ctx context.Context, path string, data io.Reader) error
}
```

Implementations:
- **FSStorage:** writes to local filesystem (configurable base path)
- **S3Storage:** writes to S3-compatible storage (uses existing `minio-go`)

---

## 11. Protection Mechanisms

### 11.1 Request Path Isolation

The signal write path is fully decoupled from the request transaction:

```
Request goroutine                    Background goroutine
─────────────────                    ────────────────────
handle request                       drain channel loop
  │                                    │
  ├─ business logic (PG txn)           ├─ debounce batch
  │                                    │
  ├─ emit signal (channel send)        ├─ COPY INTO signals table
  │   └─ non-blocking select           │   └─ separate conn pool
  │   └─ drop if full                  │
  │                                    │
  └─ return response                   └─ continue draining
```

The request goroutine never touches the signal table, never waits on Redis, never
blocks.

### 11.2 Per-Tier Safeguards

| Tier | Threat | Safeguard |
|------|--------|-----------|
| **Channel** | Backpressure | Fixed buffer (4096). Drop + metric on full. |
| **In-memory** | OOM | Ring buffer with per-user/session caps. Evicts oldest. |
| **Redis** | Memory exhaustion | `XADD MAXLEN ~ 100000` (capped stream). Circuit breaker (existing `redis.CBConfig`). Fallback to PG. |
| **PG** | Transaction DB impact | **UNLOGGED table** (no WAL). **Separate conn pool** (2-3 conns max). **Batch inserts** (COPY FROM). **Time partitions** (DROP, never VACUUM). |
| **Parquet/S3** | Disk/bandwidth | Periodic archival (not continuous). Configurable retention. ZSTD compression. |

### 11.3 Observability

All tiers emit metrics through the instrumentation system (`StreamRisk`):

| Metric | Type | Description |
|--------|------|-------------|
| `signal_store_emitted_total` | Counter | Signals successfully enqueued |
| `signal_store_dropped_total` | Counter | Signals dropped (channel full) |
| `signal_store_batch_size` | Histogram | Batch sizes flushed to PG |
| `signal_store_batch_latency_ms` | Histogram | Batch write duration |
| `signal_store_pg_partitions` | Gauge | Active PG partitions |
| `signal_store_archive_duration_ms` | Histogram | Archival job duration |
| `signal_store_redis_circuit_open` | Gauge | Redis circuit breaker state |

---

## 12. Configuration

Follows existing `cmd/defaults.yaml` patterns:

```yaml
Risk:
  Enabled: false
  # ... existing risk config ...

  SignalStore:
    # Channel buffer for fire-and-forget emission
    ChannelSize: 4096

    # Hot tier mode
    # "direct" = debouncer → PG batch insert (default, no Redis needed)
    # "redis"  = Redis Stream → River consumer → PG batch insert
    Mode: "direct"

    # Debouncer settings (for "direct" mode and PG batch writes)
    Debounce:
      MinFrequency: 1s
      MaxBulkSize: 100

    # Redis Stream settings (only when Mode: "redis")
    Redis:
      StreamMaxLen: 100000
      ConsumerGroup: "signal-drain"
      DrainInterval: 5s

    # Warm tier: PG signal table
    Postgres:
      MaxConns: 3
      PartitionInterval: 1h

    # Cold tier: Parquet archival
    Archive:
      Enabled: false
      Backend: "fs"          # "fs" or "s3"
      FSPath: "/var/lib/zitadel/signals"
      S3:
        Endpoint: ""
        Bucket: "zitadel-signals"
        AccessKey: ""
        SecretKey: ""
        UseSSL: true
      Compression: "zstd"    # "snappy", "zstd", "gzip", "none"
      Interval: 1h
      Retention:
        request: 24h
        auth: 168h
        account: 720h
        notification: 168h
```

---

## 13. Risk Engine Integration

### 13.1 Extended Evaluation Flow

```
Signal arrives
     │
     ▼
┌────────────────┐
│ Emit to store  │  (fire-and-forget → channel)
└────────┬───────┘
         │
         ▼
┌────────────────┐
│ Store.Snapshot  │  (read from PG: caller + session signals)
└────────┬───────┘
         │
         ▼
┌────────────────────┐
│ buildRiskContext() │  (enriched with API reads, notifications, etc.)
└────────┬───────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│                  Rule Chain                             │
│                                                        │
│  ┌──────────┐  ┌─────────────┐  ┌───────────┐        │
│  │  Block   │  │ Rate Limit  │  │  Captcha  │        │
│  │ (expr)   │  │ (sliding)   │  │ (new)     │        │
│  └────┬─────┘  └──────┬──────┘  └─────┬─────┘        │
│       └───────┬───────┘               │               │
│               ▼                       │               │
│         ┌───────────┐                 │               │
│         │  SLM/LLM  │                 │               │
│         │ (Ollama)   │                 │               │
│         └─────┬─────┘                 │               │
│               └───────┬───────────────┘               │
│                       ▼                               │
│                 ┌──────────┐                          │
│                 │ Decision │                          │
│                 └──────────┘                          │
└────────────────────────────────────────────────────────┘
         │
         ▼
  Allow / Block / Challenge(captcha) / RateLimit(429)
```

### 13.2 New Engine Type: Captcha

```go
const (
    EngineBlock     EngineType = "block"
    EngineRateLimit EngineType = "rate_limit"
    EngineLLM       EngineType = "llm"
    EngineLog       EngineType = "log"
    EngineCaptcha   EngineType = "captcha"     // NEW
)
```

When a captcha rule fires, the `Decision` includes a challenge requirement that the
auth flow must satisfy before proceeding.

---

## 14. Implementation Wiring

### Signal Emission Hook Points

| Hook Point | File | How |
|---|---|---|
| **V2 API requests** | `internal/api/api.go:234` | `risk.SignalConnectUnaryInterceptor(emitter)` in the Connect middleware chain. Fires after authorization, captures operation, caller, resource. Stream: `request`. |
| **Auth flow (session)** | `internal/command/session.go:463-478` | `recordSessionRisk()` emits signals on session create/set outcomes. Stream: `auth`. Called after `enforceSessionRisk()` for both allowed and blocked decisions. |
| **Signal interceptor** | `internal/risk/signal_interceptor.go` | Extracts HTTP headers (IP, UA, Accept-Language, Country, Sec-Fetch-Site, X-Forwarded-For) and emits fire-and-forget to the emitter channel. |

### Risk Enforcement

| Component | File | Behavior |
|---|---|---|
| **Risk evaluation** | `internal/command/session.go:430-461` | `enforceSessionRisk()` calls `Evaluate()` before each session mutation. |
| **Block decision** | `session.go:469` | Returns `PermissionDenied` (COMMAND-RISK0) with `OutcomeBlocked` signal. |
| **Challenge decision** | `session.go:458-467` | Returns `PreconditionFailed` (COMMAND-RISK1) with `OutcomeChallenged` signal. Client must present captcha. |
| **Fail-open** | `session.go:439-446` | When `FailOpen=true` and evaluation errors, logs warning and allows the request. |

### Service Initialization

```
cmd/start/start.go
  └── internal/command/command.go:StartCommands()
        └── risk.New(cfg, store, llm, db, redisClient, archiveStore)
              ├── PGStore (always when db != nil)
              ├── Emitter → Sink (PGStore or GuardedSink→RedisStreamSink)
              ├── PartitionWorker (PG partition management)
              ├── DrainWorker (Redis→PG, only in redis mode)
              ├── ArchiveWorker (PG→Parquet, only when archive enabled)
              └── CaptchaVerifier (Turnstile/hCaptcha/reCAPTCHA)

cmd/start/start.go (worker registration)
  ├── risk.RegisterPartitionWorker(ctx, q, svc)
  ├── risk.RegisterDrainWorker(ctx, q, svc)
  ├── risk.RegisterArchiveWorker(ctx, q, svc)
  │   (after q.Start())
  ├── risk.StartPartitionSchedule(ctx, q, svc)
  ├── risk.StartDrainSchedule(ctx, q, svc)
  └── risk.StartArchiveSchedule(ctx, q, svc)
```

### Data Flow

```
HTTP Request
  │
  ├─[V2 API]─→ SignalConnectUnaryInterceptor ─→ Emitter.Emit(signal)
  │                                                    │
  ├─[Session]─→ enforceSessionRisk() ─→ Evaluate()    │
  │             recordSessionRisk() ─→ Emitter.Emit() │
  │                                                    ▼
  │                                          Bounded Channel (4096)
  │                                                    │
  │                                          ┌─────────┴─────────┐
  │                                     [Mode=pg]           [Mode=redis]
  │                                          │                    │
  │                                     PGStore.WriteBatch   GuardedSink
  │                                          │              (circuit breaker)
  │                                          │                    │
  │                                          ▼              RedisStreamSink
  │                                    signals.signals       (XADD MAXLEN ~)
  │                                    (UNLOGGED, partitioned)    │
  │                                          │              DrainWorker
  │                                          │              (XREADGROUP→PG)
  │                                          │                    │
  │                                          ▼                    ▼
  │                                    signals.signals ◄──────────┘
  │                                          │
  │                                   ArchiveWorker (periodic)
  │                                          │
  │                                   ┌──────┴──────┐
  │                              [Backend=fs]   [Backend=s3]
  │                                   │              │
  │                              Parquet files   S3/MinIO
  │                              (ZSTD compressed)
  └─────────────────────────────────────────────────────────
```

---

## 15. POC Phases

### Phase 1: PG Signal Table + Risk Engine Integration ✅ Implemented

1. Define the `Signal` struct extension — add `Stream`, `Resource`, `CallerID`.
2. Create the `signals` schema and partitioned table (migration).
3. Implement `PGStore` — satisfies the existing `Store` interface.
4. Implement the emitter — buffered channel + debouncer + batch COPY.
5. Wire signal emission from HTTP/gRPC middleware and auth flow handlers.
6. Emit lightweight signals on relevant domain events (password change, MFA enroll).
7. Extend `RiskContext` with cross-operation enrichment fields.
8. Add `Risk.SignalStore` config section in `defaults.yaml`.
9. Add partition management (create future, drop expired).

### Phase 2: Redis Hot Tier ✅ Implemented

10. Implement Redis Stream sink — `XADD` with `MAXLEN`, circuit breaker fallback.
11. Implement River drain worker — `XREADGROUP` → PG batch insert → `XACK`.
12. Add `Mode: "redis"` configuration toggle.

### Phase 3: Parquet Archival ✅ Implemented

13. Implement Parquet writer (using `parquet-go` or DuckDB `COPY TO`).
14. Implement archive storage — FS and S3 (Minio) backends.
15. Implement River archival worker — reads old PG partitions, writes Parquet, drops.
16. Implement DuckDB cold reader for historical queries.
17. Add per-stream retention configuration.

### Phase 4: Captcha Engine ✅ Implemented

18. Add `EngineCaptcha` rule type to the risk engine.
19. Integrate captcha challenge into the auth flow decision path.

### Current Limitations (POC)
- **S3 archive backend**: Config is parsed but falls back to FS storage. Minio client injection from static storage not yet wired.
- **DuckDB cold queries**: Not integrated. Cold data in Parquet is queryable via external tools (DuckDB CLI, Spark, pandas).
- **Captcha client-side**: `EngineCaptcha` produces challenge findings and the server returns `PreconditionFailed`. Client-side widget integration (Turnstile/hCaptcha/reCAPTCHA JavaScript) is not yet implemented in the login UI.
- **Redis signal store**: Requires the `cache` profile with Redis enabled. GuardedSink drops signals (with counter) when Redis is unavailable.

---

## 16. New Dependencies

| Dependency | Purpose | Phase |
|------------|---------|-------|
| `github.com/parquet-go/parquet-go` | Pure Go Parquet writer | Phase 3 |
| `github.com/marcboeker/go-duckdb` | Embedded DuckDB for cold queries | Phase 3 |

No new dependencies required for Phase 1 (PG) or Phase 2 (Redis).

---

## 17. Open Questions

1. **Partition granularity** — 1-hour vs. daily partitions? Hourly is cleaner for
   archival but creates more PG objects. With unlogged tables this should be fine.
2. **Cross-node signal visibility** — In multi-node deployments, PG is the shared
   store. The in-memory ring buffer is per-node. Should the risk engine always go to
   PG, or use a local in-memory cache with TTL?
3. **DuckDB CGO dependency** — `go-duckdb` uses CGO. Is this acceptable for the
   ZITADEL binary? Alternatives: shell out to `duckdb` CLI, or defer cold queries to
   a sidecar.
4. **Parquet schema evolution** — When new fields are added to `Signal`, Parquet
   supports adding columns natively, but we need a versioning/migration strategy.
5. **Per-instance retention** — Should signal retention be configurable per instance
   (tenant), or global?
6. **Captcha provider** — Which service(s) to integrate? hCaptcha, Turnstile,
   reCAPTCHA? Or a pluggable interface?

---

## 18. Signal Operation Taxonomy

| Category | Operation | Description |
|----------|-----------|-------------|
| **Auth** | `login.started` | Login flow initiated |
| | `password.verified` | Password check (success/failure) |
| | `mfa.prompted` | MFA challenge sent |
| | `mfa.verified` | MFA verification (success/failure) |
| | `passkey.verified` | Passkey/WebAuthn verification |
| | `session.created` | Session established |
| | `session.terminated` | Session ended (logout/expiry) |
| | `token.issued` | Access/refresh token issued |
| | `token.refreshed` | Token refresh |
| **Account** | `password.changed` | Password change |
| | `mfa.enrolled` | MFA method added |
| | `mfa.removed` | MFA method removed |
| | `email.changed` | Email address changed |
| | `phone.changed` | Phone number changed |
| **API** | `api.read` | Read API call |
| | `api.write` | Write API call |
| | `api.delete` | Delete API call |
| **Notification** | `notification.sent` | Notification dispatched |
| | `notification.clicked` | Notification link clicked |
| **Grant** | `grant.created` | User grant created |
| | `grant.removed` | User grant removed |
