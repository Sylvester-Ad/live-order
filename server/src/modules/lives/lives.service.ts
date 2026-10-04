import crypto from "node:crypto";
import { prisma } from "../../database/prisma.js";
import type { CreateLiveInput } from "./lives.schemas.js";

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const suffix = crypto.randomUUID().slice(0, 8);

  return `${base || "live"}-${suffix}`;
}

export async function createLive(
  creatorId: string,
  input: CreateLiveInput,
) {
  return prisma.live.create({
    data: {
      creatorId,
      name: input.name,
      slug: generateSlug(input.name),
    },
  });
}