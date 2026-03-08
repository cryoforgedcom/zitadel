package risk

import (
	"bytes"
	"fmt"
	"time"

	"github.com/parquet-go/parquet-go"
	"github.com/parquet-go/parquet-go/compress/zstd"
)

// parquetSignal is the Parquet schema for a signal row.
// Field tags map to Parquet column names with optional encoding hints.
type parquetSignal struct {
	InstanceID    string `parquet:"instance_id,zstd"`
	CreatedAt     int64  `parquet:"created_at,delta"` // Unix microseconds
	CallerID      string `parquet:"caller_id,zstd"`
	UserID        string `parquet:"user_id,zstd,optional"`
	SessionID     string `parquet:"session_id,zstd,optional"`
	FingerprintID string `parquet:"fingerprint_id,zstd,optional"`
	Stream        string `parquet:"stream,zstd"`
	Operation     string `parquet:"operation,zstd"`
	Resource      string `parquet:"resource,zstd,optional"`
	Outcome       string `parquet:"outcome,zstd"`
	IP            string `parquet:"ip,zstd,optional"`
	UserAgent     string `parquet:"user_agent,zstd,optional"`
	Country       string `parquet:"country,zstd,optional"`
}

func signalToParquet(sig Signal) parquetSignal {
	return parquetSignal{
		InstanceID:    sig.InstanceID,
		CreatedAt:     sig.Timestamp.UnixMicro(),
		CallerID:      sig.CallerID,
		UserID:        sig.UserID,
		SessionID:     sig.SessionID,
		FingerprintID: sig.FingerprintID,
		Stream:        string(sig.Stream),
		Operation:     sig.Operation,
		Resource:      sig.Resource,
		Outcome:       string(sig.Outcome),
		IP:            sig.IP,
		UserAgent:     sig.UserAgent,
		Country:       sig.Country,
	}
}

// WriteParquet serializes signals to a Parquet file in memory and returns
// the bytes. Uses ZSTD compression for good compression ratio on text-heavy
// data.
func WriteParquet(signals []Signal) ([]byte, error) {
	if len(signals) == 0 {
		return nil, fmt.Errorf("no signals to write")
	}

	rows := make([]parquetSignal, len(signals))
	for i, sig := range signals {
		rows[i] = signalToParquet(sig)
	}

	var buf bytes.Buffer
	w := parquet.NewGenericWriter[parquetSignal](&buf,
		parquet.Compression(&zstd.Codec{Level: zstd.DefaultLevel}),
		parquet.CreatedBy("zitadel", "risk", "signal-archiver"),
	)

	if _, err := w.Write(rows); err != nil {
		return nil, fmt.Errorf("write parquet rows: %w", err)
	}
	if err := w.Close(); err != nil {
		return nil, fmt.Errorf("close parquet writer: %w", err)
	}

	return buf.Bytes(), nil
}

// ArchivePath builds the storage key for a Parquet archive file.
// Format: signals/<instance_id>/year=YYYY/month=MM/day=DD/hour=HH.parquet
func ArchivePath(instanceID string, t time.Time) string {
	return fmt.Sprintf("signals/%s/year=%04d/month=%02d/day=%02d/hour=%02d.parquet",
		instanceID,
		t.Year(), t.Month(), t.Day(), t.Hour(),
	)
}
