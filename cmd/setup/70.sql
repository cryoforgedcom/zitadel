CREATE SCHEMA IF NOT EXISTS signals;

CREATE UNLOGGED TABLE IF NOT EXISTS signals.signals (
    instance_id     TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    caller_id       TEXT        NOT NULL,
    user_id         TEXT,
    session_id      TEXT,
    fingerprint_id  TEXT,
    stream          TEXT        NOT NULL,
    operation       TEXT        NOT NULL,
    resource        TEXT,
    outcome         TEXT        NOT NULL,
    ip              INET,
    user_agent      TEXT,
    country         TEXT,
    metadata        JSONB
) PARTITION BY RANGE (created_at);

-- Default partition to catch signals before specific partitions are created
CREATE UNLOGGED TABLE IF NOT EXISTS signals.signals_default
    PARTITION OF signals.signals DEFAULT;

-- Risk engine queries by caller within time window
CREATE INDEX IF NOT EXISTS idx_signals_caller
    ON signals.signals (instance_id, caller_id, created_at DESC);

-- Session-scoped queries
CREATE INDEX IF NOT EXISTS idx_signals_session
    ON signals.signals (instance_id, session_id, created_at DESC)
    WHERE session_id IS NOT NULL;

-- Stream-filtered queries
CREATE INDEX IF NOT EXISTS idx_signals_stream
    ON signals.signals (instance_id, caller_id, stream, created_at DESC);
