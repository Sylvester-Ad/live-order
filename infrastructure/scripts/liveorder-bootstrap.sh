#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${LIVEORDER_BOOTSTRAP_LOG_REDIRECTED:-false}" != true ]]; then
  exec > >(tee -a /var/log/liveorder-bootstrap.log) 2>&1
fi
trap 'status=$?; echo "LiveOrder bootstrap failed (status $status, line ${BASH_LINENO[0]}). See /var/log/liveorder-bootstrap.log and /var/log/cloud-init-output.log." >&2; exit "$status"' ERR

required_variables=(
  LIVEORDER_DATA_VOLUME_ID
  LIVEORDER_INITIALIZE_DATA_VOLUME
  AWS_REGION
  LIVEORDER_LOG_GROUP
  LIVEORDER_RUNTIME_SECRET_ARN
  LIVEORDER_BACKUP_BUCKET
  LIVEORDER_BACKEND_REPOSITORY
  LIVEORDER_CADDY_REPOSITORY
  LIVEORDER_SITE_ADDRESS
  LIVEORDER_RUNTIME_SECRET_NAME
  LIVEORDER_COMPOSE_VERSION
)
for variable in "${required_variables[@]}"; do
  [[ -n "${!variable:-}" ]] || {
    echo "Required bootstrap configuration is missing: $variable" >&2
    exit 1
  }
done
[[ "$LIVEORDER_INITIALIZE_DATA_VOLUME" == true || "$LIVEORDER_INITIALIZE_DATA_VOLUME" == false ]] || {
  echo "LIVEORDER_INITIALIZE_DATA_VOLUME must be true or false." >&2
  exit 1
}

echo "Starting LiveOrder bootstrap."
dnf install -y amazon-ec2-utils xfsprogs awscli jq util-linux python3
command -v curl >/dev/null || {
  echo "The Amazon Linux curl executable is missing after package installation." >&2
  exit 1
}
test -x /sbin/ebsnvme-id || {
  echo "Required Amazon EBS NVMe utility is missing: /sbin/ebsnvme-id" >&2
  exit 1
}

mkdir -p /var/lib/docker
DATA_DEVICE=''
for attempt in $(seq 1 60); do
  for candidate in /dev/nvme*n1; do
    [[ -e "$candidate" ]] || continue
    if /sbin/ebsnvme-id "$candidate" 2>/dev/null | grep -Fq "Volume ID: $LIVEORDER_DATA_VOLUME_ID"; then
      DATA_DEVICE="$candidate"
      break 2
    fi
  done
  sleep 2
done
[[ -n "$DATA_DEVICE" ]] || {
  echo "LiveOrder data volume $LIVEORDER_DATA_VOLUME_ID was not found." >&2
  exit 1
}

FILESYSTEM=$(blkid -s TYPE -o value "$DATA_DEVICE" || true)
if [[ -z "$FILESYSTEM" ]]; then
  if [[ "$LIVEORDER_INITIALIZE_DATA_VOLUME" == true ]]; then
    SIGNATURES=$(wipefs --no-act --noheadings "$DATA_DEVICE")
    [[ -z "$SIGNATURES" ]] || {
      echo "LiveOrder data volume contains a recognized disk signature; refusing to format it." >&2
      exit 1
    }
    mkfs.xfs "$DATA_DEVICE"
    FILESYSTEM=xfs
  else
    echo "LiveOrder data volume has no recognized filesystem; refusing to format it. Set LIVEORDER_INITIALIZE_DATA_VOLUME=true only for a confirmed-new, empty volume." >&2
    exit 1
  fi
fi
[[ "$FILESYSTEM" == xfs ]] || {
  echo "Unexpected filesystem on LiveOrder data volume: $FILESYSTEM" >&2
  exit 1
}

DATA_UUID=$(blkid -s UUID -o value "$DATA_DEVICE")
grep -q "UUID=$DATA_UUID /var/lib/docker " /etc/fstab \
  || echo "UUID=$DATA_UUID /var/lib/docker xfs defaults,x-systemd.device-timeout=120s 0 2" >> /etc/fstab
mount /var/lib/docker
mountpoint -q /var/lib/docker || {
  echo "LiveOrder data volume is not mounted at /var/lib/docker." >&2
  exit 1
}
[[ "$(findmnt -rn -T /var/lib/docker -o FSTYPE)" == xfs ]] || {
  echo "LiveOrder data volume mount is not XFS." >&2
  exit 1
}

mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<DOCKER_CONFIG
{"log-driver":"awslogs","log-opts":{"awslogs-region":"$AWS_REGION","awslogs-group":"$LIVEORDER_LOG_GROUP","awslogs-create-group":"false","mode":"non-blocking","max-buffer-size":"4m"}}
DOCKER_CONFIG
install -d -m 0755 /etc/systemd/system/docker.service.d
cat > /etc/systemd/system/docker.service.d/10-liveorder-data-volume.conf <<'DOCKER_VOLUME_DEPENDENCY'
[Unit]
Requires=var-lib-docker.mount
After=var-lib-docker.mount
DOCKER_VOLUME_DEPENDENCY
systemctl daemon-reload
dnf install -y docker
install -d -m 0755 /usr/local/lib/docker/cli-plugins
curl --fail --silent --show-error --location --retry 3 \
  "https://github.com/docker/compose/releases/download/v$LIVEORDER_COMPOSE_VERSION/docker-compose-linux-aarch64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod 0755 /usr/local/lib/docker/cli-plugins/docker-compose
