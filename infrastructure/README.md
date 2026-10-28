# LiveOrder AWS infrastructure and deployment

The standalone AWS CDK v2 TypeScript application is the source of truth for AWS resources. It defines one EC2 deployment, persistent EBS-backed Docker storage, ECR images, private S3 backups, operational alerts, and a GitHub OIDC deployment role. The stack and workflow have **not** been deployed from this environment.

## Prerequisites

- Node.js 24 and pnpm 12.8.1.
- AWS CLI v2 configured for the intended account and region.
- An AWS identity approved to bootstrap and deploy CDK; verify it before proceeding:

  ```sh
  aws sts get-caller-identity
  aws configure get region
  ```

- A valid alert email address. AWS Budget and SNS email subscriptions must be confirmed before relying on notifications.
- Review the AWS account plan, credits, remaining evaluation period, service availability, and current prices. Credits and Free Plan eligibility are not assumed by this stack.
- GitHub Actions must be allowed to use the `production` GitHub Environment. Add required reviewers and restrict deployment branches to the protected production branch.
- If the account already has the GitHub OIDC provider, configure its ARN in `LIVEORDER_GITHUB_OIDC_PROVIDER_ARN` instead of trying to create a duplicate.

Install the infrastructure package:

```sh
cd infrastructure
pnpm install --frozen-lockfile
cp -n .env.example .env
```

Keep `infrastructure/.env` for non-secret CDK configuration only. It is ignored by Git. Do not put Cloudinary credentials, AWS keys, or other application secrets in it.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `CDK_DEFAULT_ACCOUNT` | AWS CLI account | Explicit target AWS account. |
| `CDK_DEFAULT_REGION` | AWS CLI region | Explicit target AWS region. |
| `LIVEORDER_BUDGET_EMAIL` | Required | Email for budget notices and scheduled-backup failure alerts. Confirm both AWS subscriptions. |
| `LIVEORDER_GITHUB_REPOSITORY` | `Sylvester-Ad/live-order` | Exact repository allowed by GitHub OIDC. |
| `LIVEORDER_GITHUB_ENVIRONMENT` | `production` | Exact GitHub Environment claim allowed to assume the deploy role. |
| `LIVEORDER_GITHUB_OIDC_PROVIDER_ARN` | Empty | Optional existing account provider ARN for `token.actions.githubusercontent.com`; otherwise CDK creates it. |
| `LIVEORDER_INSTANCE_TYPE` | `t4g.small` | ARM64 Graviton instance type. |
| `LIVEORDER_DATA_VOLUME_GIB` | `30` | Encrypted gp3 data volume size; minimum 20 GiB. |
| `LIVEORDER_COMPOSE_VERSION` | `2.39.4` | Pinned Compose v2 plugin version installed on AL2023. |
| `LIVEORDER_RUNTIME_SECRET_NAME` | `liveorder/production/runtime` | Secrets Manager secret holding Cloudinary credentials. |
| `LIVEORDER_SITE_ADDRESS` | `:80` | Caddy address; set a valid hostname for automatic HTTPS after DNS is configured. |

Set the intended account, region, budget email, and—if needed—OIDC provider ARN in `.env` before synthesis. Do not invent an account, domain, or email. The default `:80` configuration is HTTP-only until a real hostname and DNS are supplied.

## Resources and security boundaries

