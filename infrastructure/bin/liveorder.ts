#!/usr/bin/env node
import "dotenv/config";

import { App, Environment } from "aws-cdk-lib";
import { LiveOrderStack } from "../lib/liveorder-stack.js";

const app = new App();
const initializeDataVolumeSetting = process.env.LIVEORDER_INITIALIZE_DATA_VOLUME?.trim().toLowerCase() ?? "false";
if (initializeDataVolumeSetting !== "true" && initializeDataVolumeSetting !== "false") {
  throw new Error("LIVEORDER_INITIALIZE_DATA_VOLUME must be either true or false.");
}
const environment: Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT?.trim() || undefined,
  region: process.env.CDK_DEFAULT_REGION?.trim() || undefined,
};

new LiveOrderStack(app, "LiveOrderProduction", {
  env: environment,
  budgetEmail: process.env.LIVEORDER_BUDGET_EMAIL,
  githubRepository: process.env.LIVEORDER_GITHUB_REPOSITORY ?? "Sylvester-Ad/live-order",
  githubOwnerId: process.env.LIVEORDER_GITHUB_OWNER_ID ?? "123608416",
  githubRepositoryId: process.env.LIVEORDER_GITHUB_REPOSITORY_ID ?? "1403043851",
  githubEnvironment: process.env.LIVEORDER_GITHUB_ENVIRONMENT ?? "production",
  githubOidcProviderArn: process.env.LIVEORDER_GITHUB_OIDC_PROVIDER_ARN,
  instanceType: process.env.LIVEORDER_INSTANCE_TYPE ?? "t4g.small",
  dataVolumeGiB: Number(process.env.LIVEORDER_DATA_VOLUME_GIB ?? "30"),
  initializeDataVolume: initializeDataVolumeSetting === "true",
  composeVersion: process.env.LIVEORDER_COMPOSE_VERSION ?? "2.39.4",
  runtimeSecretName: process.env.LIVEORDER_RUNTIME_SECRET_NAME ?? "liveorder/production/runtime",
  siteAddress: process.env.LIVEORDER_SITE_ADDRESS ?? ":80",
});
