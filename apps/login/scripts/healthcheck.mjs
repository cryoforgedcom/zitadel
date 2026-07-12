import { getFips } from "node:crypto";
import * as http from "node:http";
import * as https from "node:https";

if (process.env.ZITADEL_FIPS_REQUIRED === "true" && getFips() !== 1) {
  console.error("Healthcheck failed: FIPS mode required but not enabled");
  process.exit(1);
}

const scheme = process.env.ZITADEL_TLS_ENABLED === "true" ? "https" : "http";
const port = process.env.PORT || "3000";
let basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const healthPath = process.env.HEALTHCHECK_PATH || "/healthy";
const baseUrl = `${scheme}://localhost:${port}`;

// Normalize basePath: remove trailing slash if present (except keep root as empty)
if (basePath === "/") basePath = "";
const fullPath = basePath ? `${basePath}${healthPath}` : healthPath;
const url = new URL(fullPath, baseUrl);

const get = scheme === "https" ? https.get : http.get;

try {
  const res = await new Promise((resolve, reject) => {
    get(url, { rejectUnauthorized: false }, (res) => {
      res.resume();
      resolve(res);
    }).on("error", reject);
  });
  process.exit(res.statusCode >= 200 && res.statusCode < 400 ? 0 : 1);
} catch (e) {
  console.error("Healthcheck failed:", e);
  process.exit(1);
}