- One VPC with one public subnet in one Availability Zone; no NAT Gateway, load balancer, Kubernetes, or managed database.
- One Amazon Linux 2023 ARM64 EC2 instance (default `t4g.small`), one Elastic IP, and inbound TCP 80/443 only. No public SSH. Outbound access is limited to TCP 443.
- IMDSv2 is required, metadata tags are disabled, and the metadata hop limit is one.
- A separate encrypted gp3 EBS volume is mounted as `/var/lib/docker` before Docker starts. Compose's named SQLite volume is stored under Docker's data root on this EBS volume. The data volume is retained on stack deletion and remains attached during ordinary instance replacement in the same Availability Zone; a newly created stack does **not** automatically adopt a previously retained volume.
- Private S3 backup bucket with Block Public Access, bucket-owner-enforced ownership, SSL enforcement, SSE-S3, versioning, and current/noncurrent object expiration after 90 days. Incomplete multipart uploads expire after seven days. Bucket retention is `Retain`.
- Two ECR repositories (`liveorder/backend` and `liveorder/caddy`) use immutable tags, on-push image scanning, and a lifecycle rule retaining the ten most recent images. Repositories are retained when the stack is removed.
- Secrets Manager creates an initially empty, retained secret. Only the EC2 role can read it. GitHub Actions cannot read application secrets.
- The EC2 role uses SSM, writes container logs to one 30-day CloudWatch log group, reads the one runtime secret, pulls only these two ECR repositories, uploads only `liveorder/backups/sqlite/*`, and emits only the `LiveOrder/Backups` CloudWatch metric namespace. It has no S3 list, get, or delete permission.
- A separate backup recovery role can list/read versions only under the backup prefix. Designated recovery operators must be granted permission to assume it; the application instance does not receive this role.
- GitHub OIDC trusts only the configured repository and environment. The role can push to the two ECR repositories and invoke `AWS-RunShellScript` on this EC2 instance. `ssm:GetCommandInvocation` requires `Resource: "*"`. Protect the `production` GitHub Environment because SSM command execution is effectively root access.
- A $50 monthly cost budget sends actual-spend notices at 50%, 80%, and 100%. Credits are excluded from the budget calculation. The budget is an alert, not a cap.
- A daily CloudWatch metric alarm sends an SNS email notification when a backup fails. The email subscription must be confirmed. Container stdout/stderr uses the CloudWatch `awslogs` driver in non-blocking mode.
- CDK uses a short-lived custom-resource Lambda while managing the VPC default security group. It is not an always-running application service.

The Docker Compose file is delivered to the instance by CI. CI builds and publishes both images explicitly for `linux/arm64`; the host pulls immutable commit-SHA tags. Runtime configuration sets `NODE_ENV=production`, `LIVEORDER_DATABASE_PATH=/var/lib/liveorder/liveorder.db`, host ports 80/443, and the ECR repositories. Caddy serves the frontend and routes API traffic; the backend remains unpublished to the internet.

## Synthesize, review, bootstrap, and deploy

From `infrastructure/`, install dependencies, set configuration, and run local checks:

```sh
pnpm typecheck
pnpm test
CDK_DEFAULT_ACCOUNT= CDK_DEFAULT_REGION= LIVEORDER_BUDGET_EMAIL=budget-test@example.invalid pnpm synth
```

The empty account/region values produce an account-agnostic template for offline review and avoid account lookups; the CDK app will not replace those empty process variables with values from `.env`. Synthesis does not create AWS resources. Review `cdk.out/LiveOrderProduction.template.json`, especially IAM policies, instance type, ingress, EBS retention, S3 lifecycle, ECR, SNS/CloudWatch, and budget resources. A target-account synth/deploy uses the configured account/region and requires working AWS credentials.

After the target account, region, prices, and configuration are approved, bootstrap and deploy:

```sh
set -a
. ./.env
set +a
pnpm exec cdk bootstrap "aws://${CDK_DEFAULT_ACCOUNT}/${CDK_DEFAULT_REGION}" --no-bootstrap-customer-key
pnpm deploy
```

Bootstrap creates CDK support resources in the target account. It is separate from the LiveOrder stack and can incur charges. Do not run these commands until the AWS account and region have been explicitly selected. CDK deploy is not run by this implementation task.

Retrieve the stack outputs after deployment from the CloudFormation console or:

```sh
aws cloudformation describe-stacks \
  --stack-name LiveOrderProduction \
  --region "$CDK_DEFAULT_REGION" \
  --query 'Stacks[0].Outputs'
```

Confirm the budget email and SNS email subscription. Create GitHub repository variables:

- `AWS_REGION`: the stack region.
- `AWS_DEPLOY_ROLE_ARN`: `GitHubDeploymentRoleArn` output.
- `LIVEORDER_INSTANCE_ID`: `ApplicationInstanceId` output.

Create/protect the GitHub `production` Environment with approval and branch restrictions. The workflow at `.github/workflows/production.yml` validates pull requests and deploys on pushes to `main`; `workflow_dispatch` can deploy the selected ref subject to environment protection. No long-lived AWS credentials belong in GitHub secrets.

## Secrets, hostname, and first deployment

In Secrets Manager, set `LIVEORDER_RUNTIME_SECRET_NAME` to a JSON object with non-empty string values:

```json
{
  "CLOUDINARY_CLOUD_NAME": "<your-cloud-name>",
  "CLOUDINARY_API_KEY": "<your-api-key>",
  "CLOUDINARY_API_SECRET": "<your-api-secret>"
}
```

