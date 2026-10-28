import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ArnFormat,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Size,
  Stack,
  StackProps,
  Tags,
  aws_budgets as budgets,
  aws_cloudwatch as cloudwatch,
  aws_cloudwatch_actions as cloudwatch_actions,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_iam as iam,
  aws_logs as logs,
  aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
  aws_sns as sns,
} from "aws-cdk-lib";
import { Construct } from "constructs";

const backupScript = readFileSync(new URL("../scripts/liveorder-backup.sh", import.meta.url), "utf8").trimEnd();
const deploymentScript = readFileSync(new URL("../scripts/liveorder-deploy.sh", import.meta.url), "utf8").trimEnd();
const backupService = readFileSync(new URL("../systemd/liveorder-backup.service", import.meta.url), "utf8").trimEnd();
const backupTimer = readFileSync(new URL("../systemd/liveorder-backup.timer", import.meta.url), "utf8").trimEnd();
const restoreReceiver = readFileSync(new URL("../scripts/liveorder-restore-receiver.py", import.meta.url), "utf8").trimEnd();
const restoreReceiverService = readFileSync(
  new URL("../systemd/liveorder-restore-receiver.service", import.meta.url),
  "utf8",
).trimEnd();

export interface LiveOrderStackProps extends StackProps {
  readonly budgetEmail?: string;
  readonly githubRepository: string;
  readonly githubOwnerId: string;
  readonly githubRepositoryId: string;
  readonly githubEnvironment: string;
  readonly githubOidcProviderArn?: string;
  readonly instanceType: string;
  readonly dataVolumeGiB: number;
  readonly composeVersion: string;
  readonly runtimeSecretName: string;
  readonly siteAddress?: string;
}

