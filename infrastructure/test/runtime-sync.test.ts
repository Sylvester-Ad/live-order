import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const infrastructureDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeSyncScript = await readFile(
  path.join(infrastructureDirectory, "scripts/liveorder-sync-runtime-env.sh"),
  "utf8",
);

test("escapes dollar signs in runtime credentials for Compose dotenv values", () => {
  const jqProgram = runtimeSyncScript.match(/jq -er '([\s\S]*?)'\s*>> "\$temporary_file"/)?.[1];
  assert.ok(jqProgram, "runtime sync script must contain its jq transformation");

  const output = execFileSync("jq", ["-r", jqProgram], {
    input: JSON.stringify({
      CLOUDINARY_CLOUD_NAME: "cloud$name",
      CLOUDINARY_API_KEY: "api$key",
      CLOUDINARY_API_SECRET: "secret$key",
    }),
    encoding: "utf8",
  });

  assert.match(output, /CLOUDINARY_CLOUD_NAME="cloud\$\$name"/);
  assert.match(output, /CLOUDINARY_API_KEY="api\$\$key"/);
  assert.match(output, /CLOUDINARY_API_SECRET="secret\$\$key"/);
});
