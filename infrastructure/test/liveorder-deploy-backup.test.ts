import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
  missingDocker?: boolean;
  missingCompose?: boolean;
  missingComposeEnvironment?: boolean;
  missingJq?: boolean;
  missingBootstrapMarker?: boolean;
};

async function runDeployment(scenario: Scenario) {
  const root = await mkdtemp(path.join(os.tmpdir(), "liveorder-deploy-backup-"));
  const paths = {
    bin: path.join(root, "bin"),
    liveorder: path.join(root, "opt/liveorder"),
    config: path.join(root, "etc/liveorder"),
    lock: path.join(root, "run/lock"),
    bootstrap: path.join(root, "var/lib/liveorder"),
    volume: path.join(root, "docker-volume"),
    scripts: path.join(root, "usr/local/sbin"),
  };
  await Promise.all(Object.values(paths).map((directory) => mkdir(directory, { recursive: true })));
  await mkdir(path.join(paths.volume, "backups"), { recursive: true });
  if (!scenario.missingBootstrapMarker) {
    await writeFile(path.join(paths.bootstrap, "bootstrap-ready"), "ready\n");
  }

  if (scenario.databaseExists) {
    await writeFile(path.join(paths.volume, "liveorder.db"), "existing database");
  }
  await writeFile(path.join(paths.liveorder, "compose.yaml"), composeConfiguration);
  await writeFile(
    path.join(paths.liveorder, ".env"),
    "EXISTING_CONFIGURATION=value\nLIVEORDER_DATABASE_PATH=/tmp/wrong.sqlite\n",
  );
  if (!scenario.missingComposeEnvironment) {
    await writeFile(path.join(paths.config, "compose.env"), [
      "AWS_REGION=us-east-1",
      "LIVEORDER_BACKUP_BUCKET=backup-bucket",
      "LIVEORDER_BACKUP_PREFIX=liveorder/backups/sqlite",
      "LIVEORDER_BACKEND_REPOSITORY=111122223333.dkr.ecr.us-east-1.amazonaws.com/liveorder/backend",
      "LIVEORDER_CADDY_REPOSITORY=111122223333.dkr.ecr.us-east-1.amazonaws.com/liveorder/caddy",
      "LIVEORDER_RUNTIME_SECRET_NAME=liveorder/test/runtime",
      "SITE_ADDRESS=:80",
      "HTTP_PORT=80",
      "HTTPS_PORT=443",
    ].join("\n"));
  }
  await writeFile(path.join(paths.config, "runtime-config"), "SECRET_ARN='runtime'\nAWS_REGION='us-east-1'\n");

  const replacePaths = (script: string) => script
    .replaceAll("/opt/liveorder", paths.liveorder)
    .replaceAll("/etc/liveorder", paths.config)
    .replace("/var/lib/liveorder/bootstrap-ready", path.join(paths.bootstrap, "bootstrap-ready"))
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
      .replaceAll("/usr/local/sbin/liveorder-sync-runtime-env", syncScriptPath)
      .replaceAll("/usr/local/sbin/liveorder-backup", backupScriptPath),
    { mode: 0o700 },
  );
  await writeFile(syncScriptPath, "#!/usr/bin/env bash\nset -euo pipefail\n", { mode: 0o700 });

  if (!scenario.missingDocker) await writeFile(path.join(paths.bin, "docker"), `#!/usr/bin/env bash
set -euo pipefail
printf 'docker %s\\n' "$*" >> "$TEST_COMMAND_LOG"
if [[ "$*" == "info --format {{.DockerRootDir}}" ]]; then
  printf '/var/lib/docker\\n'
elif [[ "$*" == "info" ]]; then
  exit 0
elif [[ "$*" == "compose version" ]]; then
  [[ "$TEST_COMPOSE_MISSING" != 1 ]]
elif [[ "$*" == *"compose config --quiet"* ]]; then
  exit 0
elif [[ "$1" == login ]]; then
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
  await writeFile(path.join(paths.bin, "systemctl"), "#!/usr/bin/env bash\nexit 0\n");
  await writeFile(path.join(paths.bin, "mountpoint"), "#!/usr/bin/env bash\nexit 0\n");
  await writeFile(path.join(paths.bin, "findmnt"), "#!/usr/bin/env bash\nprintf 'xfs\\n'\n");
  if (scenario.missingDocker || scenario.missingJq) {
    await symlink("/bin/bash", path.join(paths.bin, "bash"));
  }
  const executableNames = [
    ...(scenario.missingDocker ? [] : ["docker"]),
    "aws",
    "chown",
    "systemctl",
    "mountpoint",
    "findmnt",
  ];
  await Promise.all(executableNames.map(async (name) => {
    await chmod(path.join(paths.bin, name), 0o700);
  }));

  const result = spawnSync("bash", [deployScriptPath, "a".repeat(40)], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: scenario.missingDocker || scenario.missingJq
        ? paths.bin
        : `${paths.bin}:${process.env.PATH ?? ""}`,
      TEST_COMPOSE_MISSING: scenario.missingCompose ? "1" : "0",
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

test("fails with the missing Docker command before touching application services", async () => {
  const { root, log, result } = await runDeployment({
    backendRunning: false,
    databaseExists: true,
    missingDocker: true,
  });
  try {
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /prerequisite is missing: command 'docker'/);
    assert.equal(log, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails with a missing required host utility before touching application services", async () => {
  const { root, log, result } = await runDeployment({
    backendRunning: false,
    databaseExists: true,
    missingJq: true,
  });
  try {
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /prerequisite is missing: command 'jq'/);
    assert.equal(log, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails when first-boot bootstrap did not write its readiness marker", async () => {
  const { root, log, result } = await runDeployment({
    backendRunning: false,
    databaseExists: true,
    missingBootstrapMarker: true,
  });
  try {
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /bootstrap is not complete/);
    assert.equal(log, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails with the missing Compose plugin before attempting application deployment", async () => {
  const { root, log, result } = await runDeployment({
    backendRunning: false,
    databaseExists: true,
    missingCompose: true,
  });
  try {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Docker Compose plugin is unavailable/);
    assert.ok(!log.includes("migrate-deploy.js"), log);
    assert.ok(!log.includes("aws ecr get-login-password"), log);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails with the missing host configuration file before application deployment", async () => {
  const { root, log, result } = await runDeployment({
    backendRunning: false,
    databaseExists: true,
    missingComposeEnvironment: true,
  });
  try {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /file '.*compose\.env'/);
    assert.equal(log, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
