import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { LiveOrderStack } from "../lib/liveorder-stack.js";

function synthTemplate(githubOidcProviderArn?: string, initializeDataVolume = false): Template {
  const app = new App();
  const stack = new LiveOrderStack(app, "TestLiveOrder", {
    env: { account: "111122223333", region: "us-east-1" },
    budgetEmail: "budget-test@example.invalid",
    githubRepository: "Sylvester-Ad/live-order",
    githubOwnerId: "123608416",
    githubRepositoryId: "1403043851",
    githubEnvironment: "production",
    instanceType: "t4g.small",
    dataVolumeGiB: 30,
    initializeDataVolume,
    composeVersion: "2.39.4",
    runtimeSecretName: "liveorder/test/runtime",
    githubOidcProviderArn,
  });
  return Template.fromStack(stack);
}

function encodedUserDataSize(instance: Record<string, unknown>): number {
  const userData = instance.Properties as {
    UserData?: {
      "Fn::Base64"?: {
        "Fn::Join"?: [string, unknown[]];
      };
    };
  } | undefined;
  const joinedParts = userData?.UserData?.["Fn::Base64"]?.["Fn::Join"];
  assert.ok(joinedParts, "Expected EC2 user data to use Fn::Base64 and Fn::Join");

  const renderPart = (part: unknown): string => {
    if (typeof part === "string") return part;
    if (typeof part !== "object" || part === null) return "";
    const join = (part as { "Fn::Join"?: [string, unknown[]] })["Fn::Join"];
    // Reserve room for unresolved CloudFormation values when bounding encoded user-data size.
    if (!join) return "x".repeat(256);
    return join[1].map(renderPart).join(join[0]);
  };
  const userDataText = joinedParts[1].map(renderPart).join(joinedParts[0]);
  return Buffer.byteLength(Buffer.from(userDataText).toString("base64"), "utf8");
}

test("provisions a cost-conscious VPC with no NAT gateway and a single instance", () => {
  const template = synthTemplate();
  template.resourceCountIs("AWS::EC2::NatGateway", 0);
  template.resourceCountIs("AWS::EC2::Instance", 1);
  template.hasResourceProperties("AWS::EC2::Instance", {
    InstanceType: "t4g.small",
    MetadataOptions: {
      HttpEndpoint: "enabled",
      HttpTokens: "required",
      HttpPutResponseHopLimit: 1,
      InstanceMetadataTags: "disabled",
    },
  });
});

test("does not force EC2 replacement when user data changes", () => {
  const stackSource = readFileSync(new URL("../lib/liveorder-stack.ts", import.meta.url), "utf8");
  assert.match(stackSource, /userDataCausesReplacement:\s*false/);
});

test("publishes only HTTP and HTTPS ingress", () => {
  const template = synthTemplate();
  template.hasResourceProperties("AWS::EC2::SecurityGroup", {
    SecurityGroupIngress: Match.arrayEquals([
      {
        CidrIp: "0.0.0.0/0",
        Description: "HTTP for Caddy and ACME",
        FromPort: 80,
        IpProtocol: "tcp",
        ToPort: 80,
      },
      {
        CidrIp: "0.0.0.0/0",
        Description: "HTTPS for Caddy",
        FromPort: 443,
        IpProtocol: "tcp",
        ToPort: 443,
      },
    ]),
    SecurityGroupEgress: Match.arrayEquals([
      {
        CidrIp: "0.0.0.0/0",
        Description: "HTTPS for AWS APIs and application dependencies",
        FromPort: 443,
        IpProtocol: "tcp",
        ToPort: 443,
      },
    ]),
  });
});

