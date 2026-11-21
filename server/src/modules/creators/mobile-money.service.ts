import { prisma } from "../../database/prisma.js";
import type { UpdateMobileMoneySettingsInput } from "./mobile-money.schemas.js";
import { AppError } from "../../shared/errors/app-error.js";

const mobileMoneySettingsSelect = {
  provider: true,
  mobileMoneyNumber: true,
  accountName: true,
  enabled: true,
  updatedAt: true,
} as const;

export async function getMobileMoneySettings(creatorId: string) {
  return prisma.creatorMobileMoneySettings.findUnique({
    where: { creatorId },
    select: mobileMoneySettingsSelect,
  });
}

export async function saveMobileMoneySettings(
  creatorId: string,
  input: UpdateMobileMoneySettingsInput,
) {
  return prisma.$transaction(async (tx) => {
    const settings = await tx.creatorMobileMoneySettings.upsert({
      where: { creatorId },
      create: { creatorId, ...input },
      update: input,
      select: mobileMoneySettingsSelect,
    });

    const stores = await tx.store.findMany({
      where: { creatorId },
      select: { id: true },
    });

    if (stores.length > 0) {
      const storeIds = stores.map((store) => store.id);
      await tx.storeMobileMoneySettings.updateMany({
        where: {
          storeId: { in: storeIds },
          origin: "LEGACY_INHERITED",
        },
        data: input,
      });

      // A legacy settings save should continue to configure Stores that had no
      // settings yet, while never replacing a Store-managed configuration.
      const configuredStores = await tx.storeMobileMoneySettings.findMany({
        where: { storeId: { in: storeIds } },
        select: { storeId: true },
      });
      const configuredStoreIds = new Set(configuredStores.map((item) => item.storeId));
      const unconfiguredStoreIds = storeIds.filter((storeId) => !configuredStoreIds.has(storeId));

      if (unconfiguredStoreIds.length > 0) {
        await tx.storeMobileMoneySettings.createMany({
          data: unconfiguredStoreIds.map((storeId) => ({
            storeId,
            ...input,
            origin: "LEGACY_INHERITED" as const,
          })),
        });
      }
    }

    return settings;
  });
}

export async function getStoreMobileMoneySettings(creatorId: string, storeId: string) {
  const store = await prisma.store.findFirst({
    where: { id: storeId, creatorId },
    select: { id: true },
  });

  if (!store) throw new AppError(404, "STORE_NOT_FOUND", "Store not found");

  return prisma.storeMobileMoneySettings.findUnique({
    where: { storeId: store.id },
    select: mobileMoneySettingsSelect,
  });
}

export async function saveStoreMobileMoneySettings(
  creatorId: string,
  storeId: string,
  input: UpdateMobileMoneySettingsInput,
) {
  return prisma.$transaction(async (tx) => {
    const store = await tx.store.findFirst({
      where: { id: storeId, creatorId },
      select: { id: true },
    });

    if (!store) throw new AppError(404, "STORE_NOT_FOUND", "Store not found");

    return tx.storeMobileMoneySettings.upsert({
      where: { storeId: store.id },
      create: {
        storeId: store.id,
        ...input,
        origin: "STORE_MANAGED",
      },
      update: {
        ...input,
        origin: "STORE_MANAGED",
      },
      select: mobileMoneySettingsSelect,
    });
  });
}
