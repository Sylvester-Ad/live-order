import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { hashAccessCode } from "../shared/utils/credentials.js";
import { prisma } from "../database/prisma.js";
import { repositoryRoot } from "../config/database.js";


const name = process.argv[2];

if (!name) {
  console.error('Usage: pnpm creator:create "Creator Name"');
  process.exit(1);
}

const accessCode = `LO-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
const accessCodeHash = await hashAccessCode(accessCode);

try {
  const creator = await prisma.creator.create({
    data: {
      name,
      accessCodeHash,
    },
  });

  const record = {
    id: creator.id,
    name: creator.name,
    accessCode,
    createdAt: creator.createdAt.toISOString(),
  };

  const filePath = path.join(repositoryRoot, "data", "creator-codes.json");
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  let records: typeof record[] = [];

  try {
    const existing = await fs.readFile(filePath, "utf8");
    records = JSON.parse(existing) as typeof record[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  records.push(record);
  await fs.writeFile(filePath, `${JSON.stringify(records, null, 2)}\n`, { mode: 0o600 });
  await fs.chmod(filePath, 0o600);

  console.log("Creator created successfully.");
  console.log(`Name: ${creator.name}`);
  console.log(`Access code: ${accessCode}`);
} finally {
  await prisma.$disconnect();
}