test("creates a fresh encrypted data volume and provisions Docker Compose", () => {
  const template = synthTemplate(undefined, true);
  template.hasResourceProperties("AWS::EC2::Volume", {
    Encrypted: true,
    Size: 30,
    VolumeType: "gp3",
  });
  template.hasResource("AWS::EC2::Volume", {
    DeletionPolicy: "Delete",
    UpdateReplacePolicy: "Delete",
  });
  template.resourceCountIs("AWS::EC2::VolumeAttachment", 1);
  const resources = (template.toJSON() as {
    Resources: Record<string, { Type: string; Properties?: Record<string, unknown> }>;
  }).Resources;
  const instanceId = Object.entries(resources).find(([logicalId, resource]) =>
    resource.Type === "AWS::EC2::Instance" && logicalId.startsWith("ApplicationInstanceCleanStart"))?.[0];
  const volumeId = Object.entries(resources).find(([logicalId, resource]) =>
    resource.Type === "AWS::EC2::Volume" && logicalId.startsWith("DockerDataVolumeCleanStartFresh"))?.[0];
  const attachmentId = Object.entries(resources).find(([logicalId, resource]) =>
    resource.Type === "AWS::EC2::VolumeAttachment"
      && logicalId.startsWith("DockerDataVolumeAttachmentCleanStartFresh"))?.[0];
  assert.ok(instanceId, "Expected the clean-start EC2 instance");
  assert.ok(volumeId, "Expected a new clean-start data volume identity");
  assert.ok(attachmentId, "Expected a new clean-start volume attachment identity");
  assert.notEqual(volumeId, "DockerDataVolumeCleanStartEBEF200D");
  assert.notEqual(attachmentId, "DockerDataVolumeAttachmentCleanStart");
  assert.equal(resources.DockerDataVolumeCleanStartEBEF200D, undefined);
  assert.equal(resources.DockerDataVolumeAttachmentCleanStart, undefined);
  const attachment = resources[attachmentId];
  assert.deepEqual(attachment.Properties, {
    Device: "/dev/sdf",
    InstanceId: { Ref: instanceId },
    VolumeId: { Ref: volumeId },
  });
  template.hasResourceProperties("AWS::EC2::Instance", {
    UserData: Match.objectLike({
      "Fn::Base64": Match.objectLike({
        "Fn::Join": Match.arrayWith([
          Match.arrayWith([
            Match.stringLikeRegexp("aws s3 cp"),
          ]),
        ]),
      }),
    }),
  });
  const instance = Object.values(template.findResources("AWS::EC2::Instance"))[0];
  const userData = JSON.stringify(instance?.Properties?.UserData);
  assert.match(userData, /liveorder-bootstrap\.log/);
  assert.match(userData, /aws s3 cp/);
  assert.match(userData, /liveorder-bootstrap\.sh/);
  assert.match(userData, /INITIALIZE_DATA_VOLUME='true'/);
  assert.match(userData, new RegExp(volumeId));
  const encodedBytes = encodedUserDataSize(instance);
  assert.ok(encodedBytes < 20_000, `Encoded EC2 user data is ${encodedBytes} bytes`);
  assert.ok(encodedBytes < 25_600, `Encoded EC2 user data exceeds 25,600 bytes: ${encodedBytes}`);
});

test("grants the instance role read access to bootstrap assets only", () => {
  const template = synthTemplate();
  const policies = Object.values(template.findResources("AWS::IAM::Policy"));
  const bootstrapRead = policies.flatMap((policy) => {
    const properties = policy.Properties as {
      PolicyDocument?: { Statement?: Array<Record<string, unknown>> };
    } | undefined;
    return properties?.PolicyDocument?.Statement ?? [];
  }).find((statement) => statement.Sid === "ReadBootstrapAsset");
  assert.ok(bootstrapRead, "Expected a scoped S3 read permission for the bootstrap asset");
  assert.deepEqual(bootstrapRead.Action, "s3:GetObject");
  const resource = JSON.stringify(bootstrapRead.Resource);
  assert.match(resource, /\.zip/);
  assert.doesNotMatch(resource, /:\*"/);
});

test("synthesized bootstrap script is valid Bash and formats only with explicit opt-in", () => {
  const script = readFileSync(new URL("../scripts/liveorder-bootstrap.sh", import.meta.url), "utf8");
  const syntaxCheck = spawnSync("bash", ["-n"], { input: script, encoding: "utf8" });
  assert.equal(syntaxCheck.status, 0, syntaxCheck.stderr);
  const defaultUserData = JSON.stringify(
    Object.values(synthTemplate().findResources("AWS::EC2::Instance"))[0]?.Properties?.UserData,
  );
  assert.match(defaultUserData, /LIVEORDER_INITIALIZE_DATA_VOLUME='false'/);
  assert.match(script, /\[\[ "\$LIVEORDER_INITIALIZE_DATA_VOLUME" == true \]\]/);
  assert.match(script, /wipefs --no-act --noheadings/);
  assert.match(script, /refusing to format it/);
  assert.equal((script.match(/mkfs\.xfs "\$DATA_DEVICE"/g) ?? []).length, 1);
  assert.ok(script.indexOf("mount /var/lib/docker") < script.indexOf("dnf install -y docker"));
  assert.ok(script.indexOf("Requires=var-lib-docker.mount") < script.indexOf("dnf install -y docker"));
  assert.match(script, /dnf install -y amazon-ec2-utils xfsprogs awscli jq util-linux python3/);
  assert.doesNotMatch(script, /dnf install[^\n]*\bcurl\b/);
  assert.match(script, /command -v curl >\/dev\/null/);
  for (const requiredContent of [
    "amazon-ec2-utils",
    "docker info",
    "docker compose version",
    "/etc/liveorder/runtime-config",
    "/etc/liveorder/compose.env",
    "liveorder-backup.timer",
    "bootstrap-ready",
  ]) {
    assert.ok(script.includes(requiredContent), `Bootstrap is missing requirement: ${requiredContent}`);
  }
});

test("creates a private versioned S3 backup bucket with 90-day lifecycle", () => {
  const template = synthTemplate();
  template.hasResourceProperties("AWS::S3::Bucket", {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
    VersioningConfiguration: { Status: "Enabled" },
    OwnershipControls: {
      Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }],
    },
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [{
        ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" },
      }],
    },
    LifecycleConfiguration: {
      Rules: [Match.objectLike({
        Prefix: "liveorder/backups/sqlite/",
        ExpirationInDays: 90,
        NoncurrentVersionExpiration: { NoncurrentDays: 90 },
        AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
      }), Match.objectLike({
        Prefix: "liveorder/backups/sqlite/",
        ExpiredObjectDeleteMarker: true,
      })],
    },
  });
});

