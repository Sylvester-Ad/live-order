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
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_logs as logs,
  aws_s3 as s3,
} from "aws-cdk-lib";
import { Construct } from "constructs";

export interface LiveOrderStackProps extends StackProps {
  readonly budgetEmail?: string;
  readonly githubRepository: string;
  readonly githubEnvironment: string;
  readonly instanceType: string;
  readonly dataVolumeGiB: number;
  readonly composeVersion: string;
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
    if (!/^[A-Za-z0-9_-]+$/.test(props.githubEnvironment)) {
      throw new Error("LIVEORDER_GITHUB_ENVIRONMENT must contain only letters, numbers, underscores, or hyphens.");
    }
    if (!Number.isInteger(props.dataVolumeGiB) || props.dataVolumeGiB < 20) {
      throw new Error("LIVEORDER_DATA_VOLUME_GIB must be an integer of at least 20 GiB.");
    }
    if (!/^\d+\.\d+\.\d+$/.test(props.composeVersion)) {
      throw new Error("LIVEORDER_COMPOSE_VERSION must be a pinned semantic version.");
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
      instanceType: new ec2.InstanceType(props.instanceType),
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
      "dnf install -y docker curl xfsprogs",
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
    );

    const publicIp = new ec2.CfnEIP(this, "ApplicationElasticIp", { domain: "vpc" });
    new ec2.CfnEIPAssociation(this, "ApplicationElasticIpAssociation", {
      allocationId: publicIp.attrAllocationId,
      instanceId: instance.instanceId,
    });

    this.addGithubDeploymentRole(instance, props.githubRepository, props.githubEnvironment);

    new CfnOutput(this, "ApplicationPublicIp", { value: publicIp.attrPublicIp });
    new CfnOutput(this, "ApplicationInstanceId", { value: instance.instanceId });
    new CfnOutput(this, "BackupBucketName", { value: backupBucket.bucketName });
    new CfnOutput(this, "BackupRecoveryRoleArn", { value: recoveryRole.roleArn });
    new CfnOutput(this, "ContainerLogGroupName", { value: logGroup.logGroupName });
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
    environmentName: string,
  ): void {
    const provider = new iam.CfnOIDCProvider(this, "GitHubOidcProvider", {
      url: "https://token.actions.githubusercontent.com",
      clientIdList: ["sts.amazonaws.com"],
    });
    const subject = `repo:${repository}:environment:${environmentName}`;
    const role = new iam.Role(this, "GitHubDeploymentRole", {
      roleName: "LiveOrderGitHubDeployment",
      description: "GitHub Actions may invoke a deployment command on the one LiveOrder instance.",
      assumedBy: new iam.FederatedPrincipal(
        provider.ref,
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
  }
}
