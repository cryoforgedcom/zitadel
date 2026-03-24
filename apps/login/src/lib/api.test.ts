// @vitest-environment node
import { describe, expect, test } from "vitest";
import { newSystemToken } from "@zitadel/client/node";
import { execSync } from "child_process";

// Generate an RSA 2048 key pair in both formats using openssl
const pkcs1Key = execSync(
  "openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null | openssl rsa -traditional 2>/dev/null",
  { encoding: "utf-8" },
);

const pkcs8Key = execSync(
  "openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null",
  { encoding: "utf-8" },
);

describe("newSystemToken key format support", () => {
  test("should sign a JWT with a PKCS#8 key (BEGIN PRIVATE KEY)", async () => {
    expect(pkcs8Key).toContain("BEGIN PRIVATE KEY");

    const token = await newSystemToken({
      audience: "https://example.com",
      subject: "login-client",
      key: pkcs8Key,
    });

    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // valid JWT
  });

  test("should sign a JWT with a PKCS#1 key (BEGIN RSA PRIVATE KEY)", async () => {
    expect(pkcs1Key).toContain("BEGIN RSA PRIVATE KEY");

    const token = await newSystemToken({
      audience: "https://example.com",
      subject: "login-client",
      key: pkcs1Key,
    });

    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // valid JWT
  });
});
