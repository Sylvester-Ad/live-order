#!/usr/bin/env bash
set -euo pipefail
umask 077

set -a
source /etc/liveorder/compose.env
set +a

report_backup_result() {
  local status=${1:-$?}
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

exec 9>/run/lock/liveorder-backup.lock
if ! flock -n 9; then
  echo "A LiveOrder backup is already running." >&2
  exit 1
fi

compose_file=/opt/liveorder/compose.yaml
environment_file=/opt/liveorder/.env
[[ -f "$compose_file" && -f "$environment_file" ]] || {
  echo "LiveOrder Compose configuration is unavailable." >&2
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

backup_container="liveorder-backup-$(cat /proc/sys/kernel/random/uuid)"
backup_container_created=0
cleanup_backup_container() {
  local status=$?
  trap - EXIT
  if [[ "$backup_container_created" -eq 1 ]]; then
    if ! docker rm -f "$backup_container" >/dev/null; then
      echo "Unable to remove temporary backup container $backup_container." >&2
      status=1
    fi
  fi
  report_backup_result "$status"
}
trap cleanup_backup_container EXIT

if [[ $# -eq 0 ]]; then
  database_status=$(docker compose --env-file "$environment_file" -f "$compose_file" \
    run --rm --no-deps backend sh -c '
      if [ "$LIVEORDER_DATABASE_PATH" != "/var/lib/liveorder/liveorder.db" ]; then
        exit 1
      elif [ -L "$LIVEORDER_DATABASE_PATH" ]; then
        exit 1
      elif [ -f "$LIVEORDER_DATABASE_PATH" ]; then
        printf "database-present"
      elif [ ! -e "$LIVEORDER_DATABASE_PATH" ]; then
        printf "database-absent"
      else
        exit 1
      fi
    ')
  case "$database_status" in
    database-absent)
      echo "No existing LiveOrder database found; skipping backup."
      exit 0
      ;;
    database-present) ;;
    *)
      echo "Unable to determine whether the LiveOrder database exists." >&2
      exit 1
      ;;
  esac

  backup_container_created=1
  docker compose --env-file "$environment_file" -f "$compose_file" \
    run --name "$backup_container" --no-deps backend \
    node dist/server/src/scripts/backup-sqlite.js \
    --destination "/var/lib/liveorder/backups/$backup_filename"
else
  backup_container_created=1
  docker compose --env-file "$environment_file" -f "$compose_file" \
    run --name "$backup_container" --no-deps backend true
fi

volume_mount=$(docker inspect --format \
  '{{range .Mounts}}{{if eq .Destination "/var/lib/liveorder"}}{{.Source}}{{end}}{{end}}' \
  "$backup_container")
[[ -n "$volume_mount" && -d "$volume_mount" ]] || {
  echo "LiveOrder database volume mount is unavailable." >&2
  exit 1
}

container_backup="/var/lib/liveorder/backups/$backup_filename"
host_backup="$volume_mount/backups/$backup_filename"
[[ -f "$host_backup" && ! -L "$host_backup" ]] || {
  echo "Local SQLite backup is missing or is not a regular file." >&2
  exit 1
}

docker compose --env-file "$environment_file" -f "$compose_file" run --rm --no-deps backend \
  node dist/server/src/scripts/finalize-sqlite-backup-upload.js --backup "$container_backup" --validate-only
aws s3 cp "$host_backup" \
  "s3://${LIVEORDER_BACKUP_BUCKET}/${LIVEORDER_BACKUP_PREFIX}/${backup_filename}" \
  --region "$AWS_REGION" \
  --sse AES256 \
  --only-show-errors
docker compose --env-file "$environment_file" -f "$compose_file" run --rm --no-deps backend \
  node dist/server/src/scripts/finalize-sqlite-backup-upload.js --backup "$container_backup"

echo "LiveOrder SQLite backup completed and uploaded."
