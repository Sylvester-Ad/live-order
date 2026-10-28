import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const infrastructureDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = await readFile(
  path.join(infrastructureDirectory, "../.github/workflows/production.yml"),
  "utf8",
);

test("installs host runtime configuration and deployment helpers over SSM before invoking them", () => {
  assert.match(workflow, /LIVEORDER_BACKUP_BUCKET: \$\{\{ vars\.LIVEORDER_BACKUP_BUCKET \}\}/);
  assert.match(workflow, /LIVEORDER_SITE_ADDRESS: \$\{\{ vars\.LIVEORDER_SITE_ADDRESS \}\}/);
  assert.match(workflow, /LIVEORDER_RUNTIME_SECRET_NAME: \$\{\{ vars\.LIVEORDER_RUNTIME_SECRET_NAME \}\}/);
  assert.match(workflow, /Set LIVEORDER_BACKUP_BUCKET from the CDK BackupBucketName output/);
  assert.match(workflow, /Set LIVEORDER_SITE_ADDRESS to the configured site address/);
  assert.match(workflow, /Set LIVEORDER_RUNTIME_SECRET_NAME to the configured Secrets Manager secret name/);
  assert.match(
    workflow,
    /cp infrastructure\/scripts\/liveorder-deploy\.sh "\$host_files\/liveorder-deploy"/,
  );
  assert.match(
    workflow,
    /cp infrastructure\/scripts\/liveorder-backup\.sh "\$host_files\/liveorder-backup"/,
  );
  assert.match(
    workflow,
    /cp infrastructure\/scripts\/liveorder-sync-runtime-env\.sh "\$host_files\/liveorder-sync-runtime-env"/,
  );
  assert.match(workflow, /LIVEORDER_BACKUP_BUCKET=%s/);
  assert.match(workflow, /LIVEORDER_BACKUP_PREFIX=liveorder\/backups\/sqlite/);
  assert.match(workflow, /LIVEORDER_BACKEND_REPOSITORY=%s\/liveorder\/backend/);
  assert.match(workflow, /LIVEORDER_CADDY_REPOSITORY=%s\/liveorder\/caddy/);
  assert.match(workflow, /LIVEORDER_RUNTIME_SECRET_NAME=%s/);
  assert.match(workflow, /install -m 0640.*\/etc\/liveorder\/compose\.env/);
  assert.match(workflow, /install -m 0640.*\/etc\/liveorder\/runtime-config/);
  assert.match(workflow, /test .*\/run\/liveorder-deploy-ready.*\/usr\/local\/sbin\/liveorder-deploy '\$GITHUB_SHA'/);
  assert.match(workflow, /\{commands: \[\$installer, \$command\]\}/);
});
