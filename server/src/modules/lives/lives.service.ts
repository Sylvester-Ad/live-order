import crypto from "node:crypto";
import { prisma } from "../../database/prisma.js";
import type { CreateLiveInput } from "./lives.schemas.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { UpdateLiveInput } from "./lives.schemas.js";
import { serializeProductImages } from "../products/product-images.service.js";

type StoreStatus = "DRAFT" | "PUBLISHED" | "UNPUBLISHED";

const storeTransitions: Record<StoreStatus, readonly StoreStatus[]> = {
  DRAFT: ["PUBLISHED"],
  PUBLISHED: ["UNPUBLISHED"],
  UNPUBLISHED: ["PUBLISHED"],
};

export function toLegacyLiveStatus(status: StoreStatus): "DRAFT" | "ACTIVE" | "ENDED" {
  if (status === "PUBLISHED") return "ACTIVE";
  if (status === "UNPUBLISHED") return "ENDED";
  return "DRAFT";
}

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const suffix = crypto.randomUUID().slice(0, 8);

  return `${base || "live"}-${suffix}`;
}

export async function createStore(creatorId: string, input: CreateLiveInput) {
  return prisma.$transaction(async (tx) => {
    const inheritedSettings = await tx.creatorMobileMoneySettings.findUnique({
      where: { creatorId },
      select: {
        provider: true,
        mobileMoneyNumber: true,
        accountName: true,
        enabled: true,
      },
    });

    return tx.store.create({
      data: {
        creatorId,
        name: input.name,
        slug: generateSlug(input.name),
        tiktokLiveUrl: input.tiktokLiveUrl ?? null,
        ...(inheritedSettings && {
          mobileMoneySettings: {
            create: {
              ...inheritedSettings,
              origin: "LEGACY_INHERITED",
            },
          },
        }),
      },
    });
  });
}

async function findOwnedStore(creatorId: string, storeId: string, legacy = false) {
  const store = await prisma.store.findFirst({
    where: {
      id: storeId,
      creatorId,
    },
  });

  if (!store) {
    throw legacy
      ? new AppError(404, "LIVE_NOT_FOUND", "Live not found")
      : new AppError(404, "STORE_NOT_FOUND", "Store not found");
  }

  return store;
}

function invalidStoreTransition(from: StoreStatus, to: StoreStatus, legacy: boolean) {
  if (legacy) {
    throw new AppError(
      409,
      "INVALID_STATUS_TRANSITION",
      `Cannot change Live status from ${toLegacyLiveStatus(from)} to ${toLegacyLiveStatus(to)}`,
    );
  }

  throw new AppError(
    409,
    "INVALID_STORE_STATUS_TRANSITION",
    `Cannot change Store status from ${from} to ${to}`,
  );
}

async function transitionStore(
  creatorId: string,
  storeId: string,
  targetStatus: StoreStatus,
  options: {
    legacy?: boolean;
    name?: string;
    tiktokLiveUrl?: string | null;
  } = {},
) {
  const legacy = options.legacy ?? false;
  const store = await findOwnedStore(creatorId, storeId, legacy);

  const sameStatus = store.status === targetStatus;
  const transitionAllowed = storeTransitions[store.status].includes(targetStatus);
  // Legacy Live clients cannot reactivate an ended Live, even though Store
  // clients can republish an unpublished Store through the new domain API.
  const legacyRepublish = legacy && store.status === "UNPUBLISHED" && targetStatus === "PUBLISHED";
  if (!sameStatus && (!transitionAllowed || legacyRepublish)) {
    invalidStoreTransition(store.status, targetStatus, legacy);
  }

  return prisma.store.update({
    where: { id: store.id },
    data: {
      status: targetStatus,
      ...(options.name !== undefined && { name: options.name }),
      ...(options.tiktokLiveUrl !== undefined && { tiktokLiveUrl: options.tiktokLiveUrl }),
    },
  });
}

export async function publishStore(creatorId: string, storeId: string) {
  return transitionStore(creatorId, storeId, "PUBLISHED");
}

export async function unpublishStore(creatorId: string, storeId: string) {
  return transitionStore(creatorId, storeId, "UNPUBLISHED");
}

export async function updateStoreDetails(
  creatorId: string,
  storeId: string,
  input: Pick<UpdateLiveInput, "name" | "tiktokLiveUrl">,
) {
  const store = await findOwnedStore(creatorId, storeId);
  return prisma.store.update({
    where: { id: store.id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.tiktokLiveUrl !== undefined && { tiktokLiveUrl: input.tiktokLiveUrl }),
    },
  });
}

export async function updateLegacyLive(
  creatorId: string,
  liveId: string,
  input: UpdateLiveInput,
) {
  if (input.status === undefined) {
    const store = await findOwnedStore(creatorId, liveId, true);
    return prisma.store.update({
      where: { id: store.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.tiktokLiveUrl !== undefined && { tiktokLiveUrl: input.tiktokLiveUrl }),
      },
    });
  }

  const targetStatus: StoreStatus = input.status === "ACTIVE" ? "PUBLISHED" : "UNPUBLISHED";
  return transitionStore(creatorId, liveId, targetStatus, {
    legacy: true,
    ...(input.name !== undefined && { name: input.name }),
    ...(input.tiktokLiveUrl !== undefined && { tiktokLiveUrl: input.tiktokLiveUrl }),
  });
}

export async function listStores(creatorId: string) {
  return prisma.store.findMany({
    where: {
      creatorId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getStore(creatorId: string, storeId: string) {
  return findOwnedStore(creatorId, storeId);
}

export async function getPublicStoreBySlug(slug: string) {
  const store = await prisma.store.findFirst({
    where: {
      slug,
      status: "PUBLISHED",
    },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      tiktokLiveUrl: true,
      products: {
        select: {
          id: true,
          name: true,
          price: true,
          options: true,
          stockQuantity: true,
          images: {
            where: { state: "ACTIVE" },
            select: {
              id: true,
              url: true,
              storageId: true,
              provider: true,
              isPrimary: true,
              state: true,
              createdAt: true,
            },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }, { id: "asc" }],
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!store) throw new AppError(404, "STORE_NOT_FOUND", "Store not found");

  return {
    ...store,
    products: store.products.map((product) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      options: product.options,
      stockQuantity: product.stockQuantity,
      available: product.stockQuantity > 0,
      ...serializeProductImages(product.images),
    })),
  };
}