test("publishes immutable ARM64 image repositories with bounded retention", () => {
  const template = synthTemplate();
  template.resourceCountIs("AWS::ECR::Repository", 2);
  template.hasResourceProperties("AWS::ECR::Repository", {
    ImageTagMutability: "IMMUTABLE",
    ImageScanningConfiguration: { ScanOnPush: true },
    LifecyclePolicy: {
      LifecyclePolicyText: Match.stringLikeRegexp("imageCountMoreThan"),
    },
  });
  template.hasResource("AWS::ECR::Repository", {
    DeletionPolicy: "Retain",
  });
});

test("creates a runtime secret and grants the instance role read access", () => {
  const template = synthTemplate();
  template.resourceCountIs("AWS::SecretsManager::Secret", 1);
  template.hasResourceProperties("AWS::SecretsManager::Secret", {
    Name: "liveorder/test/runtime",
    Description: "LiveOrder Cloudinary runtime credentials; the value is added after deployment.",
  });
  const secret = Object.values(template.findResources("AWS::SecretsManager::Secret"))[0];
  assert.deepEqual(secret?.Properties, {
    Name: "liveorder/test/runtime",
    Description: "LiveOrder Cloudinary runtime credentials; the value is added after deployment.",
  });
  assert.equal(secret?.DeletionPolicy, "Retain");
  template.hasResourceProperties("AWS::IAM::Policy", {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: "secretsmanager:GetSecretValue",
          Resource: { Ref: "RuntimeSecret" },
        }),
      ]),
    },
  });
  const bootstrapScript = readFileSync(new URL("../scripts/liveorder-bootstrap.sh", import.meta.url), "utf8");
  assert.match(bootstrapScript, /LIVEORDER_RUNTIME_SECRET_ARN/);
  assert.match(bootstrapScript, /liveorder-sync-runtime-env\.sh/);
});

test("scopes backup writes to the application prefix and provides separate read-only recovery access", () => {
  const template = synthTemplate();
  template.hasResourceProperties("AWS::IAM::Policy", {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: "s3:PutObject",
          Resource: Match.objectLike({
            "Fn::Join": Match.arrayEquals([
              "",
              Match.arrayEquals([
                Match.anyValue(),
                "/liveorder/backups/sqlite/*",
              ]),
            ]),
          }),
        }),
      ]),
    },
  });
  template.hasResourceProperties("AWS::IAM::Policy", {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: Match.arrayEquals(["s3:GetObject", "s3:GetObjectVersion"]),
          Resource: Match.objectLike({
            "Fn::Join": Match.arrayEquals([
              "",
              Match.arrayEquals([
                Match.anyValue(),
                "/liveorder/backups/sqlite/*",
              ]),
            ]),
          }),
        }),
      ]),
    },
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    ManagedPolicyArns: Match.arrayWith([
      Match.objectLike({
        "Fn::Join": Match.arrayEquals([
          "",
          Match.arrayEquals([
            "arn:",
            Match.anyValue(),
            ":iam::aws:policy/AmazonSSMManagedInstanceCore",
          ]),
        ]),
      }),
    ]),
  });
});

