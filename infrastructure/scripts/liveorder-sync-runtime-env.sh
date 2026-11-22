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
      and .SMTP_HOST == "smtp.resend.com"
      and .SMTP_PORT == "465"
      and .SMTP_USERNAME == "resend"
      and ((.SMTP_PASSWORD // "") | type) == "string" and (.SMTP_PASSWORD | length) > 0
      and .SMTP_SECURE == "true"
      and .SMTP_REQUIRE_TLS == "true"
      and .SMTP_FROM == "LiveOrder <accounts@mail.liveorder.site>"
      and .PUBLIC_APP_URL == "https://liveorder.site"
    then
      {
        CLOUDINARY_CLOUD_NAME,
        CLOUDINARY_API_KEY,
        CLOUDINARY_API_SECRET,
        SMTP_HOST: (.SMTP_HOST // ""),
        SMTP_PORT: (.SMTP_PORT // "587"),
        SMTP_USERNAME: (.SMTP_USERNAME // ""),
        SMTP_PASSWORD: (.SMTP_PASSWORD // ""),
        SMTP_SECURE: (.SMTP_SECURE // "false"),
        SMTP_REQUIRE_TLS: (.SMTP_REQUIRE_TLS // "true"),
        SMTP_FROM: (.SMTP_FROM // ""),
        PUBLIC_APP_URL: (.PUBLIC_APP_URL // "")
      }
      | to_entries
      | map(.key + "=\"" + (.value | tostring | dotenv) + "\"")
      | join("\n")
    else error("Runtime secret must contain valid Cloudinary and production SMTP configuration") end
  ' >> "$temporary_file"
chown ec2-user:ec2-user "$temporary_file"
chmod 0600 "$temporary_file"
mv -f "$temporary_file" /opt/liveorder/.env
trap - EXIT
