import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../src/database/prisma.js";
import { createStore, publishStore, unpublishStore } from "../../src/modules/lives/lives.service.js";
import { hashAccessCode } from "../../src/shared/utils/credentials.js";
import { resetTestDatabase } from "../helpers/test-database.js";

describe("Store publication lifecycle", () => {
  let creatorId: string;

  beforeEach(async () => {
    await resetTestDatabase();

    const creator = await prisma.creator.create({
      data: {
        name: "Store Lifecycle Creator",
        accessCodeHash: await hashAccessCode(`LO-${randomUUID()}`),
      },
    });
    creatorId = creator.id;
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("creates a Store as a draft", async () => {
    const store = await createStore(creatorId, { name: "My Store" });

    expect(store.status).toBe("DRAFT");
    expect(store.creatorId).toBe(creatorId);
    expect(store.slug).toMatch(/^my-store-[a-f0-9]{8}$/);
  });

  it("supports draft, publish, unpublish, and republish transitions", async () => {
    const created = await createStore(creatorId, { name: "Seasonal Shop" });
    const published = await publishStore(creatorId, created.id);
    expect(published.status).toBe("PUBLISHED");

    const unpublished = await unpublishStore(creatorId, created.id);
    expect(unpublished.status).toBe("UNPUBLISHED");

    const republished = await publishStore(creatorId, created.id);
    expect(republished.status).toBe("PUBLISHED");
  });

  it("rejects unpublishing a draft and preserves idempotent same-state updates", async () => {
    const created = await createStore(creatorId, { name: "Draft Shop" });

    await expect(unpublishStore(creatorId, created.id)).rejects.toMatchObject({
      code: "INVALID_STORE_STATUS_TRANSITION",
      statusCode: 409,
    });

    const published = await publishStore(creatorId, created.id);
    expect((await publishStore(creatorId, created.id)).status).toBe(published.status);
    const unpublished = await unpublishStore(creatorId, created.id);
    expect((await unpublishStore(creatorId, created.id)).status).toBe(unpublished.status);
  });

  it("does not let another Creator publish the Store", async () => {
    const created = await createStore(creatorId, { name: "Private Shop" });
    const otherCreator = await prisma.creator.create({
      data: {
        name: "Other Creator",
        accessCodeHash: await hashAccessCode(`LO-${randomUUID()}`),
      },
    });

    await expect(publishStore(otherCreator.id, created.id)).rejects.toMatchObject({
      code: "STORE_NOT_FOUND",
      statusCode: 404,
    });
    expect((await prisma.store.findUniqueOrThrow({ where: { id: created.id } })).status).toBe("DRAFT");
  });
});
