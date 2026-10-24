#!/usr/bin/env node
import { App, Environment } from "aws-cdk-lib";
import { LiveOrderStack } from "../lib/liveorder-stack.js";

const app = new App();
const environment: Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

new LiveOrderStack(app, "LiveOrderProduction", {
  env: environment,
  budgetEmail: process.env.LIVEORDER_BUDGET_EMAIL,
  githubRepository: process.env.LIVEORDER_GITHUB_REPOSITORY ?? "Sylvester-Ad/live-order",
  githubEnvironment: process.env.LIVEORDER_GITHUB_ENVIRONMENT ?? "production",
  instanceType: process.env.LIVEORDER_INSTANCE_TYPE ?? "t4g.small",
  dataVolumeGiB: Number(process.env.LIVEORDER_DATA_VOLUME_GIB ?? "30"),
  composeVersion: process.env.LIVEORDER_COMPOSE_VERSION ?? "2.39.4",
});