usermod -aG docker ec2-user
systemctl enable --now docker
systemctl is-active --quiet docker || {
  echo "Docker service did not become active." >&2
  exit 1
}
command -v docker >/dev/null || {
  echo "Docker executable is missing after installation." >&2
  exit 1
}
docker info >/dev/null || {
  echo "Docker daemon is not responding." >&2
  exit 1
}
[[ "$(docker info --format '{{.DockerRootDir}}')" == /var/lib/docker ]] || {
  echo "Docker is not using the persistent data volume." >&2
  exit 1
}
docker compose version
aws --version
jq --version
flock --version
python3 --version

ASSET_DIRECTORY=$(dirname "$(realpath "$0")")
mkdir -p /opt/liveorder
chown ec2-user:ec2-user /opt/liveorder
install -d -m 0700 /var/lib/docker/liveorder-restore-inbox
install -d -m 0750 /etc/liveorder
printf "SECRET_ARN='%s'\nAWS_REGION='%s'\n" \
  "$LIVEORDER_RUNTIME_SECRET_ARN" "$AWS_REGION" > /etc/liveorder/runtime-config
cat > /etc/liveorder/compose.env <<LIVEORDER_BASE_ENV
AWS_REGION=$AWS_REGION
AWS_DEFAULT_REGION=$AWS_REGION
LIVEORDER_BACKUP_BUCKET=$LIVEORDER_BACKUP_BUCKET
LIVEORDER_BACKUP_PREFIX=liveorder/backups/sqlite
LIVEORDER_BACKEND_REPOSITORY=$LIVEORDER_BACKEND_REPOSITORY
LIVEORDER_CADDY_REPOSITORY=$LIVEORDER_CADDY_REPOSITORY
SITE_ADDRESS=$LIVEORDER_SITE_ADDRESS
HTTP_PORT=80
HTTPS_PORT=443
LIVEORDER_RUNTIME_SECRET_NAME=$LIVEORDER_RUNTIME_SECRET_NAME
LIVEORDER_BASE_ENV
chmod 0640 /etc/liveorder/runtime-config /etc/liveorder/compose.env

install -m 0750 "$ASSET_DIRECTORY/liveorder-sync-runtime-env.sh" /usr/local/sbin/liveorder-sync-runtime-env
install -m 0750 "$ASSET_DIRECTORY/liveorder-backup.sh" /usr/local/sbin/liveorder-backup
install -m 0750 "$ASSET_DIRECTORY/liveorder-deploy.sh" /usr/local/sbin/liveorder-deploy
install -m 0750 "$ASSET_DIRECTORY/liveorder-restore-receiver.py" /usr/local/sbin/liveorder-restore-receiver
install -m 0644 "$ASSET_DIRECTORY/liveorder-backup.service" /etc/systemd/system/liveorder-backup.service
install -m 0644 "$ASSET_DIRECTORY/liveorder-backup.timer" /etc/systemd/system/liveorder-backup.timer
install -m 0644 "$ASSET_DIRECTORY/liveorder-restore-receiver.service" /etc/systemd/system/liveorder-restore-receiver.service
systemctl daemon-reload
systemctl enable --now liveorder-backup.timer
systemctl is-active --quiet liveorder-backup.timer || {
  echo "LiveOrder backup timer did not become active." >&2
  exit 1
}

for required_file in \
  /etc/liveorder/compose.env \
  /etc/liveorder/runtime-config \
  /usr/local/sbin/liveorder-deploy \
  /usr/local/sbin/liveorder-backup \
  /usr/local/sbin/liveorder-sync-runtime-env \
  /usr/local/sbin/liveorder-restore-receiver \
  /etc/systemd/system/liveorder-backup.service \
  /etc/systemd/system/liveorder-backup.timer \
  /etc/systemd/system/liveorder-restore-receiver.service; do
  test -s "$required_file" || {
    echo "Required LiveOrder bootstrap file is missing: $required_file" >&2
    exit 1
  }
done
test -x /usr/local/sbin/liveorder-deploy \
  && test -x /usr/local/sbin/liveorder-backup \
  && test -x /usr/local/sbin/liveorder-sync-runtime-env \
  && test -x /usr/local/sbin/liveorder-restore-receiver || {
    echo "A LiveOrder bootstrap helper is not executable." >&2
    exit 1
  }

install -d -m 0755 /var/lib/liveorder
printf 'ready\n' > /var/lib/liveorder/bootstrap-ready
chmod 0644 /var/lib/liveorder/bootstrap-ready
echo "LiveOrder instance bootstrap completed successfully."
