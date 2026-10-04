import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { hashAccessCode } from "../shared/utils/credentials.js";
import { prisma } from "../database/prisma.js";


const name = process.argv[2];

if (!name) {
  console.error('Usage: pnpm creator:create "Creator Name"');
  process.exit(1);
}

const accessCode = `LO-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
const accessCodeHash = await hashAccessCode(accessCode);

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

const filePath = path.resolve("data/creator-codes.json");

let records: typeof record[] = [];

try {
  const existing = await fs.readFile(filePath, "utf8");
  records = JSON.parse(existing);
} catch {
  // File doesn't exist yet.
}

records.push(record);

await fs.writeFile(filePath, `${JSON.stringify(records, null, 2)}\n`);

console.log("Creator created successfully.");
console.log(`Name: ${creator.name}`);
console.log(`Access code: ${accessCode}`);

await prisma.$disconnect();