# LiveOrder AWS infrastructure

This is a standalone AWS CDK v2 TypeScript application. It is separate from the root, `server/`, and `client/` pnpm projects; it does not change their lockfiles or the application containers. This milestone defines infrastructure only and has **not** deployed it.

## Prerequisites

- Node.js 24 and pnpm 12.8.1.
- AWS CLI v2 configured for the intended account and region, with an identity allowed to bootstrap CDK and deploy the stack.
- An AWS account plan that permits the selected services and instance type.
- A notification email address that can be verified in the AWS billing console.
- Review of the account's current Free Plan status, credits, remaining days, and service eligibility. The Free Plan can end when credits are exhausted or after six months; AWS states that the account closes at the end of the Free Plan unless upgraded. Check the account console before provisioning.

Install dependencies from this directory:

```sh
pnpm install --frozen-lockfile
```

## Configuration

Set the CDK target account and region using the AWS CLI profile or environment, and configure the required budget email. No email address is checked into the repository or assumed by the CDK app.

| Variable | Default | Purpose |
| --- | --- | --- |
| `CDK_DEFAULT_ACCOUNT` | AWS CLI account | Target AWS account. |
| `CDK_DEFAULT_REGION` | AWS CLI region | Target AWS region. |
| `LIVEORDER_BUDGET_EMAIL` | Required | Recipient for 50%, 80%, and 100% actual monthly cost alerts. |
| `LIVEORDER_GITHUB_REPOSITORY` | `Sylvester-Ad/live-order` | Exact repository trusted by GitHub OIDC. |
| `LIVEORDER_GITHUB_ENVIRONMENT` | `production` | Exact GitHub Environment claim allowed to assume the deploy role. Configure environment protection and approved deployment branches in GitHub. |
| `LIVEORDER_INSTANCE_TYPE` | `t4g.small` | ARM64 Graviton instance type. Select an ARM-compatible type. |
| `LIVEORDER_DATA_VOLUME_GIB` | `30` | Minimum 20 GiB encrypted gp3 volume mounted as Docker's data root. |
| `LIVEORDER_COMPOSE_VERSION` | `2.39.4` | Pinned Compose v2 plugin installed on AL2023. |

The example below uses a reserved `.invalid` address only for local synthesis. Replace it with the real notification address before deployment:

```sh
export CDK_DEFAULT_ACCOUNT="<12-digit-account-id>"
export CDK_DEFAULT_REGION="<aws-region>"
export LIVEORDER_BUDGET_EMAIL="your-address@example.com"
export LIVEORDER_GITHUB_REPOSITORY="Sylvester-Ad/live-order"
export LIVEORDER_GITHUB_ENVIRONMENT="production"
```

The stack deliberately requires `LIVEORDER_BUDGET_EMAIL`, rather than synthesizing a budget without working notifications.

## Defined resources

- One VPC, one public subnet in one Availability Zone, and an Internet Gateway. There are no NAT Gateways, load balancers, or private subnets.
- CDK uses a short-lived custom-resource Lambda during stack lifecycle operations to remove rules from the VPC's default security group; it is not an application runtime service.
- One Amazon Linux 2023 ARM64 EC2 instance (default `t4g.small`), one Elastic IP, and a security group allowing public inbound TCP 80 and 443 only, with outbound TCP 443 for AWS APIs and application dependencies. There is no SSH ingress. Instance metadata requires IMDSv2, disables metadata tags, and uses hop limit 1.
- The EC2 user data installs Docker and the pinned Docker Compose plugin, then mounts a separate encrypted gp3 EBS volume at `/var/lib/docker` before enabling Docker. It identifies the volume by its EBS volume ID, formats it only when blank, and refuses an unexpected filesystem. The volume is retained if the stack is deleted. Thus the existing Compose named volumes and images reside on this persistent EBS data volume without changing `compose.yaml`.
- A private, versioned, SSE-S3 backup bucket with Block Public Access, SSL enforcement, 90-day current and noncurrent object expiration, and a seven-day incomplete multipart-upload cleanup. The bucket is retained on stack deletion. Its lifecycle rule is restricted to `liveorder/backups/sqlite/`.
- An EC2 role with the AWS-managed `AmazonSSMManagedInstanceCore` policy, container log write access scoped to one log group, and only `s3:PutObject` scoped to the application backup prefix. It has no S3 list, get, or delete permission.
- A separate account-trusted, read-only backup recovery role with prefix-scoped list and object/version read permissions. No identity is granted permission to assume it by this stack; assign that permission only to designated recovery operators.
- A GitHub OIDC provider and deploy role restricted to the configured repository and GitHub Environment. The role can invoke `AWS-RunShellScript` on the one created EC2 instance and poll that command's invocation result. Shell command execution is root-equivalent; protect the GitHub `production` Environment with approvals and deployment-branch restrictions. No long-lived AWS key is needed.
- A CloudWatch log group for Docker container stdout/stderr with 30-day retention. Docker uses the `awslogs` driver in non-blocking mode. The instance role can create streams and put events only in this group.
- A $50 monthly cost budget with actual spend notifications at 50%, 80%, and 100%. Credits are excluded so the alerts reflect gross cost before credits. The budget is an alert, not a spending cap.

