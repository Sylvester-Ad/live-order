import assert from "node:assert/strict";
import test from "node:test";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { LiveOrderStack } from "../lib/liveorder-stack.js";

function synthTemplate(githubOidcProviderArn?: string): Template {
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
    composeVersion: "2.39.4",
    runtimeSecretName: "liveorder/test/runtime",
    githubOidcProviderArn,
  });
  return Template.fromStack(stack);
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

test("uses an encrypted retained data volume and provisions Docker Compose", () => {
  const template = synthTemplate();
  template.hasResourceProperties("AWS::EC2::Volume", {
    Encrypted: true,
    Size: 30,
    VolumeType: "gp3",
  });
  template.hasResource("AWS::EC2::Volume", {
    DeletionPolicy: "Retain",
  });
  template.resourceCountIs("AWS::EC2::VolumeAttachment", 1);
  template.hasResourceProperties("AWS::EC2::VolumeAttachment", {
    Device: "/dev/sdf",
    InstanceId: Match.objectLike({ Ref: Match.anyValue() }),
    VolumeId: Match.objectLike({ Ref: Match.anyValue() }),
  });
  template.hasResourceProperties("AWS::EC2::Instance", {
    UserData: Match.objectLike({
      "Fn::Base64": Match.objectLike({
        "Fn::Join": Match.arrayWith([
          Match.arrayWith([
            Match.stringLikeRegexp("docker-compose-linux-aarch64"),
          ]),
        ]),
      }),
    }),
  });
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
  template.hasResourceProperties("AWS::EC2::Instance", {
    UserData: Match.objectLike({
      "Fn::Base64": Match.objectLike({
        "Fn::Join": Match.arrayWith([
          Match.arrayWith([
            Match.stringLikeRegexp("liveorder-sync-runtime-env"),
          ]),
        ]),
      }),
    }),
  });
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
});

test("installs a daily serialized backup timer and alarms on backup failures", () => {
  const template = synthTemplate();
  const rendered = JSON.stringify(template.toJSON());
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
