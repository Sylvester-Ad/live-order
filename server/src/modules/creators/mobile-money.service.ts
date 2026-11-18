import { prisma } from "../../database/prisma.js";
import type { UpdateMobileMoneySettingsInput } from "./mobile-money.schemas.js";

export async function getMobileMoneySettings(creatorId: string) {
  return prisma.creatorMobileMoneySettings.findUnique({
    where: { creatorId },
    select: {
      provider: true,
      mobileMoneyNumber: true,
      accountName: true,
      enabled: true,
      updatedAt: true,
    },
  });
}

export async function saveMobileMoneySettings(
  creatorId: string,
  input: UpdateMobileMoneySettingsInput,
) {
  return prisma.creatorMobileMoneySettings.upsert({
    where: { creatorId },
    create: {
      creatorId,
      ...input,
    },
    update: input,
    select: {
      provider: true,
      mobileMoneyNumber: true,
      accountName: true,
      enabled: true,
      updatedAt: true,
    },
  });
}
