import {
  ConnectTransportOptions,
  createConnectTransport,
} from "@connectrpc/connect-node";
import {
  createRemoteJWKSet,
  importPKCS8,
  jwtVerify,
  JWTPayload,
  SignJWT,
} from "jose";
import { NewAuthorizationBearerInterceptor } from "./interceptors.js";

/**
 * Create a server transport using grpc with the given token and configuration options.
 * @param token
 * @param opts
 */
export function createServerTransport(
  token: string,
  opts: Omit<
    Extract<ConnectTransportOptions, { httpVersion: "1.1" }>,
    "httpVersion"
  >,
) {
  return createConnectTransport({
    ...opts,
    // for the moment we force http 1.1 for the server transport, as we have observed memory leaks with http2.
    httpVersion: "1.1",
    interceptors: [
      ...(opts.interceptors || []),
      NewAuthorizationBearerInterceptor(token),
    ],
  });
}

export async function newSystemToken({
  audience,
  subject,
  key,
  expirationTime,
}: {
  audience: string;
  subject: string;
  key: string;
  expirationTime?: number | string | Date;
}) {
  return await new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime(expirationTime ?? "1h")
    .setIssuer(subject)
    .setSubject(subject)
    .setAudience(audience)
    .sign(await importPKCS8(key, "RS256"));
}

/**
 * Verify a signed JWT with the given keys endpoint.
 * @param token
 * @param keysEndpoint
 * @param options
 */
export async function verifyJwt<T = JWTPayload>(
  token: string,
  keysEndpoint: string,
  options?: {
    issuer?: string;
    audience?: string;
    instanceHost?: string;
    publicHost?: string;
  },
): Promise<T & JWTPayload> {
  const headers: Record<string, string> = {};
  if (options?.instanceHost) {
    headers["x-zitadel-instance-host"] = options.instanceHost;
  }
  if (options?.publicHost) {
    headers["x-zitadel-public-host"] = options.publicHost;
  }
  const JWKS = createRemoteJWKSet(new URL(keysEndpoint), { headers: headers });

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: options?.issuer,
    audience: options?.audience,
  });

  return payload as T & JWTPayload;
}
