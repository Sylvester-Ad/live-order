import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadEnv } from "vite";

const clientRoot = fileURLToPath(new URL("..", import.meta.url));
const env = loadEnv("development", clientRoot, "");
const target = (process.env.API_PROXY_TARGET ?? env.API_PROXY_TARGET ?? "http://localhost:3000").trim();

let schemaUrl;
try {
  const targetUrl = new URL(target);
  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    throw new Error("API_PROXY_TARGET must use http or https");
  }
  schemaUrl = new URL("/api-docs.json", targetUrl).href;
} catch (error) {
  console.error(error instanceof Error ? error.message : "API_PROXY_TARGET is invalid");
  process.exit(1);
}

const openapiCli = fileURLToPath(new URL("../node_modules/openapi-typescript/bin/cli.js", import.meta.url));
const result = spawnSync(
  process.execPath,
  [openapiCli, schemaUrl, "-o", "src/types/openapi.generated.ts"],
  { cwd: clientRoot, stdio: "inherit" },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exitCode = result.status ?? 1;
