import assert from "node:assert/strict";
import test from "node:test";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { LiveOrderStack } from "../lib/liveorder-stack.js";

function synthTemplate(): Template {
  const app = new App();
  const stack = new LiveOrderStack(app, "TestLiveOrder", {
    env: { account: "111122223333", region: "us-east-1" },
    budgetEmail: "budget-test@example.invalid",
    githubRepository: "Sylvester-Ad/live-order",
    githubEnvironment: "production",
    instanceType: "t4g.small",
    dataVolumeGiB: 30,
    composeVersion: "2.39.4",
    runtimeSecretName: "liveorder/test/runtime",
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
              "token.actions.githubusercontent.com:sub": "repo:Sylvester-Ad/live-order:environment:production",
            },
          },
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
    githubEnvironment: "production",
    instanceType: "t4g.small",
    dataVolumeGiB: 30,
    composeVersion: "latest",
    runtimeSecretName: "liveorder/test/runtime",
  }), /pinned semantic version/);
});
