//go:build integration

// Package integration provides helpers for integration testing.
// This file provides testcontainer-based Postgres and Redis startup.

package integration

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"
	"github.com/testcontainers/testcontainers-go/wait"
	"github.com/zitadel/logging"
)

const (
	testcontainersEnvVar = "INTEGRATION_TESTCONTAINERS"
	postgresImage        = "postgres:16-alpine"
	redisImage           = "redis:8-alpine"
	postgresDB           = "zitadel"
	postgresUser         = "zitadel"
	postgresPassword     = "zitadel"
)

// UseTestcontainers returns true if the INTEGRATION_TESTCONTAINERS environment
// variable is set to "true". When enabled, integration tests start their own
// Postgres and Redis containers via testcontainers-go instead of relying on
// externally managed docker-compose services.
func UseTestcontainers() bool {
	return os.Getenv(testcontainersEnvVar) == "true"
}

// PostgresContainer wraps a started Postgres testcontainer and
// provides convenience methods for integration tests.
type PostgresContainer struct {
	Container testcontainers.Container
	Host      string
	Port      string
	ConnStr   string
}

// StartPostgres starts a PostgreSQL container using testcontainers-go.
// The returned cleanup function must be called (typically via t.Cleanup)
// to stop and remove the container.
func StartPostgres(ctx context.Context) (*PostgresContainer, func()) {
	logging.Info("Starting Postgres testcontainer...")

	container, err := tcpostgres.Run(ctx,
		postgresImage,
		tcpostgres.WithDatabase(postgresDB),
		tcpostgres.WithUsername(postgresUser),
		tcpostgres.WithPassword(postgresPassword),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60*time.Second),
		),
	)
	if err != nil {
		panic(fmt.Sprintf("failed to start postgres testcontainer: %v", err))
	}

	host, err := container.Host(ctx)
	if err != nil {
		panic(fmt.Sprintf("failed to get postgres host: %v", err))
	}
	mappedPort, err := container.MappedPort(ctx, "5432")
	if err != nil {
		panic(fmt.Sprintf("failed to get postgres port: %v", err))
	}

	connStr := fmt.Sprintf("postgresql://%s:%s@%s:%s/%s?sslmode=disable",
		postgresUser, postgresPassword, host, mappedPort.Port(), postgresDB)

	logging.WithFields("host", host, "port", mappedPort.Port()).
		Info("Postgres testcontainer started")

	return &PostgresContainer{
			Container: container,
			Host:      host,
			Port:      mappedPort.Port(),
			ConnStr:   connStr,
		}, func() {
			logging.Info("Stopping Postgres testcontainer...")
			if err := container.Terminate(ctx); err != nil {
				logging.WithError(err).Warn("failed to stop postgres testcontainer")
			}
		}
}

// RedisContainer wraps a started Redis testcontainer and
// provides convenience methods for integration tests.
type RedisContainer struct {
	Container testcontainers.Container
	Host      string
	Port      string
	Addr      string
}

// StartRedis starts a Redis container using testcontainers-go.
// The returned cleanup function must be called (typically via t.Cleanup)
// to stop and remove the container.
func StartRedis(ctx context.Context) (*RedisContainer, func()) {
	logging.Info("Starting Redis testcontainer...")

	container, err := tcredis.Run(ctx,
		redisImage,
		testcontainers.WithWaitStrategy(
			wait.ForLog("Ready to accept connections").
				WithStartupTimeout(30*time.Second),
		),
	)
	if err != nil {
		panic(fmt.Sprintf("failed to start redis testcontainer: %v", err))
	}

	host, err := container.Host(ctx)
	if err != nil {
		panic(fmt.Sprintf("failed to get redis host: %v", err))
	}
	mappedPort, err := container.MappedPort(ctx, "6379")
	if err != nil {
		panic(fmt.Sprintf("failed to get redis port: %v", err))
	}

	addr := fmt.Sprintf("%s:%s", host, mappedPort.Port())

	logging.WithFields("host", host, "port", mappedPort.Port()).
		Info("Redis testcontainer started")

	return &RedisContainer{
			Container: container,
			Host:      host,
			Port:      mappedPort.Port(),
			Addr:      addr,
		}, func() {
			logging.Info("Stopping Redis testcontainer...")
			if err := container.Terminate(ctx); err != nil {
				logging.WithError(err).Warn("failed to stop redis testcontainer")
			}
		}
}
