import { createConnectTransport } from "@connectrpc/connect-node";
import { NewAuthorizationBearerInterceptor } from "@zitadel/client";

let _transport: ReturnType<typeof createConnectTransport> | null = null;

/**
 * Get or create the connectRPC transport for server-side API calls.
 * Uses ZITADEL_INSTANCE_URL and ZITADEL_PAT from environment variables.
 * 
 * We use the Connect protocol (not native gRPC) because ZITADEL's
 * API gateway serves both Connect and gRPC-Web over HTTPS, and the
 * Connect protocol handles HTTP/2 content-type negotiation more
 * reliably for self-hosted and cloud instances.
 */
export function getTransport() {
  if (_transport) {
    return _transport;
  }

  const baseUrl = process.env.ZITADEL_INSTANCE_URL;
  const pat = process.env.ZITADEL_PAT;

  if (!baseUrl) {
    throw new Error(
      "ZITADEL_INSTANCE_URL is not set. Please configure it in your .env file."
    );
  }

  if (!pat) {
    throw new Error(
      "ZITADEL_PAT is not set. Please configure it in your .env file."
    );
  }

  _transport = createConnectTransport({
    baseUrl,
    httpVersion: "2",
    interceptors: [
      NewAuthorizationBearerInterceptor(pat),
    ],
  });

  return _transport;
}
