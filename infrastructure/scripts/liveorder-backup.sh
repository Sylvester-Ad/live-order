#!/usr/bin/env bash
set -euo pipefail
umask 077

exec 9>/run/lock/liveorder-backup.lock
if ! flock -n 9; then
  echo "A LiveOrder backup is already running."
  exit 0
fi

set -a
source /etc/liveorder/compose.env
set +a

report_backup_result() {
  local status=$?
  trap - EXIT
  local failure=1
  if [[ $status -eq 0 ]]; then failure=0; fi
  if ! aws cloudwatch put-metric-data \
    --region "$AWS_REGION" \
    --namespace LiveOrder/Backups \
    --metric-data "MetricName=BackupFailure,Value=$failure,Unit=Count"; then
    echo "Unable to publish LiveOrder backup result metric." >&2
  fi
  exit "$status"
}
trap report_backup_result EXIT

compose_file=/opt/liveorder/compose.yaml
environment_file=/opt/liveorder/.env
[[ -f "$compose_file" && -f "$environment_file" ]] || {
  echo "LiveOrder Compose configuration is unavailable." >&2
  exit 1
}

container_id=$(docker compose --env-file "$environment_file" -f "$compose_file" ps -q backend)
[[ -n "$container_id" ]] || {
  echo "LiveOrder backend container is not running." >&2
  exit 1
}

volume_name=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/liveorder"}}{{.Name}}{{end}}{{end}}' "$container_id")
[[ -n "$volume_name" ]] || {
  echo "LiveOrder database volume was not found." >&2
  exit 1
}
volume_mount=$(docker volume inspect --format '{{.Mountpoint}}' "$volume_name")
[[ -n "$volume_mount" && -d "$volume_mount" ]] || {
  echo "LiveOrder database volume mount is unavailable." >&2
  exit 1
}

if [[ $# -eq 0 ]]; then
  backup_filename="liveorder-$(date -u +%Y%m%dT%H%M%SZ)-$(cat /proc/sys/kernel/random/uuid).sqlite"
elif [[ $# -eq 2 && "$1" == "--retry" && "$2" =~ ^liveorder-[0-9]{8}T[0-9]{6}Z(-[A-Za-z0-9-]+)?\.sqlite$ ]]; then
  backup_filename=$2
else
  echo "Usage: liveorder-backup [--retry <backup-filename.sqlite>]" >&2
  exit 2
fi

container_backup="/var/lib/liveorder/backups/$backup_filename"
host_backup="$volume_mount/backups/$backup_filename"
if [[ $# -eq 0 ]]; then
  docker compose --env-file "$environment_file" -f "$compose_file" exec -T backend \
    node dist/server/src/scripts/backup-sqlite.js --destination "$container_backup"
fi
[[ -f "$host_backup" && ! -L "$host_backup" ]] || {
  echo "Local SQLite backup is missing or is not a regular file." >&2
  exit 1
}

docker compose --env-file "$environment_file" -f "$compose_file" exec -T backend \
  node dist/server/src/scripts/finalize-sqlite-backup-upload.js --backup "$container_backup" --validate-only
aws s3 cp "$host_backup" \
  "s3://${LIVEORDER_BACKUP_BUCKET}/${LIVEORDER_BACKUP_PREFIX}/${backup_filename}" \
  --region "$AWS_REGION" \
  --sse AES256 \
  --only-show-errors
docker compose --env-file "$environment_file" -f "$compose_file" exec -T backend \
  node dist/server/src/scripts/finalize-sqlite-backup-upload.js --backup "$container_backup"

echo "LiveOrder SQLite backup completed and uploaded."
