package signals

import (
	"bytes"
	"fmt"
	"io"
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

const parquetWriteBatchSize = 1024

type parquetStreamWriter struct {
	w     *parquet.GenericWriter[parquetSignal]
	batch []parquetSignal
}

func newParquetStreamWriter(dst io.Writer) *parquetStreamWriter {
	return &parquetStreamWriter{
		w: parquet.NewGenericWriter[parquetSignal](dst,
			parquet.Compression(&zstd.Codec{Level: zstd.DefaultLevel}),
			parquet.CreatedBy("zitadel", "risk", "signal-archiver"),
		),
		batch: make([]parquetSignal, 0, parquetWriteBatchSize),
	}
}

func (w *parquetStreamWriter) WriteSignal(sig Signal) error {
	w.batch = append(w.batch, signalToParquet(sig))
	if len(w.batch) < parquetWriteBatchSize {
		return nil
	}
	return w.flush()
}

func (w *parquetStreamWriter) Close() error {
	if err := w.flush(); err != nil {
		return err
	}
	if err := w.w.Close(); err != nil {
		return fmt.Errorf("close parquet writer: %w", err)
	}
	return nil
}

func (w *parquetStreamWriter) flush() error {
	if len(w.batch) == 0 {
		return nil
	}
	if _, err := w.w.Write(w.batch); err != nil {
		return fmt.Errorf("write parquet rows: %w", err)
	}
	w.batch = w.batch[:0]
	return nil
}

// WriteParquet serializes signals to a Parquet file in memory and returns
// the bytes. Uses ZSTD compression for good compression ratio on text-heavy
// data.
func WriteParquet(signals []Signal) ([]byte, error) {
	if len(signals) == 0 {
		return nil, fmt.Errorf("no signals to write")
	}

	var buf bytes.Buffer
	w := newParquetStreamWriter(&buf)
	for _, sig := range signals {
		if err := w.WriteSignal(sig); err != nil {
			return nil, err
		}
	}
	if err := w.Close(); err != nil {
		return nil, err
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