export class LiveOrderStack extends Stack {
  constructor(scope: Construct, id: string, props: LiveOrderStackProps) {
    super(scope, id, props);

    if (!props.budgetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(props.budgetEmail)) {
      throw new Error("Set LIVEORDER_BUDGET_EMAIL to a valid notification address before synthesis.");
    }
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(props.githubRepository)) {
      throw new Error("LIVEORDER_GITHUB_REPOSITORY must use the owner/repository format.");
    }
    if (!/^\d+$/.test(props.githubOwnerId)) {
      throw new Error("LIVEORDER_GITHUB_OWNER_ID must contain the numeric GitHub owner ID.");
    }
    if (!/^\d+$/.test(props.githubRepositoryId)) {
      throw new Error("LIVEORDER_GITHUB_REPOSITORY_ID must contain the numeric GitHub repository ID.");
    }
    if (!/^[A-Za-z0-9_-]+$/.test(props.githubEnvironment)) {
      throw new Error("LIVEORDER_GITHUB_ENVIRONMENT must contain only letters, numbers, underscores, or hyphens.");
    }
    if (!Number.isInteger(props.dataVolumeGiB) || props.dataVolumeGiB < 20) {
      throw new Error("LIVEORDER_DATA_VOLUME_GIB must be an integer of at least 20 GiB.");
    }
    if (!/^\d+\.\d+\.\d+$/.test(props.composeVersion)) {
      throw new Error("LIVEORDER_COMPOSE_VERSION must be a pinned semantic version.");
    }
    if (!/^[A-Za-z0-9/_+=.@-]{1,512}$/.test(props.runtimeSecretName)) {
      throw new Error("LIVEORDER_RUNTIME_SECRET_NAME must be a valid Secrets Manager secret name.");
    }
    const instanceType = new ec2.InstanceType(props.instanceType);
    if (instanceType.architecture !== ec2.InstanceArchitecture.ARM_64) {
      throw new Error("LIVEORDER_INSTANCE_TYPE must use ARM64 architecture.");
    }
    if (
      props.siteAddress !== undefined
      && props.siteAddress !== ":80"
      && !/^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}(?::\d{1,5})?$/.test(props.siteAddress)
    ) {
      throw new Error("LIVEORDER_SITE_ADDRESS must be :80 or a valid hostname with an optional port.");
    }
    const sitePort = props.siteAddress?.match(/:(\d+)$/)?.[1];
    if (sitePort && (Number(sitePort) < 1 || Number(sitePort) > 65535)) {
      throw new Error("LIVEORDER_SITE_ADDRESS port must be between 1 and 65535.");
    }

    this.addMonthlyBudget(props.budgetEmail);

    const vpc = new ec2.Vpc(this, "ApplicationVpc", {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    const backupBucket = new s3.Bucket(this, "BackupBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      versioned: true,
      lifecycleRules: [
        {
          id: "ExpireLiveOrderBackupsAfter90Days",
          prefix: "liveorder/backups/sqlite/",
          expiration: Duration.days(90),
          noncurrentVersionExpiration: Duration.days(90),
          abortIncompleteMultipartUploadAfter: Duration.days(7),
        },
        {
          id: "CleanExpiredLiveOrderBackupDeleteMarkers",
          prefix: "liveorder/backups/sqlite/",
          expiredObjectDeleteMarker: true,
        },
      ],
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    const backendRepository = this.createImageRepository("BackendImageRepository", "liveorder/backend");
    const caddyRepository = this.createImageRepository("CaddyImageRepository", "liveorder/caddy");

    const runtimeSecret = new secretsmanager.CfnSecret(this, "RuntimeSecret", {
      name: props.runtimeSecretName,
      description: "LiveOrder Cloudinary runtime credentials; the value is added after deployment.",
    });
    runtimeSecret.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const logGroup = new logs.LogGroup(this, "ContainerLogs", {
      logGroupName: "/liveorder/containers",
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const instanceRole = new iam.Role(this, "ApplicationInstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      description: "LiveOrder EC2 runtime: SSM administration, container logs, and backup uploads.",
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
      ],
    });
    instanceRole.addToPolicy(new iam.PolicyStatement({
      sid: "WriteContainerLogs",
      actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
      resources: [`${logGroup.logGroupArn}:*`],
    }));
    instanceRole.addToPolicy(new iam.PolicyStatement({
      sid: "UploadLiveOrderBackups",
      actions: ["s3:PutObject"],
      resources: [backupBucket.arnForObjects("liveorder/backups/sqlite/*")],
    }));
    instanceRole.addToPolicy(new iam.PolicyStatement({
      sid: "ReadRuntimeSecret",
      actions: ["secretsmanager:GetSecretValue"],
      resources: [runtimeSecret.ref],
    }));
    instanceRole.addToPolicy(new iam.PolicyStatement({
      sid: "PullLiveOrderImages",
      actions: ["ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"],
      resources: [backendRepository.repositoryArn, caddyRepository.repositoryArn],
    }));
    instanceRole.addToPolicy(new iam.PolicyStatement({
      sid: "AuthenticateToEcr",
      actions: ["ecr:GetAuthorizationToken"],
      resources: ["*"],
    }));
    instanceRole.addToPolicy(new iam.PolicyStatement({
      sid: "PublishBackupHealthMetric",
      actions: ["cloudwatch:PutMetricData"],
      resources: ["*"],
      conditions: { StringEquals: { "cloudwatch:namespace": "LiveOrder/Backups" } },
    }));

    const recoveryRole = new iam.Role(this, "BackupRecoveryRole", {
      roleName: "LiveOrderBackupRecovery",
      assumedBy: new iam.AccountPrincipal(this.account),
      description: "Read-only access for operators restoring LiveOrder SQLite backups.",
    });
    recoveryRole.addToPolicy(new iam.PolicyStatement({
      sid: "ListBackupObjects",
      actions: ["s3:ListBucket", "s3:ListBucketVersions"],
      resources: [backupBucket.bucketArn],
      conditions: {
        StringLike: {
          "s3:prefix": ["liveorder/backups/sqlite", "liveorder/backups/sqlite/*"],
        },
      },
    }));
    recoveryRole.addToPolicy(new iam.PolicyStatement({
      sid: "ReadBackupObjects",
      actions: ["s3:GetObject", "s3:GetObjectVersion"],
      resources: [backupBucket.arnForObjects("liveorder/backups/sqlite/*")],
    }));

    const securityGroup = new ec2.SecurityGroup(this, "ApplicationSecurityGroup", {
      vpc,
      description: "Public web traffic to Caddy only; administration uses SSM.",
      allowAllOutbound: false,
    });
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP for Caddy and ACME");
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS for Caddy");
    securityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS for AWS APIs and application dependencies");

    const instance = new ec2.Instance(this, "ApplicationInstance", {
      vpc,
      vpcSubnets: { subnets: [vpc.publicSubnets[0]] },
      availabilityZone: vpc.publicSubnets[0].availabilityZone,
      instanceType,
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      role: instanceRole,
      securityGroup,
      requireImdsv2: true,
      associatePublicIpAddress: true,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(12, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
            deleteOnTermination: true,
          }),
        },
      ],
    });
    const cfnInstance = instance.node.defaultChild as ec2.CfnInstance;
    cfnInstance.metadataOptions = {
      httpEndpoint: "enabled",
      httpTokens: "required",
      httpPutResponseHopLimit: 1,
      instanceMetadataTags: "disabled",
    };
    Tags.of(instance).add("LiveOrder:ManagedBy", "cdk");

    const dataVolume = new ec2.Volume(this, "DockerDataVolume", {
      availabilityZone: vpc.publicSubnets[0].availabilityZone,
      size: Size.gibibytes(props.dataVolumeGiB),
      volumeType: ec2.EbsDeviceVolumeType.GP3,
      encrypted: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const dataVolumeAttachment = new ec2.CfnVolumeAttachment(this, "DockerDataVolumeAttachment", {
      device: "/dev/sdf",
      instanceId: instance.instanceId,
      volumeId: dataVolume.volumeId,
    });

    instance.addUserData(
      "set -euo pipefail",
      "dnf install -y docker curl xfsprogs awscli jq util-linux python3",
      "mkdir -p /var/lib/docker",
      `DATA_VOLUME_ID='${dataVolume.volumeId}'`,
      "DATA_DEVICE=''",
      "for attempt in $(seq 1 60); do",
      "  for candidate in /dev/nvme*n1; do",
      "    [ -e \"$candidate\" ] || continue",
      "    if /sbin/ebsnvme-id \"$candidate\" 2>/dev/null | grep -Fq \"Volume ID: $DATA_VOLUME_ID\"; then DATA_DEVICE=\"$candidate\"; break 2; fi",
      "  done",
      "  sleep 2",
      "done",
      "test -n \"$DATA_DEVICE\" || { echo 'LiveOrder data volume not found' >&2; exit 1; }",
      "FILESYSTEM=$(blkid -s TYPE -o value \"$DATA_DEVICE\" || true)",
      "if [ -z \"$FILESYSTEM\" ]; then mkfs.xfs \"$DATA_DEVICE\"; FILESYSTEM=xfs; fi",
      "test \"$FILESYSTEM\" = xfs || { echo 'Unexpected filesystem on LiveOrder data volume' >&2; exit 1; }",
      "DATA_UUID=$(blkid -s UUID -o value \"$DATA_DEVICE\")",
      "grep -q \"UUID=$DATA_UUID /var/lib/docker \" /etc/fstab || echo \"UUID=$DATA_UUID /var/lib/docker xfs defaults,nofail 0 2\" >> /etc/fstab",
      "mount /var/lib/docker",
      "mkdir -p /etc/docker",
      "cat > /etc/docker/daemon.json <<'DOCKER_CONFIG'",
      JSON.stringify({
        "log-driver": "awslogs",
        "log-opts": {
          "awslogs-region": this.region,
          "awslogs-group": logGroup.logGroupName,
          "awslogs-create-group": "false",
          mode: "non-blocking",
          "max-buffer-size": "4m",
        },
      }),
      "DOCKER_CONFIG",
      "install -d -m 0755 /usr/local/lib/docker/cli-plugins",
      `curl --fail --silent --show-error --location --retry 3 'https://github.com/docker/compose/releases/download/v${props.composeVersion}/docker-compose-linux-aarch64' -o /usr/local/lib/docker/cli-plugins/docker-compose`,
      "chmod 0755 /usr/local/lib/docker/cli-plugins/docker-compose",
      "usermod -aG docker ec2-user",
      "systemctl enable --now docker",
      "docker compose version",
      "mkdir -p /opt/liveorder",
      "chown ec2-user:ec2-user /opt/liveorder",
      "install -d -m 0700 /var/lib/docker/liveorder-restore-inbox",
      "install -d -m 0750 /etc/liveorder",
      "cat > /etc/liveorder/runtime-config <<'LIVEORDER_RUNTIME_CONFIG'",
      `SECRET_ARN='${runtimeSecret.ref}'`,
      `AWS_REGION='${this.region}'`,
      "LIVEORDER_RUNTIME_CONFIG",
      "cat > /etc/liveorder/compose.env <<'LIVEORDER_BASE_ENV'",
      `AWS_REGION=${this.region}`,
      `AWS_DEFAULT_REGION=${this.region}`,
      `LIVEORDER_BACKUP_BUCKET=${backupBucket.bucketName}`,
      "LIVEORDER_BACKUP_PREFIX=liveorder/backups/sqlite",
      `LIVEORDER_BACKEND_REPOSITORY=${backendRepository.repositoryUri}`,
      `LIVEORDER_CADDY_REPOSITORY=${caddyRepository.repositoryUri}`,
      `SITE_ADDRESS=${props.siteAddress ?? ":80"}`,
      "HTTP_PORT=80",
      "HTTPS_PORT=443",
      `LIVEORDER_RUNTIME_SECRET_NAME=${props.runtimeSecretName}`,
      "LIVEORDER_BASE_ENV",
      "chmod 0640 /etc/liveorder/runtime-config /etc/liveorder/compose.env",
      "cat > /usr/local/sbin/liveorder-sync-runtime-env <<'LIVEORDER_SYNC_SCRIPT'",
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "umask 077",
      "source /etc/liveorder/runtime-config",
      "temporary_file=$(mktemp /opt/liveorder/.env.XXXXXX)",
      "trap 'rm -f \"$temporary_file\"' EXIT",
      "cat /etc/liveorder/compose.env > \"$temporary_file\"",
      "printf '\\n' >> \"$temporary_file\"",
      `aws secretsmanager get-secret-value --region "$AWS_REGION" --secret-id "$SECRET_ARN" --query SecretString --output text | jq -er '
  def dotenv: (tojson | .[1:-1]) | gsub("\\\\$"; "$$");
  if (.CLOUDINARY_CLOUD_NAME | type) == "string" and (.CLOUDINARY_CLOUD_NAME | length) > 0
     and (.CLOUDINARY_API_KEY | type) == "string" and (.CLOUDINARY_API_KEY | length) > 0
     and (.CLOUDINARY_API_SECRET | type) == "string" and (.CLOUDINARY_API_SECRET | length) > 0
  then
    "CLOUDINARY_CLOUD_NAME=\\"\\(.CLOUDINARY_CLOUD_NAME | dotenv)\\"\\nCLOUDINARY_API_KEY=\\"\\(.CLOUDINARY_API_KEY | dotenv)\\"\\nCLOUDINARY_API_SECRET=\\"\\(.CLOUDINARY_API_SECRET | dotenv)\\""
  else error("Runtime secret must contain non-empty Cloudinary credential strings") end
' >> "$temporary_file"`,
      "chown ec2-user:ec2-user \"$temporary_file\"",
      "chmod 0600 \"$temporary_file\"",
      "mv -f \"$temporary_file\" /opt/liveorder/.env",
      "trap - EXIT",
      "LIVEORDER_SYNC_SCRIPT",
      "chmod 0750 /usr/local/sbin/liveorder-sync-runtime-env",
      "cat > /usr/local/sbin/liveorder-backup <<'LIVEORDER_BACKUP_SCRIPT'",
      backupScript,
      "LIVEORDER_BACKUP_SCRIPT",
      "chmod 0750 /usr/local/sbin/liveorder-backup",
      "cat > /usr/local/sbin/liveorder-deploy <<'LIVEORDER_DEPLOY_SCRIPT'",
      deploymentScript,
      "LIVEORDER_DEPLOY_SCRIPT",
      "chmod 0750 /usr/local/sbin/liveorder-deploy",
      "cat > /etc/systemd/system/liveorder-backup.service <<'LIVEORDER_BACKUP_SERVICE'",
      backupService,
      "LIVEORDER_BACKUP_SERVICE",
      "cat > /etc/systemd/system/liveorder-backup.timer <<'LIVEORDER_BACKUP_TIMER'",
      backupTimer,
      "LIVEORDER_BACKUP_TIMER",
      "systemctl daemon-reload",
      "systemctl enable --now liveorder-backup.timer",
      "cat > /usr/local/sbin/liveorder-restore-receiver <<'LIVEORDER_RESTORE_RECEIVER'",
      restoreReceiver,
      "LIVEORDER_RESTORE_RECEIVER",
      "chmod 0750 /usr/local/sbin/liveorder-restore-receiver",
      "cat > /etc/systemd/system/liveorder-restore-receiver.service <<'LIVEORDER_RESTORE_SERVICE'",
      restoreReceiverService,
      "LIVEORDER_RESTORE_SERVICE",
      "systemctl daemon-reload",
    );

    const backupNotificationTopic = new sns.Topic(this, "BackupFailureTopic", {
      topicName: "LiveOrderBackupFailures",
      displayName: "LiveOrder backup failures",
    });
    new sns.Subscription(this, "BackupFailureEmail", {
      topic: backupNotificationTopic,
      protocol: sns.SubscriptionProtocol.EMAIL,
      endpoint: props.budgetEmail,
    });
    const backupFailureAlarm = new cloudwatch.Alarm(this, "BackupFailureAlarm", {
      alarmName: "LiveOrder-BackupFailure",
      alarmDescription: "A scheduled LiveOrder SQLite backup failed.",
      metric: new cloudwatch.Metric({
        namespace: "LiveOrder/Backups",
        metricName: "BackupFailure",
        statistic: "Maximum",
        period: Duration.days(1),
      }),
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    backupFailureAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(backupNotificationTopic));
    backupNotificationTopic.addToResourcePolicy(new iam.PolicyStatement({
      sid: "AllowLiveOrderBackupAlarmToPublish",
      principals: [new iam.ServicePrincipal("cloudwatch.amazonaws.com")],
      actions: ["sns:Publish"],
      resources: [backupNotificationTopic.topicArn],
      conditions: {
        ArnEquals: { "aws:SourceArn": backupFailureAlarm.alarmArn },
        StringEquals: { "aws:SourceAccount": this.account },
      },
    }));

    const publicIp = new ec2.CfnEIP(this, "ApplicationElasticIp", { domain: "vpc" });
    new ec2.CfnEIPAssociation(this, "ApplicationElasticIpAssociation", {
      allocationId: publicIp.attrAllocationId,
      instanceId: instance.instanceId,
    });

    const deploymentRole = this.addGithubDeploymentRole(
      instance,
      props.githubRepository,
      props.githubOwnerId,
      props.githubRepositoryId,
      props.githubEnvironment,
      props.githubOidcProviderArn,
      backendRepository,
      caddyRepository,
    );

    new CfnOutput(this, "ApplicationPublicIp", { value: publicIp.attrPublicIp });
    new CfnOutput(this, "ApplicationInstanceId", { value: instance.instanceId });
    new CfnOutput(this, "BackendImageRepositoryUri", { value: backendRepository.repositoryUri });
    new CfnOutput(this, "CaddyImageRepositoryUri", { value: caddyRepository.repositoryUri });
    new CfnOutput(this, "BackupBucketName", { value: backupBucket.bucketName });
    new CfnOutput(this, "BackupRecoveryRoleArn", { value: recoveryRole.roleArn });
    new CfnOutput(this, "ContainerLogGroupName", { value: logGroup.logGroupName });
    new CfnOutput(this, "GitHubDeploymentRoleArn", { value: deploymentRole.roleArn });
  }

  private createImageRepository(id: string, repositoryName: string): ecr.Repository {
    const repository = new ecr.Repository(this, id, {
      repositoryName,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      imageScanOnPush: true,
      lifecycleRules: [{ maxImageCount: 10, description: "Retain the ten most recent releases." }],
      removalPolicy: RemovalPolicy.RETAIN,
    });
    return repository;
  }

  private addMonthlyBudget(email: string): void {
    const notifications = [50, 80, 100].map((threshold) => ({
      notification: {
        notificationType: "ACTUAL",
        comparisonOperator: "GREATER_THAN",
        thresholdType: "PERCENTAGE",
        threshold,
      },
      subscribers: [{ subscriptionType: "EMAIL", address: email }],
    }));

    new budgets.CfnBudget(this, "MonthlyCostBudget", {
      budget: {
        budgetName: "LiveOrder-Monthly-USD-50",
        budgetLimit: { amount: 50, unit: "USD" },
        budgetType: "COST",
        timeUnit: "MONTHLY",
        costTypes: {
          includeCredit: false,
        },
      },
      notificationsWithSubscribers: notifications,
    });
  }

  private addGithubDeploymentRole(
    instance: ec2.Instance,
    repository: string,
    ownerId: string,
    repositoryId: string,
    environmentName: string,
    existingProviderArn: string | undefined,
    backendRepository: ecr.Repository,
    caddyRepository: ecr.Repository,
  ): iam.Role {
    let providerArn: string;
    if (existingProviderArn?.trim()) {
      if (!/^arn:[A-Za-z0-9-]+:iam::\d{12}:oidc-provider\/token\.actions\.githubusercontent\.com$/.test(existingProviderArn)) {
        throw new Error("LIVEORDER_GITHUB_OIDC_PROVIDER_ARN must identify GitHub's OIDC provider in this AWS partition.");
      }
      providerArn = existingProviderArn.trim();
    } else {
      const provider = new iam.CfnOIDCProvider(this, "GitHubOidcProvider", {
        url: "https://token.actions.githubusercontent.com",
        clientIdList: ["sts.amazonaws.com"],
      });
      providerArn = provider.ref;
    }
    const [owner, repositoryName] = repository.split("/");
    const subject = `repo:${owner}@${ownerId}/${repositoryName}@${repositoryId}:environment:${environmentName}`;
    const role = new iam.Role(this, "GitHubDeploymentRole", {
      roleName: "LiveOrderGitHubDeployment",
      description: "GitHub Actions may invoke a deployment command on the one LiveOrder instance.",
      assumedBy: new iam.FederatedPrincipal(
        providerArn,
        {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            "token.actions.githubusercontent.com:sub": subject,
          },
        },
        "sts:AssumeRoleWithWebIdentity",
      ),
    });
    const documentArn = Stack.of(this).formatArn({
      service: "ssm",
      region: this.region,
      account: "",
      resource: "document",
      resourceName: "AWS-RunShellScript",
      arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
    });
    const instanceArn = Stack.of(this).formatArn({
      service: "ec2",
      region: this.region,
      resource: "instance",
      resourceName: instance.instanceId,
      arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
    });
    role.addToPolicy(new iam.PolicyStatement({
      sid: "RunDeploymentOnLiveOrderInstance",
      actions: ["ssm:SendCommand"],
      resources: [documentArn, instanceArn],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      sid: "PollDeploymentCommand",
      actions: ["ssm:GetCommandInvocation"],
      resources: ["*"],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      sid: "PushLiveOrderImages",
      actions: [
        "ecr:BatchCheckLayerAvailability",
        "ecr:BatchGetImage",
        "ecr:CompleteLayerUpload",
        "ecr:DescribeImages",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart",
      ],
      resources: [backendRepository.repositoryArn, caddyRepository.repositoryArn],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      sid: "AuthenticateToEcr",
      actions: ["ecr:GetAuthorizationToken"],
      resources: ["*"],
    }));
    return role;
  }
}
