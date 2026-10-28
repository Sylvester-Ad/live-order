#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! "$1" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: liveorder-deploy <40-character-git-commit-sha>" >&2
  exit 2
fi
release=$1
compose_file=/opt/liveorder/compose.yaml
environment_file=/opt/liveorder/.env
compose_environment=/etc/liveorder/compose.env
bootstrap_marker=/var/lib/liveorder/bootstrap-ready

for required_command in aws docker jq flock awk mktemp chown chmod cat rm mv systemctl mountpoint findmnt; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "LiveOrder deployment prerequisite is missing: command '$required_command'." >&2
    exit 1
  fi
done

[[ -f "$bootstrap_marker" ]] || {
  echo "LiveOrder bootstrap is not complete; /var/lib/liveorder/bootstrap-ready is missing. Inspect /var/log/liveorder-bootstrap.log and /var/log/cloud-init-output.log." >&2
  exit 1
}
[[ "$(cat "$bootstrap_marker")" == ready ]] || {
  echo "LiveOrder bootstrap readiness marker is invalid; inspect the instance bootstrap logs." >&2
  exit 1
}
for required_file in "$compose_file" "$compose_environment" /etc/liveorder/runtime-config \
  /usr/local/sbin/liveorder-backup /usr/local/sbin/liveorder-sync-runtime-env; do
  [[ -s "$required_file" ]] || {
    echo "LiveOrder deployment prerequisite is missing: file '$required_file'." >&2
    exit 1
  }
done

set -a
source "$compose_environment"
set +a

[[ -n "${AWS_REGION:-}" ]] || {
  echo "LiveOrder deployment configuration is missing: AWS_REGION." >&2
  exit 1
}
[[ -n "${LIVEORDER_BACKUP_BUCKET:-}" ]] || {
  echo "LiveOrder deployment configuration is missing: LIVEORDER_BACKUP_BUCKET." >&2
  exit 1
}
[[ "${LIVEORDER_BACKUP_PREFIX:-}" == "liveorder/backups/sqlite" ]] || {
  echo "LiveOrder deployment configuration is missing or invalid: LIVEORDER_BACKUP_PREFIX." >&2
  exit 1
}
[[ -n "${LIVEORDER_BACKEND_REPOSITORY:-}" ]] || {
  echo "LiveOrder deployment configuration is missing: LIVEORDER_BACKEND_REPOSITORY." >&2
  exit 1
}
[[ -n "${LIVEORDER_CADDY_REPOSITORY:-}" ]] || {
  echo "LiveOrder deployment configuration is missing: LIVEORDER_CADDY_REPOSITORY." >&2
  exit 1
}
[[ -n "${LIVEORDER_RUNTIME_SECRET_NAME:-}" ]] || {
  echo "LiveOrder deployment configuration is missing: LIVEORDER_RUNTIME_SECRET_NAME." >&2
  exit 1
}
[[ -n "${SITE_ADDRESS:-}" && -n "${HTTP_PORT:-}" && -n "${HTTPS_PORT:-}" ]] || {
  echo "LiveOrder deployment configuration is missing: SITE_ADDRESS, HTTP_PORT, or HTTPS_PORT." >&2
  exit 1
}

if ! systemctl is-active --quiet docker; then
  echo "LiveOrder deployment prerequisite is unavailable: Docker service is not active." >&2
  exit 1
fi
if ! mountpoint -q /var/lib/docker; then
  echo "LiveOrder deployment prerequisite is unavailable: persistent volume is not mounted at /var/lib/docker." >&2
  exit 1
fi
if [[ "$(findmnt -rn -T /var/lib/docker -o FSTYPE)" != xfs ]]; then
  echo "LiveOrder deployment prerequisite is unavailable: /var/lib/docker is not an XFS mount." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "LiveOrder deployment prerequisite is unavailable: Docker daemon is not responding." >&2
  exit 1
fi
if [[ "$(docker info --format '{{.DockerRootDir}}')" != /var/lib/docker ]]; then
  echo "LiveOrder deployment prerequisite is unavailable: Docker is not using the persistent /var/lib/docker volume." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "LiveOrder deployment prerequisite is missing: Docker Compose plugin is unavailable." >&2
  exit 1
fi
if ! aws --version >/dev/null 2>&1; then
  echo "LiveOrder deployment prerequisite is missing: AWS CLI is unavailable." >&2
  exit 1
fi
if ! jq --version >/dev/null 2>&1 || ! flock --version >/dev/null 2>&1; then
  echo "LiveOrder deployment prerequisite is missing: jq or flock is unavailable." >&2
  exit 1
fi

aws ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin "${LIVEORDER_BACKEND_REPOSITORY%%/*}"

/usr/local/sbin/liveorder-sync-runtime-env
temporary_environment=$(mktemp /opt/liveorder/.env.XXXXXX)
trap 'rm -f "$temporary_environment"' EXIT
awk '!/^LIVEORDER_(BACKEND_IMAGE|CADDY_IMAGE|RELEASE_VERSION)=/' "$environment_file" > "$temporary_environment"
printf 'LIVEORDER_BACKEND_IMAGE=%s:%s\nLIVEORDER_CADDY_IMAGE=%s:%s\nLIVEORDER_RELEASE_VERSION=%s\n' \
  "$LIVEORDER_BACKEND_REPOSITORY" "$release" \
  "$LIVEORDER_CADDY_REPOSITORY" "$release" "$release" >> "$temporary_environment"
chown ec2-user:ec2-user "$temporary_environment"
chmod 0600 "$temporary_environment"
mv -f "$temporary_environment" "$environment_file"
trap - EXIT

docker compose --env-file "$environment_file" -f "$compose_file" config --quiet
docker compose --env-file "$environment_file" -f "$compose_file" pull backend caddy

existing_backend=$(docker compose --env-file "$environment_file" -f "$compose_file" ps -q backend)
/usr/local/sbin/liveorder-backup
if [[ -n "$existing_backend" ]]; then
  docker compose --env-file "$environment_file" -f "$compose_file" stop caddy backend
fi

docker compose --env-file "$environment_file" -f "$compose_file" run --rm --no-deps backend \
  node dist/server/src/scripts/migrate-deploy.js
docker compose --env-file "$environment_file" -f "$compose_file" up \
  -d --no-build --pull never --wait --wait-timeout 180 backend caddy

backend_id=$(docker compose --env-file "$environment_file" -f "$compose_file" ps -q backend)
caddy_id=$(docker compose --env-file "$environment_file" -f "$compose_file" ps -q caddy)
[[ -n "$backend_id" && -n "$caddy_id" ]] || {
  echo "LiveOrder containers did not start." >&2
  exit 1
}
[[ "$(docker inspect --format '{{.State.Health.Status}}' "$backend_id")" == healthy ]] || {
  echo "LiveOrder backend readiness check failed." >&2
  exit 1
}
[[ "$(docker inspect --format '{{.State.Health.Status}}' "$caddy_id")" == healthy ]] || {
  echo "LiveOrder Caddy liveness check failed." >&2
  exit 1
}

echo "LiveOrder release $release is deployed and healthy."
