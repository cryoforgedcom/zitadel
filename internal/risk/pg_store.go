package risk

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"time"
)

// PGStore implements [Store] and [SignalSink] backed by the signals.signals
// PostgreSQL table. It reads and writes signals using the provided *sql.DB.
type PGStore struct {
	db  *sql.DB
	cfg Config
}

// NewPGStore creates a PG-backed signal store.
func NewPGStore(db *sql.DB, cfg Config) *PGStore {
	return &PGStore{db: db, cfg: cfg}
}

// Save inserts a single signal with its findings into the signal table.
// It is called by the risk engine's Record() path after evaluation.
func (s *PGStore) Save(ctx context.Context, signal Signal, findings []Finding) error {
	return s.insertSignal(ctx, s.db, signal, findings)
}

// WriteBatch inserts a batch of signals into the signal table using a
// multi-row INSERT for efficiency. Called by the [Emitter] debouncer.
// Findings are nil for emitter-sourced signals.
func (s *PGStore) WriteBatch(ctx context.Context, signals []Signal) error {
	if len(signals) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("signal store begin tx: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	const cols = 14
	const maxBatch = 500
	for start := 0; start < len(signals); start += maxBatch {
		end := start + maxBatch
		if end > len(signals) {
			end = len(signals)
		}
		batch := signals[start:end]

		placeholders := make([]string, 0, len(batch))
		args := make([]any, 0, len(batch)*cols)
		for i, sig := range batch {
			meta := signalMetadata{
				AcceptLanguage: sig.AcceptLanguage,
				ForwardedChain: sig.ForwardedChain,
				Referer:        sig.Referer,
				SecFetchSite:   sig.SecFetchSite,
				IsHTTPS:        sig.IsHTTPS,
			}
			var metaJSON []byte
			hasMetadata := meta.AcceptLanguage != "" || len(meta.ForwardedChain) > 0 ||
				meta.Referer != "" || meta.SecFetchSite != "" || meta.IsHTTPS
			if hasMetadata {
				metaJSON, err = json.Marshal(meta)
				if err != nil {
					return fmt.Errorf("signal store marshal metadata: %w", err)
				}
			}

			var ipVal any
			if sig.IP != "" {
				if parsed := net.ParseIP(sig.IP); parsed != nil {
					ipVal = parsed.String()
				}
			}

			ts := sig.Timestamp
			if ts.IsZero() {
				ts = time.Now().UTC()
			}
			stream := string(sig.Stream)
			if stream == "" {
				stream = string(StreamAuth)
			}

			base := i * cols
			placeholders = append(placeholders,
				fmt.Sprintf("($%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d::INET, $%d, $%d, $%d::JSONB)",
					base+1, base+2, base+3, base+4, base+5, base+6, base+7,
					base+8, base+9, base+10, base+11, base+12, base+13, base+14))
			args = append(args,
				sig.InstanceID, ts, sig.CallerID,
				nullIfEmpty(sig.UserID), nullIfEmpty(sig.SessionID), nullIfEmpty(sig.FingerprintID),
				stream, sig.Operation, nullIfEmpty(sig.Resource), string(sig.Outcome),
				ipVal, nullIfEmpty(sig.UserAgent), nullIfEmpty(sig.Country), nullableJSON(metaJSON))
		}

		query := `INSERT INTO signals.signals
			(instance_id, created_at, caller_id, user_id, session_id, fingerprint_id,
			 stream, operation, resource, outcome, ip, user_agent, country, metadata)
			VALUES ` + strings.Join(placeholders, ", ")
		if _, err = tx.ExecContext(ctx, query, args...); err != nil {
			return fmt.Errorf("signal store batch insert: %w", err)
		}
	}
	return tx.Commit()
}

// Snapshot returns the recent signals for the user and session identified by
// the given signal, within the configured history window. This satisfies the
// [Store] interface used by the risk engine.
func (s *PGStore) Snapshot(ctx context.Context, signal Signal) (Snapshot, error) {
	cutoff := signalCutoff(signal.Timestamp, s.cfg.HistoryWindow, s.cfg.ContextChangeWindow)
	var snapshot Snapshot

	if signal.UserID != "" {
		signals, err := s.querySignals(ctx,
			`SELECT instance_id, created_at, caller_id, user_id, session_id, fingerprint_id,
			        stream, operation, resource, outcome, ip, user_agent, country, metadata
			 FROM signals.signals
			 WHERE instance_id = $1 AND (caller_id = $2 OR user_id = $2) AND created_at > $3
			 ORDER BY created_at ASC
			 LIMIT $4`,
			signal.InstanceID, signal.UserID, cutoff, s.cfg.MaxSignalsPerUser,
		)
		if err != nil {
			return snapshot, fmt.Errorf("signal store user snapshot: %w", err)
		}
		snapshot.UserSignals = signals
	}

	if signal.SessionID != "" {
		signals, err := s.querySignals(ctx,
			`SELECT instance_id, created_at, caller_id, user_id, session_id, fingerprint_id,
			        stream, operation, resource, outcome, ip, user_agent, country, metadata
			 FROM signals.signals
			 WHERE instance_id = $1 AND session_id = $2 AND created_at > $3
			 ORDER BY created_at ASC
			 LIMIT $4`,
			signal.InstanceID, signal.SessionID, cutoff, s.cfg.MaxSignalsPerSession,
		)
		if err != nil {
			return snapshot, fmt.Errorf("signal store session snapshot: %w", err)
		}
		snapshot.SessionSignals = signals
	}

	return snapshot, nil
}

// signalMetadata holds the extensible fields stored in the JSONB metadata column.
type signalMetadata struct {
	AcceptLanguage string   `json:"accept_language,omitempty"`
	ForwardedChain []string `json:"forwarded_chain,omitempty"`
	Referer        string   `json:"referer,omitempty"`
	SecFetchSite   string   `json:"sec_fetch_site,omitempty"`
	IsHTTPS        bool     `json:"is_https,omitempty"`
	FindingNames   []string `json:"finding_names,omitempty"`
}

type queryExecutor interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func (s *PGStore) insertSignal(ctx context.Context, exec queryExecutor, signal Signal, findings []Finding) error {
	meta := signalMetadata{
		AcceptLanguage: signal.AcceptLanguage,
		ForwardedChain: signal.ForwardedChain,
		Referer:        signal.Referer,
		SecFetchSite:   signal.SecFetchSite,
		IsHTTPS:        signal.IsHTTPS,
	}
	if len(findings) > 0 {
		meta.FindingNames = make([]string, len(findings))
		for i, f := range findings {
			meta.FindingNames[i] = f.Name
		}
	}

	var metaJSON []byte
	var err error
	hasMetadata := meta.AcceptLanguage != "" || len(meta.ForwardedChain) > 0 ||
		meta.Referer != "" || meta.SecFetchSite != "" || meta.IsHTTPS || len(meta.FindingNames) > 0
	if hasMetadata {
		metaJSON, err = json.Marshal(meta)
		if err != nil {
			return fmt.Errorf("signal store marshal metadata: %w", err)
		}
	}

	// Convert IP string to a value the INET column accepts.
	var ipVal any
	if signal.IP != "" {
		if parsed := net.ParseIP(signal.IP); parsed != nil {
			ipVal = parsed.String()
		}
	}

	ts := signal.Timestamp
	if ts.IsZero() {
		ts = time.Now().UTC()
	}

	stream := string(signal.Stream)
	if stream == "" {
		stream = string(StreamAuth)
	}

	_, err = exec.ExecContext(ctx,
		`INSERT INTO signals.signals
		 (instance_id, created_at, caller_id, user_id, session_id, fingerprint_id,
		  stream, operation, resource, outcome, ip, user_agent, country, metadata)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::INET, $12, $13, $14::JSONB)`,
		signal.InstanceID,
		ts,
		signal.CallerID,
		nullIfEmpty(signal.UserID),
		nullIfEmpty(signal.SessionID),
		nullIfEmpty(signal.FingerprintID),
		stream,
		signal.Operation,
		nullIfEmpty(signal.Resource),
		string(signal.Outcome),
		ipVal,
		nullIfEmpty(signal.UserAgent),
		nullIfEmpty(signal.Country),
		nullableJSON(metaJSON),
	)
	return err
}

func (s *PGStore) querySignals(ctx context.Context, query string, args ...any) ([]RecordedSignal, error) {
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var signals []RecordedSignal
	for rows.Next() {
		var (
			rs        RecordedSignal
			createdAt time.Time
			callerID  string
			userID    sql.NullString
			sessionID sql.NullString
			fpID      sql.NullString
			stream    string
			operation string
			resource  sql.NullString
			outcome   string
			ip        sql.NullString
			userAgent sql.NullString
			country   sql.NullString
			metaJSON  sql.NullString
		)
		if err := rows.Scan(
			&rs.InstanceID, &createdAt, &callerID, &userID, &sessionID, &fpID,
			&stream, &operation, &resource, &outcome, &ip, &userAgent, &country, &metaJSON,
		); err != nil {
			return nil, fmt.Errorf("signal store scan: %w", err)
		}
		rs.Timestamp = createdAt
		rs.CallerID = callerID
		rs.UserID = userID.String
		rs.SessionID = sessionID.String
		rs.FingerprintID = fpID.String
		rs.Stream = SignalStream(stream)
		rs.Operation = operation
		rs.Resource = resource.String
		rs.Outcome = Outcome(outcome)
		rs.IP = ip.String
		rs.UserAgent = userAgent.String
		rs.Country = country.String

		if metaJSON.Valid && metaJSON.String != "" {
			var meta signalMetadata
			if err := json.Unmarshal([]byte(metaJSON.String), &meta); err == nil {
				rs.AcceptLanguage = meta.AcceptLanguage
				rs.ForwardedChain = meta.ForwardedChain
				rs.Referer = meta.Referer
				rs.SecFetchSite = meta.SecFetchSite
				rs.IsHTTPS = meta.IsHTTPS
			}
		}

		signals = append(signals, rs)
	}
	return signals, rows.Err()
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nullableJSON(b []byte) any {
	if len(b) == 0 || string(b) == "{}" {
		return nil
	}
	return string(b)
}