The instance helper `/usr/local/sbin/liveorder-sync-runtime-env` reads this secret and writes `/opt/liveorder/.env` with owner `ec2-user` and mode `0600`; it does not print credential values. The deploy helper refreshes this file before each release. After rotating the secret, run the sync helper through Session Manager and recreate the backend container. Never pass credentials through SSM parameters, workflow output, Docker build arguments, or frontend variables.

For HTTPS, set `LIVEORDER_SITE_ADDRESS` to the actual hostname in the infrastructure `.env` before deployment and synthesis. After deployment, point the hostname's DNS A record at `ApplicationPublicIp`. Caddy obtains certificates automatically when DNS is correct and the public ports are reachable. Do not use a placeholder hostname in production. If changing the site address after deployment, update `/etc/liveorder/compose.env` through Session Manager and run the runtime sync helper before redeploying.

The first successful workflow deployment publishes both images, transfers `compose.yaml` using SSM, synchronizes the runtime secret, applies `prisma migrate deploy` to the persistent SQLite path, starts both services, and waits for backend readiness and Caddy liveness. It does not create creator accounts. Provision creators manually in a private Session Manager shell:

```sh
sudo docker compose --env-file /opt/liveorder/.env -f /opt/liveorder/compose.yaml \
  run --rm --no-deps backend node dist/server/src/scripts/create-creator.js "Creator Name"
```

Securely retain the one-time code from that private terminal. Do not run provisioning via SSM Run Command or send the code through command output or centralized logs.

## Deployments and recovery from a failed release

The workflow runs backend and frontend tests, lint/type checks, Prisma validation/client generation, migrations against an isolated temporary SQLite database, production builds, Compose validation, CDK tests/synthesis, and ARM64 image builds. Deployment builds/pushes SHA-tagged immutable images, then uses SSM Run Command. Before every migration, the host synchronously runs the same locked backup helper used by the timer. It verifies the persistent database path, skips only when no database file exists, and requires a verified S3 upload for an existing database; backup errors or an already-running backup abort deployment. Migrations are applied with the new backend image; Compose then recreates services and waits for health checks.

Production migrations are never reset or rolled back automatically. If deployment fails:

1. Inspect the GitHub Actions run and the corresponding Systems Manager Run Command status.
2. On the instance, inspect `sudo journalctl -u liveorder-backup.service` and `sudo docker compose --env-file /opt/liveorder/.env -f /opt/liveorder/compose.yaml logs --tail=200`.
3. Check backend and Caddy health; verify the persistent volume and database before any manual intervention.
4. Do not automatically roll back application images after a migration. A prior release may be redeployed only after confirming it is compatible with the applied schema; otherwise restore from backup using the recovery procedure below.

Images are immutable and identified by the 40-character Git commit SHA. A failed workflow leaves the selected image in ECR; it does not delete database volumes or rewrite the database. Use GitHub Actions to deliberately deploy a compatible release after resolving the failure.

## Scheduled backups, monitoring, and restore

The EC2 user data installs a root-owned systemd service and timer. `liveorder-backup.timer` runs daily at 02:15 UTC with a persistent timer and up to ten minutes of randomized delay. The service uses `flock` to prevent overlap, asks the backend's existing SQLite online-backup utility to create and integrity-check a snapshot in the persistent named volume, validates retry candidates, uploads through the host AWS CLI to the fixed `liveorder/backups/sqlite/` S3 prefix with SSE-S3, and marks the local backup uploaded only after the remote upload succeeds. Failed uploads remain on EBS for retry. Local retention only removes uploaded backups after the existing 14-day threshold; creation stops at the existing seven-unuploaded-backup limit. S3 lifecycle expires current and old object versions after 90 days.

Useful Session Manager commands:

```sh
sudo systemctl status liveorder-backup.timer
sudo systemctl list-timers liveorder-backup.timer
sudo systemctl start liveorder-backup.service
sudo journalctl -u liveorder-backup.service --since "7 days ago"
sudo /usr/local/sbin/liveorder-backup --retry liveorder-<timestamp>-<id>.sqlite
sudo docker compose --env-file /opt/liveorder/.env -f /opt/liveorder/compose.yaml ps
sudo docker compose --env-file /opt/liveorder/.env -f /opt/liveorder/compose.yaml logs --tail=200
```

The instance role cannot list or download S3 objects. Recovery operators use the separate recovery role. Configure an AWS CLI profile to assume `BackupRecoveryRoleArn`, then download the selected object to a trusted workstation:

