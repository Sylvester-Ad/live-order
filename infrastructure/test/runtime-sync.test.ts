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

test("writes SMTP settings as safely escaped Compose dotenv values", () => {
  const jqProgram = runtimeSyncScript.match(/jq -er '([\s\S]*?)'\s*>> "\$temporary_file"/)?.[1];
  assert.ok(jqProgram, "runtime sync script must contain its jq transformation");

  const output = execFileSync("jq", ["-r", jqProgram], {
    input: JSON.stringify({
      CLOUDINARY_CLOUD_NAME: "cloud$name",
      CLOUDINARY_API_KEY: "api$key",
      CLOUDINARY_API_SECRET: "secret$key",
      SMTP_HOST: "smtp.resend.com",
      SMTP_PORT: "465",
      SMTP_USERNAME: "resend",
      SMTP_PASSWORD: "smtp$secret",
      SMTP_SECURE: "true",
      SMTP_REQUIRE_TLS: "true",
      SMTP_FROM: "LiveOrder <accounts@mail.liveorder.site>",
      PUBLIC_APP_URL: "https://liveorder.site",
    }),
    encoding: "utf8",
  });

  assert.match(output, /CLOUDINARY_CLOUD_NAME="cloud\$\$name"/);
  assert.match(output, /CLOUDINARY_API_KEY="api\$\$key"/);
  assert.match(output, /CLOUDINARY_API_SECRET="secret\$\$key"/);
  assert.match(output, /SMTP_USERNAME="resend"/);
  assert.match(output, /SMTP_PASSWORD="smtp\$\$secret"/);
  assert.match(output, /SMTP_HOST="smtp.resend.com"/);
  assert.match(output, /SMTP_PORT="465"/);
  assert.match(output, /SMTP_SECURE="true"/);
  assert.match(output, /SMTP_FROM="LiveOrder <accounts@mail.liveorder.site>"/);
  assert.match(output, /PUBLIC_APP_URL="https:\/\/liveorder.site"/);
});

test("rejects runtime secrets without the required production SMTP configuration", () => {
  const jqProgram = runtimeSyncScript.match(/jq -er '([\s\S]*?)'\s*>> "\$temporary_file"/)?.[1];
  assert.ok(jqProgram);
  assert.throws(() => execFileSync("jq", ["-r", jqProgram], {
    input: JSON.stringify({
      CLOUDINARY_CLOUD_NAME: "cloud",
      CLOUDINARY_API_KEY: "api",
      CLOUDINARY_API_SECRET: "secret",
    }),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  }));
});
