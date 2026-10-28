#!/usr/bin/env bash
set -euo pipefail
umask 077

source /etc/liveorder/runtime-config
temporary_file=$(mktemp /opt/liveorder/.env.XXXXXX)
trap 'rm -f "$temporary_file"' EXIT
cat /etc/liveorder/compose.env > "$temporary_file"
printf '\n' >> "$temporary_file"
aws secretsmanager get-secret-value \
  --region "$AWS_REGION" \
  --secret-id "$SECRET_ARN" \
  --query SecretString \
  --output text |
  jq -er '
    def dotenv: (tojson | .[1:-1]) | gsub("\\$"; "$$");
    if (.CLOUDINARY_CLOUD_NAME | type) == "string" and (.CLOUDINARY_CLOUD_NAME | length) > 0
       and (.CLOUDINARY_API_KEY | type) == "string" and (.CLOUDINARY_API_KEY | length) > 0
       and (.CLOUDINARY_API_SECRET | type) == "string" and (.CLOUDINARY_API_SECRET | length) > 0
    then
      "CLOUDINARY_CLOUD_NAME=\"\(.CLOUDINARY_CLOUD_NAME | dotenv)\"\nCLOUDINARY_API_KEY=\"\(.CLOUDINARY_API_KEY | dotenv)\"\nCLOUDINARY_API_SECRET=\"\(.CLOUDINARY_API_SECRET | dotenv)\""
    else error("Runtime secret must contain non-empty Cloudinary credential strings") end
  ' >> "$temporary_file"
chown ec2-user:ec2-user "$temporary_file"
chmod 0600 "$temporary_file"
mv -f "$temporary_file" /opt/liveorder/.env
trap - EXIT
