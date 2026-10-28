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

test("installs the checked-in deployment script over SSM before invoking it", () => {
  assert.match(
    workflow,
    /deploy_script_payload=\$\(base64 -w0 infrastructure\/scripts\/liveorder-deploy\.sh\)/,
  );
  assert.match(
    workflow,
    /install_command=.*mktemp \/usr\/local\/sbin\/\.liveorder-deploy\.XXXXXX.*base64 -d.*chmod 0750.*mv -f.*\/usr\/local\/sbin\/liveorder-deploy/,
  );
  assert.match(
    workflow,
    /test .*\/run\/liveorder-deploy-ready.*install -d -m 0755 \/opt\/liveorder.*\/usr\/local\/sbin\/liveorder-deploy '\$GITHUB_SHA'/,
  );
  assert.match(workflow, /\{commands: \[\$installer, \$command\]\}/);
});