The instance is prepared for the existing two-service Compose deployment; this milestone does not clone the application, write `.env`, provision Cloudinary values, apply database migrations, start the application, or create a GitHub Actions workflow. Use a controlled later deployment stage for those operations. The stack does not create a DNS name. The Elastic IP can be reached over HTTP initially; Caddy HTTPS requires a hostname, working DNS, and ports 80/443 reachable publicly.

## Validate locally

```sh
pnpm typecheck
pnpm test
LIVEORDER_BUDGET_EMAIL="budget-test@example.invalid" pnpm synth
```

`pnpm synth` writes the CloudFormation template to `cdk.out/` and does not contact AWS or create resources. `pnpm diff` requires AWS credentials and may perform read-only lookups; it does not deploy.

## Deploy only after infrastructure review

CDK environments must be bootstrapped before deploying. Bootstrap creates CDK support resources (including an S3 asset bucket and IAM roles); this is separate from the LiveOrder stack. To avoid the optional customer-managed bootstrap KMS key, use `--no-bootstrap-customer-key`.

After reviewing the synthesized template and confirming the account plan, cost, email, region, GitHub Environment, and instance type, the commands will be:

```sh
pnpm exec cdk bootstrap "aws://${CDK_DEFAULT_ACCOUNT}/${CDK_DEFAULT_REGION}" --no-bootstrap-customer-key
pnpm deploy
```

These commands are documented for the later approved deployment only. They have not been run as part of this implementation task.

After deployment, confirm the email recipient through the AWS budget verification message before relying on notifications. Use the stack outputs to find the instance, static IP, bucket, log group, and recovery-role ARN. GitHub's `production` Environment must be created with the same name and protected against unreviewed branches. If an IAM GitHub OIDC provider for `token.actions.githubusercontent.com` already exists in the account, import/configure it rather than attempting to create a duplicate.

## Secrets and SSM administration

Do not store application secrets in CDK context, user data, CloudFormation parameters, Docker build arguments, or GitHub workflow logs. A later deployment task should select and configure the runtime secret-delivery method before the app starts. No AWS access keys are installed on the instance. The EC2 role uses its instance profile for AWS API access.

Use Session Manager, which does not require inbound SSH:

```sh
aws ssm start-session --target "<ApplicationInstanceId>" --region "$CDK_DEFAULT_REGION"
```

The deployment role's `ssm:GetCommandInvocation` permission must currently use `Resource: "*"` because that API does not support resource-level authorization. The command-send permission is restricted to the AWS-owned `AWS-RunShellScript` document and this instance. Treat command output as potentially sensitive and do not pass secrets as command parameters.

## Cost and limits

The default `t4g.small` is an ARM64 burstable instance with 2 GiB RAM. Verify the official Docker images and native SQLite module on ARM64 before launch; the current app uses a native `better-sqlite3` binding. The instance type and data volume size are configurable. A small instance may be inadequate for building images locally or for a production increase in traffic; prefer building elsewhere in a later CI stage.

Costs vary by region, uptime, storage, tax, and data transfer. The main recurring drivers are EC2 compute, the 12 GiB encrypted root gp3 volume, the retained data gp3 volume, the public IPv4 address/Elastic IP, and CloudWatch log ingestion/storage. S3 backup storage and internet egress can also grow with database size, backup frequency, and customer traffic. The $50 budget and alerts do not prevent charges. Credits are finite and do not establish that every resource is available on the Free Plan. Verify current regional prices and plan eligibility in AWS before bootstrapping or deployment.

## Teardown and retained data

After an explicit teardown decision:

```sh
pnpm exec cdk destroy
```

The backup bucket and Docker data volume are intentionally retained. Deleting the stack does not delete their data, so they can continue to incur storage costs. Before teardown, decide whether to keep or securely remove them. To reuse a retained Docker volume after stack recreation, an operator must explicitly identify and reattach the original volume in the same Availability Zone; the new stack will create a new data volume and will not automatically adopt the retained one. The GitHub OIDC provider is also retained; reuse it instead of creating a duplicate on a future stack deployment. The Elastic IP is released with the stack.

No stack has been deployed and no AWS resources have been created by these files.
