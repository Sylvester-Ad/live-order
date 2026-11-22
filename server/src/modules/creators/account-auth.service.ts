import crypto from "node:crypto";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { hashAccessCode, verifyAccessCode } from "../../shared/utils/credentials.js";
import { generateSessionToken, hashSessionToken } from "../../shared/utils/sessions.js";
import { assertEmailDeliveryConfigured, sendPasswordResetEmail, sendVerificationEmail } from "./email-delivery.js";
import type { ClaimInput, PasswordLoginInput, PasswordResetInput, RegisterInput } from "./auth.schemas.js";

const verificationTtlMs = 24 * 60 * 60 * 1000;
const resetTtlMs = 60 * 60 * 1000;
const genericMessage = "If the details can be used, LiveOrder will send next steps by email.";
const invalidToken = () => new AppError(400, "INVALID_OR_EXPIRED_TOKEN", "This link is invalid or has expired.");
const emailCollision = (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
const emailDeliveryFailed = (error: unknown) => error instanceof AppError && error.code === "EMAIL_DELIVERY_UNAVAILABLE";
const tokenPair = () => {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: hashSessionToken(token) };
};

async function saveVerification(
  creatorId: string,
  email: string,
  password: string,
  pendingName?: string,
) {
  const { token, tokenHash } = tokenPair();
  const pendingPasswordHash = await hashAccessCode(password);
  await prisma.creatorAuthToken.upsert({
    where: { creatorId },
    create: {
      creatorId,
      pendingEmail: email,
      pendingPasswordHash,
      pendingName: pendingName ?? null,
      tokenHash,
      purpose: "EMAIL_VERIFICATION",
      expiresAt: new Date(Date.now() + verificationTtlMs),
    },
    update: {
      pendingEmail: email,
      pendingPasswordHash,
      pendingName: pendingName ?? null,
      tokenHash,
      purpose: "EMAIL_VERIFICATION",
      expiresAt: new Date(Date.now() + verificationTtlMs),
      createdAt: new Date(),
    },
  });
  return { token, tokenHash };
}

export async function registerSeller(input: RegisterInput) {
  assertEmailDeliveryConfigured();
  const email = input.email.trim().toLowerCase();
  if (await prisma.creator.findUnique({ where: { email }, select: { id: true } })) return genericMessage;
  const existingPending = await prisma.creatorAuthToken.findUnique({ where: { pendingEmail: email } });
  if (existingPending) {
    // Allow an unverified registration to request a fresh link without creating
    // another Creator. A pending account claim (pendingName is null) still
    // requires the original access code to be staged again.
    if (existingPending.pendingName === null || existingPending.purpose !== "EMAIL_VERIFICATION") return genericMessage;
    let stagedTokenHash: string | undefined;
    try {
      const { token, tokenHash } = await saveVerification(existingPending.creatorId, email, input.password, input.name);
      stagedTokenHash = tokenHash;
      await sendVerificationEmail(email, token);
      return genericMessage;
    } catch (error) {
      if (emailCollision(error)) return genericMessage;
      if (emailDeliveryFailed(error)) {
        if (stagedTokenHash) {
          await prisma.creatorAuthToken.updateMany({
            where: { creatorId: existingPending.creatorId, tokenHash: stagedTokenHash },
            data: {
              pendingEmail: existingPending.pendingEmail,
              pendingPasswordHash: existingPending.pendingPasswordHash,
              pendingName: existingPending.pendingName,
              tokenHash: existingPending.tokenHash,
              purpose: existingPending.purpose,
              expiresAt: existingPending.expiresAt,
              createdAt: existingPending.createdAt,
            },
          });
        }
        throw error;
      }
      throw error;
    }
  }

  const inaccessibleLegacyCodeHash = await hashAccessCode(crypto.randomBytes(32).toString("hex"));
  let creatorId: string;
  try {
    const creator = await prisma.creator.create({ data: { name: input.name, accessCodeHash: inaccessibleLegacyCodeHash } });
    creatorId = creator.id;
  } catch (error) {
    if (emailCollision(error)) return genericMessage;
    throw error;
  }

  let stagedTokenHash: string | undefined;
  try {
    const { token, tokenHash } = await saveVerification(creatorId, email, input.password, input.name);
    stagedTokenHash = tokenHash;
    await sendVerificationEmail(email, token);
  } catch (error) {
    await prisma.$transaction([
      ...(stagedTokenHash ? [prisma.creatorAuthToken.deleteMany({ where: { creatorId, tokenHash: stagedTokenHash } })] : []),
      prisma.creator.deleteMany({ where: { id: creatorId, email: null } }),
    ]);
    if (emailCollision(error)) return genericMessage;
    if (emailDeliveryFailed(error)) throw error;
    throw error;
  }
  return genericMessage;
}

