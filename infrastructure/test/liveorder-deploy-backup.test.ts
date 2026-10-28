import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../..");
const deployScript = await readFile(path.join(repositoryRoot, "infrastructure/scripts/liveorder-deploy.sh"), "utf8");
const backupScript = await readFile(path.join(repositoryRoot, "infrastructure/scripts/liveorder-backup.sh"), "utf8");
const composeConfiguration = await readFile(path.join(repositoryRoot, "compose.yaml"), "utf8");

type Scenario = {
  backendRunning: boolean;
  databaseExists: boolean;
  backupUploadFails?: boolean;
};

async function runDeployment(scenario: Scenario) {
  const root = await mkdtemp(path.join(os.tmpdir(), "liveorder-deploy-backup-"));
  const paths = {
    bin: path.join(root, "bin"),
    liveorder: path.join(root, "opt/liveorder"),
    config: path.join(root, "etc/liveorder"),
    lock: path.join(root, "run/lock"),
    volume: path.join(root, "docker-volume"),
    scripts: path.join(root, "usr/local/sbin"),
  };
  await Promise.all(Object.values(paths).map((directory) => mkdir(directory, { recursive: true })));
  await mkdir(path.join(paths.volume, "backups"), { recursive: true });

  if (scenario.databaseExists) {
    await writeFile(path.join(paths.volume, "liveorder.db"), "existing database");
  }
  await writeFile(path.join(paths.liveorder, "compose.yaml"), composeConfiguration);
  await writeFile(
    path.join(paths.liveorder, ".env"),
    "EXISTING_CONFIGURATION=value\nLIVEORDER_DATABASE_PATH=/tmp/wrong.sqlite\n",
  );
  await writeFile(path.join(paths.config, "compose.env"), [
    "AWS_REGION=us-east-1",
    "LIVEORDER_BACKUP_BUCKET=backup-bucket",
    "LIVEORDER_BACKUP_PREFIX=liveorder/backups/sqlite",
    "LIVEORDER_BACKEND_REPOSITORY=111122223333.dkr.ecr.us-east-1.amazonaws.com/liveorder/backend",
    "LIVEORDER_CADDY_REPOSITORY=111122223333.dkr.ecr.us-east-1.amazonaws.com/liveorder/caddy",
  ].join("\n"));

  const replacePaths = (script: string) => script
    .replaceAll("/opt/liveorder", paths.liveorder)
    .replaceAll("/etc/liveorder", paths.config)
    .replaceAll("/run/lock", paths.lock);
  const backupScriptPath = path.join(root, "liveorder-backup");
  const deployScriptPath = path.join(root, "liveorder-deploy");
  const syncScriptPath = path.join(paths.scripts, "liveorder-sync-runtime-env");
  const logPath = path.join(root, "commands.log");
  const containerMarker = path.join(root, "backup-container");

  await writeFile(backupScriptPath, replacePaths(backupScript), { mode: 0o700 });
  await writeFile(
    deployScriptPath,
    replacePaths(deployScript)
      .replace("/usr/local/sbin/liveorder-sync-runtime-env", syncScriptPath)
      .replace("/usr/local/sbin/liveorder-backup", backupScriptPath),
    { mode: 0o700 },
  );
  await writeFile(syncScriptPath, "#!/usr/bin/env bash\nset -euo pipefail\n", { mode: 0o700 });

  await writeFile(path.join(paths.bin, "docker"), `#!/usr/bin/env bash
set -euo pipefail
printf 'docker %s\\n' "$*" >> "$TEST_COMMAND_LOG"
if [[ "$1" == login ]]; then
  cat >/dev/null
elif [[ "$*" == *"ps -q backend"* ]]; then
  if [[ "$TEST_BACKEND_RUNNING" == 1 ]] || grep -q 'migrate-deploy.js' "$TEST_COMMAND_LOG"; then
    printf 'existing-backend\\n'
  fi
elif [[ "$*" == *"ps -q caddy"* ]]; then
  printf 'existing-caddy\\n'
elif [[ "$*" == *"database-present"* || "$*" == *"database-absent"* ]]; then
  grep -q 'LIVEORDER_DATABASE_PATH: /var/lib/liveorder/liveorder.db' "$TEST_COMPOSE_FILE"
  grep -q 'liveorder-data:/var/lib/liveorder' "$TEST_COMPOSE_FILE"
  if [[ -f "$TEST_VOLUME/liveorder.db" ]]; then printf 'database-present'; else printf 'database-absent'; fi
elif [[ "$*" == *"backup-sqlite.js"* ]]; then
  destination=""
  container_name=""
  previous=""
  for argument in "$@"; do
    if [[ "$previous" == "--destination" ]]; then destination=$argument; fi
    if [[ "$previous" == "--name" ]]; then container_name=$argument; fi
    previous=$argument
  done
  [[ -n "$destination" && -n "$container_name" ]]
  mkdir -p "$TEST_VOLUME/backups"
  printf 'verified sqlite backup' > "$TEST_VOLUME/backups/\${destination##*/}"
  printf '%s' "$container_name" > "$TEST_CONTAINER_MARKER"
elif [[ "$*" == *"finalize-sqlite-backup-upload.js"* ]]; then
  backup=""
  previous=""
  for argument in "$@"; do
    if [[ "$previous" == "--backup" ]]; then backup=$argument; fi
    previous=$argument
  done
  [[ -f "$TEST_VOLUME/backups/\${backup##*/}" ]]
elif [[ "$*" == *" run --name "* ]]; then
  previous=""
  for argument in "$@"; do
    if [[ "$previous" == "--name" ]]; then printf '%s' "$argument" > "$TEST_CONTAINER_MARKER"; fi
    previous=$argument
  done
elif [[ "$*" == "container inspect"* ]]; then
  [[ -f "$TEST_CONTAINER_MARKER" ]]
elif [[ "$*" == "rm "* ]]; then
  rm -f "$TEST_CONTAINER_MARKER"
elif [[ "$*" == *"State.Health.Status"* ]]; then
  printf 'healthy\\n'
elif [[ "$*" == "inspect --format"* ]]; then
  printf '%s\\n' "$TEST_VOLUME"
elif [[ "$*" == *"stop caddy backend"* ]]; then
  printf 'services-stopped\\n' >> "$TEST_COMMAND_LOG"
fi
`);
  await writeFile(path.join(paths.bin, "aws"), `#!/usr/bin/env bash
set -euo pipefail
printf 'aws %s\\n' "$*" >> "$TEST_COMMAND_LOG"
if [[ "$*" == *"get-login-password"* ]]; then
  printf 'test-token'
elif [[ "$*" == *"s3 cp"* && "$TEST_BACKUP_UPLOAD_FAILS" == 1 ]]; then
  exit 1
fi
`);
  await writeFile(path.join(paths.bin, "chown"), "#!/usr/bin/env bash\nexit 0\n");
  await Promise.all(["docker", "aws", "chown"].map(async (name) => {
    await chmod(path.join(paths.bin, name), 0o700);
  }));

  const result = spawnSync("bash", [deployScriptPath, "a".repeat(40)], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${paths.bin}:${process.env.PATH ?? ""}`,
      TEST_BACKEND_RUNNING: scenario.backendRunning ? "1" : "0",
      TEST_BACKUP_UPLOAD_FAILS: scenario.backupUploadFails ? "1" : "0",
      TEST_COMMAND_LOG: logPath,
      TEST_COMPOSE_FILE: path.join(paths.liveorder, "compose.yaml"),
      TEST_CONTAINER_MARKER: containerMarker,
      TEST_VOLUME: paths.volume,
    },
  });
  const log = await readFile(logPath, "utf8").catch(() => "");
  return { databasePath: path.join(paths.volume, "liveorder.db"), root, log, result };
}

for (const backendRunning of [true, false]) {
  test(`backs up an existing database before migrations when backend is ${backendRunning ? "running" : "stopped"}`, async () => {
    const { root, log, result } = await runDeployment({ backendRunning, databaseExists: true });
    try {
      assert.equal(result.status, 0, result.stderr);
      assert.ok(log.includes("backup-sqlite.js"), log);
      const commands = log.split("\n");
      const validationIndex = commands.findIndex(
        (command) => command.includes("finalize-sqlite-backup-upload.js") && command.includes("--validate-only"),
      );
      const uploadIndex = commands.findIndex((command) => command.includes("aws s3 cp"));
      const uploadedMarkerIndex = commands.findIndex(
        (command) => command.includes("finalize-sqlite-backup-upload.js") && !command.includes("--validate-only"),
      );
      const migrationIndex = commands.findIndex((command) => command.includes("migrate-deploy.js"));
      assert.ok(validationIndex >= 0 && validationIndex < uploadIndex, log);
      assert.ok(uploadIndex < uploadedMarkerIndex && uploadedMarkerIndex < migrationIndex, log);
      assert.equal(log.includes("stop caddy backend"), backendRunning);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("allows a fresh installation to migrate without manufacturing a backup", async () => {
  const { databasePath, root, log, result } = await runDeployment({
    backendRunning: false,
    databaseExists: false,
  });
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes("No existing LiveOrder database found; skipping backup."));
    assert.ok(log.includes("migrate-deploy.js"), log);
    assert.ok(!log.includes("backup-sqlite.js"), log);
    assert.ok(!log.includes("aws s3 cp"), log);
    await assert.rejects(readFile(databasePath), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("aborts before migrations if backup upload fails", async () => {
  const { root, log, result } = await runDeployment({
    backendRunning: false,
    databaseExists: true,
    backupUploadFails: true,
  });
  try {
    assert.notEqual(result.status, 0);
    assert.ok(log.includes("aws s3 cp"), `${result.stdout}\n${result.stderr}\n${log}`);
    assert.ok(!log.includes("migrate-deploy.js"), `${result.stdout}\n${result.stderr}\n${log}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
