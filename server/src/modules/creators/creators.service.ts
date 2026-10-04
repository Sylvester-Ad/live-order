import { prisma } from "../../database/prisma.js";
import { verifyAccessCode } from "../../shared/utils/credentials.js";
import {
  generateSessionToken,
  hashSessionToken,
} from "../../shared/utils/sessions.js";
import type { CreatorAccessInput } from "./creators.schemas.js";

export async function authenticateCreator({
  accessCode,
}: CreatorAccessInput) {
  const creators = await prisma.creator.findMany({
    select: {
      id: true,
      name: true,
      accessCodeHash: true,
    },
  });

  for (const creator of creators) {
    const valid = await verifyAccessCode(accessCode, creator.accessCodeHash);

    if (valid) {
      return {
        id: creator.id,
        name: creator.name,
      };
    }
  }

  return null;
}

export async function createCreatorSession(creatorId: string) {
  const token = generateSessionToken();

  await prisma.creatorSession.create({
    data: {
      creatorId,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return token;
}