test("restricts GitHub OIDC to the configured repository and environment", () => {
  const template = synthTemplate();
  template.hasResourceProperties("AWS::IAM::OIDCProvider", {
    Url: "https://token.actions.githubusercontent.com",
    ClientIdList: ["sts.amazonaws.com"],
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: "LiveOrderGitHubDeployment",
    AssumeRolePolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Condition: {
            StringEquals: {
              "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
              "token.actions.githubusercontent.com:sub":
                "repo:Sylvester-Ad@123608416/live-order@1403043851:environment:production",
            },
          },
        }),
      ]),
    },
  });
});

test("can reuse a matching existing GitHub OIDC provider", () => {
  const template = synthTemplate("arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com");
  template.resourceCountIs("AWS::IAM::OIDCProvider", 0);
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: "LiveOrderGitHubDeployment",
    AssumeRolePolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Principal: {
            Federated: "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com",
          },
        }),
      ]),
    },
  });
});

test("grants instance pull and GitHub push access only to the two image repositories", () => {
  const template = synthTemplate();
  type PolicyStatement = {
    Sid?: string;
    Action?: string | string[];
    Resource?: Array<{ "Fn::GetAtt": [string, string] }>;
  };
  type SynthResource = {
    Type: string;
    Properties?: {
      PolicyDocument?: { Statement?: PolicyStatement[] };
      RepositoryName?: string;
    };
  };
  const resources = (template.toJSON() as { Resources: Record<string, SynthResource> }).Resources;
  const statements = Object.values(resources)
    .flatMap((resource) => resource.Properties?.PolicyDocument?.Statement ?? []);
  const pullPolicy = statements.find((statement) => statement.Sid === "PullLiveOrderImages");
  const pushPolicy = statements.find((statement) => statement.Sid === "PushLiveOrderImages");
  const authenticationPolicy = statements.find((statement) => statement.Sid === "AuthenticateToEcr");
  const repositories = Object.entries(resources)
    .filter(([, resource]) => resource.Type === "AWS::ECR::Repository")
    .map(([logicalId]) => logicalId)
    .sort();

  assert.deepEqual(pullPolicy?.Action, [
    "ecr:BatchCheckLayerAvailability",
    "ecr:BatchGetImage",
    "ecr:GetDownloadUrlForLayer",
  ]);
  assert.deepEqual(pushPolicy?.Action, [
    "ecr:BatchCheckLayerAvailability",
    "ecr:BatchGetImage",
    "ecr:CompleteLayerUpload",
    "ecr:DescribeImages",
    "ecr:InitiateLayerUpload",
    "ecr:PutImage",
    "ecr:UploadLayerPart",
  ]);
  for (const policy of [pullPolicy, pushPolicy]) {
    const repositoryReferences = policy?.Resource?.map((resource) => resource["Fn::GetAtt"][0]).sort();
    assert.deepEqual(repositoryReferences, repositories);
  }
  assert.deepEqual(
    Array.isArray(authenticationPolicy?.Action) ? authenticationPolicy.Action : [authenticationPolicy?.Action],
    ["ecr:GetAuthorizationToken"],
  );
  assert.deepEqual(
    Array.isArray(authenticationPolicy?.Resource) ? authenticationPolicy.Resource : [authenticationPolicy?.Resource],
    ["*"],
  );
});

test("installs a daily serialized backup timer and alarms on backup failures", () => {
  const template = synthTemplate();
  const rendered = [
    "liveorder-bootstrap.sh",
    "liveorder-backup.sh",
    "liveorder-restore-receiver.py",
    "liveorder-backup.service",
    "liveorder-backup.timer",
    "liveorder-restore-receiver.service",
  ].map((file) => readFileSync(new URL(`../scripts/${file}`, import.meta.url), "utf8")).join("\n");
  assert.match(rendered, /OnCalendar=\*-\*-\* 02:15:00 UTC/);
  assert.match(rendered, /liveorder-backup\.timer/);
  assert.match(rendered, /liveorder-backup\.lock/);
  assert.match(rendered, /cloudwatch put-metric-data/);
  assert.match(rendered, /127\.0\.0\.1.{0,10}18080/);
  assert.match(rendered, /liveorder-restore-receiver\.service/);
  template.hasResourceProperties("AWS::CloudWatch::Alarm", {
    AlarmName: "LiveOrder-BackupFailure",
    Threshold: 1,
    EvaluationPeriods: 1,
    TreatMissingData: "notBreaching",
  });
  template.hasResourceProperties("AWS::SNS::Subscription", {
    Protocol: "email",
    Endpoint: "budget-test@example.invalid",
  });
  template.hasResourceProperties("AWS::SNS::TopicPolicy", {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Sid: "AllowLiveOrderBackupAlarmToPublish",
          Effect: "Allow",
          Principal: { Service: "cloudwatch.amazonaws.com" },
          Action: "sns:Publish",
          Condition: Match.objectLike({
            ArnEquals: Match.objectLike({
              "aws:SourceArn": Match.anyValue(),
            }),
          }),
        }),
      ]),
    },
  });
});

