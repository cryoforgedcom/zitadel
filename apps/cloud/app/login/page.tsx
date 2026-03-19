import Link from "next/link"

/**
 * Login page — placeholder for the ZITADEL login flow.
 * Will be connected to the auth instance for OIDC login.
 */
export default function LoginPage() {
  const authUrl = process.env.ZITADEL_AUTH_URL

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-sm w-full space-y-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground text-background text-lg font-bold mx-auto">
          Z
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sign in to ZITADEL</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Sign in with your ZITADEL account
          </p>
        </div>

        {authUrl ? (
          <div className="space-y-3">
            <a
              href={`${authUrl}/oauth/v2/authorize`}
              className="block w-full rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Continue with ZITADEL
            </a>
            <p className="text-xs text-muted-foreground">
              Auth instance: <code className="bg-muted px-1 py-0.5 rounded">{new URL(authUrl).hostname}</code>
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4">
            <p className="text-sm text-muted-foreground mb-3">
              No auth instance configured. Set up the ZITADEL auth URL in the debug settings.
            </p>
            <Link
              href="/debug"
              className="text-sm text-primary hover:underline"
            >
              Open Debug Settings →
            </Link>
          </div>
        )}

        <Link href="/" className="block text-sm text-muted-foreground hover:text-foreground">
          ← Back to Cloud Home
        </Link>
      </div>
    </div>
  )
}
