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

[[ -f "$compose_file" && -f "$compose_environment" ]] || {
  echo "LiveOrder deployment configuration is incomplete." >&2
  exit 1
}
set -a
source "$compose_environment"
set +a

[[ -n "${LIVEORDER_BACKEND_REPOSITORY:-}" && -n "${LIVEORDER_CADDY_REPOSITORY:-}" ]] || {
  echo "LiveOrder ECR repository configuration is missing." >&2
  exit 1
}

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

docker compose --env-file "$environment_file" -f "$compose_file" pull backend caddy

existing_backend=$(docker compose --env-file "$environment_file" -f "$compose_file" ps -q backend)
if [[ -n "$existing_backend" ]]; then
  systemctl start liveorder-backup.service
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