test("configures gross monthly spend alerts and bounded log retention", () => {
  const template = synthTemplate();
  template.hasResourceProperties("AWS::Budgets::Budget", {
    Budget: {
      BudgetLimit: { Amount: 50, Unit: "USD" },
      BudgetType: "COST",
      TimeUnit: "MONTHLY",
      CostTypes: { IncludeCredit: false },
    },
    NotificationsWithSubscribers: Match.arrayEquals([
      Match.objectLike({ Notification: { Threshold: 50 } }),
      Match.objectLike({ Notification: { Threshold: 80 } }),
      Match.objectLike({ Notification: { Threshold: 100 } }),
    ]),
  });
  template.hasResourceProperties("AWS::Logs::LogGroup", {
    LogGroupName: "/liveorder/containers",
    RetentionInDays: 30,
  });
});

test("rejects invalid sizing and unpinned Compose versions", () => {
  assert.throws(() => new LiveOrderStack(new App(), "InvalidVolume", {
    env: { account: "111122223333", region: "us-east-1" },
    budgetEmail: "budget-test@example.invalid",
    githubRepository: "Sylvester-Ad/live-order",
    githubOwnerId: "123608416",
    githubRepositoryId: "1403043851",
    githubEnvironment: "production",
    instanceType: "t4g.small",
    dataVolumeGiB: 10,
    initializeDataVolume: false,
    composeVersion: "2.39.4",
    runtimeSecretName: "liveorder/test/runtime",
  }), /at least 20 GiB/);
  assert.throws(() => new LiveOrderStack(new App(), "UnpinnedCompose", {
    env: { account: "111122223333", region: "us-east-1" },
    budgetEmail: "budget-test@example.invalid",
    githubRepository: "Sylvester-Ad/live-order",
    githubOwnerId: "123608416",
    githubRepositoryId: "1403043851",
    githubEnvironment: "production",
    instanceType: "t4g.small",
    dataVolumeGiB: 30,
    initializeDataVolume: false,
    composeVersion: "latest",
    runtimeSecretName: "liveorder/test/runtime",
  }), /pinned semantic version/);
  assert.throws(() => new LiveOrderStack(new App(), "InvalidSiteAddress", {
    env: { account: "111122223333", region: "us-east-1" },
    budgetEmail: "budget-test@example.invalid",
    githubRepository: "Sylvester-Ad/live-order",
    githubOwnerId: "123608416",
    githubRepositoryId: "1403043851",
    githubEnvironment: "production",
    instanceType: "t4g.small",
    dataVolumeGiB: 30,
    initializeDataVolume: false,
    composeVersion: "2.39.4",
    runtimeSecretName: "liveorder/test/runtime",
    siteAddress: "example.com;touch /tmp/pwned",
  }), /valid hostname/);
  assert.throws(() => new LiveOrderStack(new App(), "UnsupportedArchitecture", {
    env: { account: "111122223333", region: "us-east-1" },
    budgetEmail: "budget-test@example.invalid",
    githubRepository: "Sylvester-Ad/live-order",
    githubOwnerId: "123608416",
    githubRepositoryId: "1403043851",
    githubEnvironment: "production",
    instanceType: "t3.small",
    dataVolumeGiB: 30,
    initializeDataVolume: false,
    composeVersion: "2.39.4",
    runtimeSecretName: "liveorder/test/runtime",
  }), /must use ARM64 architecture/);
});

test("requires numeric GitHub owner and repository IDs", () => {
  const props = {
    env: { account: "111122223333", region: "us-east-1" },
    budgetEmail: "budget-test@example.invalid",
    githubRepository: "Sylvester-Ad/live-order",
    githubOwnerId: "123608416",
    githubRepositoryId: "1403043851",
    githubEnvironment: "production",
    instanceType: "t4g.small",
    dataVolumeGiB: 30,
    initializeDataVolume: false,
    composeVersion: "2.39.4",
    runtimeSecretName: "liveorder/test/runtime",
  };
  assert.throws(() => new LiveOrderStack(new App(), "InvalidGitHubOwnerId", {
    ...props,
    githubOwnerId: "owner-id",
  }), /numeric GitHub owner ID/);
  assert.throws(() => new LiveOrderStack(new App(), "InvalidGitHubRepositoryId", {
    ...props,
    githubRepositoryId: "repository-id",
  }), /numeric GitHub repository ID/);
});
