import crypto from "node:crypto";
import { prisma } from "../../database/prisma.js";
import type { CreateLiveInput } from "./lives.schemas.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { UpdateLiveInput } from "./lives.schemas.js";

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const suffix = crypto.randomUUID().slice(0, 8);

  return `${base || "live"}-${suffix}`;
}

export async function createLive(creatorId: string, input: CreateLiveInput) {
  return prisma.live.create({
    data: {
      creatorId,
      name: input.name,
      slug: generateSlug(input.name),
    },
  });
}

export async function updateLive(
  creatorId: string,
  liveId: string,
  input: UpdateLiveInput,
) {
  const live = await prisma.live.findFirst({
    where: {
      id: liveId,
      creatorId,
    },
  });

  if (!live) {
    throw new AppError(404, "LIVE_NOT_FOUND", "Live not found");
  }

  if (input.status && input.status !== live.status) {
    const validTransition =
      (live.status === "DRAFT" && input.status === "ACTIVE") ||
      (live.status === "ACTIVE" && input.status === "ENDED");

    if (!validTransition) {
      throw new AppError(
        409,
        "INVALID_STATUS_TRANSITION",
        `Cannot change Live status from ${live.status} to ${input.status}`,
      );
    }
  }

  return prisma.live.update({
    where: { id: live.id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.status !== undefined && { status: input.status }),
    },
  });
}

export async function listLives(creatorId: string) {
  return prisma.live.findMany({
    where: {
      creatorId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getPublicLiveBySlug(slug: string) {
  const live = await prisma.live.findFirst({
    where: {
      slug,
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      products: {
        select: {
          id: true,
          name: true,
          price: true,
          options: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!live) {
    throw new AppError(404, "LIVE_NOT_FOUND", "Live not found");
  }

  return live;
}
