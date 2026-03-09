package signals

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/minio/minio-go/v7"
)

// ArchiveStorage writes Parquet files to a durable backend.
type ArchiveStorage interface {
	// Write stores the data at the given path (relative key).
	Write(ctx context.Context, path string, data io.Reader, size int64) error
}

// FSArchiveStorage writes archive files to the local filesystem.
type FSArchiveStorage struct {
	basePath string
}

// NewFSArchiveStorage creates a filesystem archive backend.
func NewFSArchiveStorage(basePath string) *FSArchiveStorage {
	return &FSArchiveStorage{basePath: basePath}
}

func (s *FSArchiveStorage) Write(_ context.Context, path string, data io.Reader, _ int64) error {
	fullPath := filepath.Join(s.basePath, path)
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o750); err != nil {
		return fmt.Errorf("mkdir %s: %w", filepath.Dir(fullPath), err)
	}
	f, err := os.Create(fullPath)
	if err != nil {
		return fmt.Errorf("create %s: %w", fullPath, err)
	}
	defer f.Close()
	if _, err := io.Copy(f, data); err != nil {
		return fmt.Errorf("write %s: %w", fullPath, err)
	}
	return f.Sync()
}

// S3ArchiveStorage writes archive files to an S3-compatible bucket.
type S3ArchiveStorage struct {
	client *minio.Client
	bucket string
}

// NewS3ArchiveStorage creates an S3 archive backend using the given minio client.
func NewS3ArchiveStorage(client *minio.Client, bucket string) *S3ArchiveStorage {
	return &S3ArchiveStorage{client: client, bucket: bucket}
}

func (s *S3ArchiveStorage) Write(ctx context.Context, path string, data io.Reader, size int64) error {
	// If size is unknown, buffer into memory.
	if size <= 0 {
		buf, err := io.ReadAll(data)
		if err != nil {
			return fmt.Errorf("read data for S3: %w", err)
		}
		size = int64(len(buf))
		data = bytes.NewReader(buf)
	}
	_, err := s.client.PutObject(ctx, s.bucket, path, data, size, minio.PutObjectOptions{
		ContentType: "application/vnd.apache.parquet",
	})
	if err != nil {
		return fmt.Errorf("s3 put %s/%s: %w", s.bucket, path, err)
	}
	return nil
}