export async function claimSellerAccount(input: ClaimInput) {
  assertEmailDeliveryConfigured();
  const creators = await prisma.creator.findMany({ select: { id: true, accessCodeHash: true } });
  let creatorId: string | undefined;
  for (const creator of creators) {
    if (creator.accessCodeHash && await verifyAccessCode(input.accessCode, creator.accessCodeHash)) {
      creatorId = creator.id;
      break;
    }
  }
  if (!creatorId) return genericMessage;

  const email = input.email.trim().toLowerCase();
  if (await prisma.creator.findUnique({ where: { email }, select: { id: true } })) return genericMessage;
  if (await prisma.creatorAuthToken.findUnique({ where: { pendingEmail: email }, select: { creatorId: true } })) return genericMessage;

  let stagedTokenHash: string | undefined;
  try {
    const { token, tokenHash } = await saveVerification(creatorId, email, input.password);
    stagedTokenHash = tokenHash;
    await sendVerificationEmail(email, token);
  } catch (error) {
    if (emailCollision(error)) return genericMessage;
    if (stagedTokenHash) await prisma.creatorAuthToken.deleteMany({ where: { creatorId, tokenHash: stagedTokenHash } });
    if (emailDeliveryFailed(error)) throw error;
    throw error;
  }
  return genericMessage;
}

export async function verifySellerEmail(token: string) {
  const tokenHash = hashSessionToken(token);
  const pending = await prisma.creatorAuthToken.findUnique({ where: { tokenHash } });
  if (!pending || pending.purpose !== "EMAIL_VERIFICATION" || pending.expiresAt <= new Date()) {
    if (pending) await prisma.creatorAuthToken.deleteMany({ where: { id: pending.id } });
    throw invalidToken();
  }

  const retiredAccessCodeHash = await hashAccessCode(crypto.randomBytes(32).toString("hex"));
  try {
    const creator = await prisma.$transaction(async (tx) => {
      const consumed = await tx.creatorAuthToken.deleteMany({ where: { id: pending.id, tokenHash, expiresAt: { gt: new Date() } } });
      if (consumed.count !== 1) throw invalidToken();
      const creator = await tx.creator.update({
        where: { id: pending.creatorId },
        data: {
          email: pending.pendingEmail,
          passwordHash: pending.pendingPasswordHash,
          emailVerifiedAt: new Date(),
          accessCodeHash: retiredAccessCodeHash,
          ...(pending.pendingName && { name: pending.pendingName }),
        },
        select: { id: true, name: true },
      });
      await tx.creatorSession.deleteMany({ where: { creatorId: pending.creatorId } });
      return creator;
    });
    return creator;
  } catch (error) {
    if (emailCollision(error)) throw invalidToken();
    throw error;
  }
}

export async function passwordLogin(input: PasswordLoginInput) {
  const email = input.email.trim().toLowerCase();
  const creator = await prisma.creator.findUnique({ where: { email }, select: { id: true, name: true, passwordHash: true, emailVerifiedAt: true } });
  // Use an equivalent scrypt operation even when the account does not exist.
  const passwordHash = creator?.passwordHash ?? `00000000000000000000000000000000:${"0".repeat(128)}`;
  const valid = await verifyAccessCode(input.password, passwordHash).catch(() => false);
  if (!creator || !creator.emailVerifiedAt || !creator.passwordHash || !valid) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }
  const token = generateSessionToken();
  await prisma.creatorSession.create({ data: { creatorId: creator.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } });
  return { creator: { id: creator.id, name: creator.name }, token };
}

export async function requestPasswordReset(emailInput: string) {
  assertEmailDeliveryConfigured();
  const email = emailInput.trim().toLowerCase();
  const creator = await prisma.creator.findUnique({ where: { email }, select: { id: true, passwordHash: true, emailVerifiedAt: true } });
  if (!creator?.passwordHash || !creator.emailVerifiedAt) return genericMessage;

  const { token, tokenHash } = tokenPair();
  await prisma.$transaction(async (tx) => {
    await tx.creatorPasswordResetToken.deleteMany({ where: { creatorId: creator.id } });
    await tx.creatorPasswordResetToken.create({ data: { creatorId: creator.id, tokenHash, expiresAt: new Date(Date.now() + resetTtlMs) } });
  });
  try {
    await sendPasswordResetEmail(email, token);
  } catch (error) {
    await prisma.creatorPasswordResetToken.deleteMany({ where: { tokenHash } });
    if (emailDeliveryFailed(error)) throw error;
    throw error;
  }
  return genericMessage;
}

export async function resetSellerPassword(input: PasswordResetInput) {
  const tokenHash = hashSessionToken(input.token);
  const token = await prisma.creatorPasswordResetToken.findUnique({ where: { tokenHash } });
  if (!token || token.expiresAt <= new Date()) {
    if (token) await prisma.creatorPasswordResetToken.deleteMany({ where: { id: token.id } });
    throw invalidToken();
  }
  const passwordHash = await hashAccessCode(input.password);
  await prisma.$transaction(async (tx) => {
    const consumed = await tx.creatorPasswordResetToken.deleteMany({ where: { id: token.id, tokenHash, expiresAt: { gt: new Date() } } });
    if (consumed.count !== 1) throw invalidToken();
    await tx.creator.update({ where: { id: token.creatorId }, data: { passwordHash } });
    await tx.creatorSession.deleteMany({ where: { creatorId: token.creatorId } });
    await tx.creatorPasswordResetToken.deleteMany({ where: { creatorId: token.creatorId } });
  });
}