```sh
aws --profile "<recovery-profile>" s3 cp \
  "s3://<BackupBucketName>/liveorder/backups/sqlite/<backup-key>" \
  ./liveorder-restore.sqlite \
  --region "$CDK_DEFAULT_REGION"
```

Transfer it through the temporary SSM-only receiver (it binds to loopback and is not exposed by the security group):

1. In one Session Manager shell, start `sudo systemctl start liveorder-restore-receiver.service`.
2. In another local terminal, open an SSM port-forward session:

   ```sh
   aws ssm start-session \
     --target "<ApplicationInstanceId>" \
     --document-name AWS-StartPortForwardingSession \
     --parameters '{"portNumber":["18080"],"localPortNumber":["18080"]}' \
     --region "$CDK_DEFAULT_REGION"
   ```

3. In a separate local terminal, POST the downloaded file through the tunnel:

   ```sh
   curl --fail --show-error --request POST \
     --data-binary @./liveorder-restore.sqlite \
     http://127.0.0.1:18080/upload
   ```

   The receiver accepts one file up to 10 GiB and stores it at `/var/lib/docker/liveorder-restore-inbox/restore.sqlite` on EBS. Stop the receiver after transfer with `sudo systemctl stop liveorder-restore-receiver.service`.

4. Stage it in a short-lived backend container with the persistent volume attached, validate and restore to a different file:

   ```sh
   sudo docker compose --env-file /opt/liveorder/.env -f /opt/liveorder/compose.yaml \
     run --detach --name liveorder-restore-stager --no-deps backend sleep 3600
   sudo docker exec liveorder-restore-stager mkdir -p /var/lib/liveorder/backups /var/lib/liveorder/restore
   backup_name="liveorder-restore-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
   sudo docker cp /var/lib/docker/liveorder-restore-inbox/restore.sqlite \
     "liveorder-restore-stager:/var/lib/liveorder/backups/$backup_name"
   sudo docker exec --user root liveorder-restore-stager chown node:node "/var/lib/liveorder/backups/$backup_name"
   sudo docker exec liveorder-restore-stager node dist/server/src/scripts/restore-sqlite-backup.js \
     --source "/var/lib/liveorder/backups/$backup_name" \
     --destination /var/lib/liveorder/restore/restored.db
   sudo docker rm --force liveorder-restore-stager
   sudo rm /var/lib/docker/liveorder-restore-inbox/restore.sqlite
   ```

If a step fails, inspect the stager and keep the staged backup until the failure is resolved; do not overwrite it. The restore command validates the backup, refuses to overwrite an existing destination, and refuses the configured active database path even if `--replace-existing` is used. Restore to a separate file, validate it, then follow the controlled production recovery procedure in the root [README](../README.md#production-recovery). Stop Caddy and backend before replacing the live database, preserve the previous file and sidecars, and do not run a destructive Prisma reset. Grant operators `ssm:StartSession` on the instance and access to the port-forwarding document; the stack does not grant this to arbitrary users.

For monitoring:

```sh
aws logs tail /liveorder/containers --since 1h --follow --region "$CDK_DEFAULT_REGION"
```

The CloudWatch `LiveOrder-BackupFailure` alarm sends SNS email when a backup run reports failure. Missing metrics are treated as non-breaching; therefore verify the timer is enabled and review its logs as part of operations. The alert email can take time to confirm and AWS delivery is not a substitute for restore rehearsals.

## Cost, teardown, and retained resources

Main cost drivers are the always-on EC2 instance, root and data gp3 EBS volumes, public IPv4/Elastic IP, Secrets Manager, CloudWatch log ingestion/storage and alarm, ECR image storage/scanning, S3 storage/requests, SNS notifications, and internet data transfer. Region, usage, retention, and pricing change the total; the approximately $20 target is not guaranteed. The $50 budget is only an alert, not a hard spending limit. Verify regional rates in AWS Pricing Calculator and monitor actual charges.

After an explicit teardown decision:

```sh
pnpm exec cdk destroy
```

The stack retains the EBS data volume, S3 bucket, Secrets Manager secret, and ECR repositories. Those resources can continue to incur charges and retain data/secrets. A future stack creates a new EBS volume and will not automatically adopt an orphaned retained one. Preserve or securely dispose of retained data deliberately. The Elastic IP and running EC2 instance are removed with the stack. CDK bootstrap resources are separate and are not removed by `cdk destroy`.
