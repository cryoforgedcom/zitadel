package main

import (
	"context"
	"fmt"
)

type Ci struct{}

// BuildAll orchestrates the build process for all components in the monorepo
func (m *Ci) BuildAll(ctx context.Context, source *Directory) (*Directory, error) {
	fmt.Println("Starting central CI orchestration...")

	// 1. Build the Docs App
	// We call the TypeScript module for the docs app directly from Go!
	// Note: in a real setup, we would run `dagger install ../apps/docs/dagger`
	// which generates the Go bindings for the Docs module.
	// For this POC, since the install was hanging, we simulate the concept:
	// docsDir := dag.Docs().Build(source)

	// Since we couldn't run `dagger install`, we will fall back to invoking 
	// the component's dagger CLI from the host container just for the POC demonstration.
	// In production Dagger, `dag.Docs().Build(source)` is the correct cross-module approach.
	
	fmt.Println("Building Docs App (TypeScript Module)...")
	docsBuild := dag.Container().From("alpine:latest").
		WithFile("/usr/local/bin/dagger", dag.Host().File("/home/ffo/.local/bin/dagger")).
		WithDirectory("/src", source).
		WithWorkdir("/src").
		WithExec([]string{"dagger", "call", "-m", "apps/docs/dagger", "build", "--source", ".", "export", "--path", "./built-docs"})

	// Force the execution and get the exported directory
	_, err := docsBuild.Sync(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to build docs: %w", err)
	}

	return docsBuild.Directory("/src/built-docs"), nil
}
