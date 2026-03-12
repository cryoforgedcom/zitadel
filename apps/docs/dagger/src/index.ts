import { dag, Container, Directory, object, func } from "@dagger.io/dagger"

@object()
export class Docs {
  /**
   * Build the docs Next.js application
   */
  @func()
  async build(
    /** The root of the ZITADEL monorepo to get protos and scripts */
    source: Directory
  ): Promise<Directory> {
    // Infer Node version from .nvmrc
    const nvmrc = await source.file(".nvmrc").contents();
    const nodeVersion = nvmrc.trim() || "22";

    // We use a debian-based node image because the proto install script uses bash, curl, and tar
    let builder = dag.container()
      .from(`node:${nodeVersion}-bookworm`)
      .withExec(["npm", "install", "-g", "pnpm", "turbo"])
      
    // Mount the monorepo root
    builder = builder
      .withDirectory("/src", source)
      .withWorkdir("/src")
      
    // Install dependencies (use workspace root to resolve workspace protocols)
    builder = builder
      .withEnvVariable("CI", "true")
      .withExec(["pnpm", "install", "--filter", "@zitadel/docs..."])

    // Execute the build steps using Turborepo (replacing hardcoded sequential steps)
    builder = builder
      // 1. Install proto plugins (downloads to /src/.artifacts/bin/linux/amd64)
      .withExec(["bash", "./apps/docs/scripts/install-proto-plugins.sh"])
      
      // 2. Build Next.js application using turbo from the monorepo root
      // Requires the downloaded binary in PATH for the generate steps turbo will run
      .withEnvVariable("PATH", "/src/.artifacts/bin/linux/amd64:$PATH", { expand: true })
      // Notice we are in /src (the workspace root) when running turbo
      .withExec(["turbo", "run", "build", "--filter=@zitadel/docs"])

    // Export the built .next directory
    return builder.directory("/src/apps/docs/.next")
  }
}
