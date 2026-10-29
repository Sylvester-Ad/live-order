import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const infrastructureDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const caddyfile = await readFile(path.join(infrastructureDirectory, "../Caddyfile"), "utf8");

test("redirects both www schemes to the canonical HTTPS hostname", () => {
  assert.match(caddyfile, /http:\/\/www\.liveorder\.site\s*\{\s*redir https:\/\/liveorder\.site\{uri\} permanent\s*\}/);
  assert.match(caddyfile, /https:\/\/www\.liveorder\.site\s*\{\s*redir https:\/\/liveorder\.site\{uri\} permanent\s*\}/);
});

test("serves the primary hostname using the configured Caddy site address", () => {
  assert.match(caddyfile, /\{\$SITE_ADDRESS::80\}\s*\{/);
  assert.match(caddyfile, /reverse_proxy backend:3000/);
  assert.match(caddyfile, /try_files \{path\} \/index\.html/);
});
