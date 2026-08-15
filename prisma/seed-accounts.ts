/**
 * Seeds the sign-in accounts.
 *
 * TEST CREDENTIALS. Every password here is "123456", which is not a password —
 * it is a placeholder for local testing. These accounts must be deleted or
 * given real credentials before anything is deployed. Tracked as SEC-01.
 *
 * Separate from seed.ts because the catalogue is re-seeded routinely and
 * accounts should not be swept away with it.
 *
 * Run with: npm run db:seed:accounts
 */

import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const scryptAsync = promisify(scrypt);

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

/** Mirrors src/lib/auth.ts — the format must match or sign-in fails. */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

const PASSWORD = "123456";

console.log("\nSeeding accounts\n");

const passwordHash = await hashPassword(PASSWORD);

/* ------------------------------------------------------------------ *
 * Admin
 * ------------------------------------------------------------------ */

await prisma.user.upsert({
  where: { email: "admin@aussiemed.local" },
  update: { username: "admin", passwordHash, role: "Admin", isVerified: true },
  create: {
    email: "admin@aussiemed.local",
    username: "admin",
    name: "AussieMed Admin",
    role: "Admin",
    isVerified: true,
    passwordHash,
  },
});
console.log("  admin                 sign in as: admin");

/* ------------------------------------------------------------------ *
 * Customer
 * ------------------------------------------------------------------ */

const org = await prisma.organisation.upsert({
  where: { id: "demo-org" },
  update: {},
  create: {
    id: "demo-org",
    name: "Al Barsha Family Clinic",
    emirate: "Dubai",
    paymentTerms: "Net30",
    creditLimitFils: 2500000,
  },
});

await prisma.user.upsert({
  where: { email: "musawi1989@gmail.com" },
  update: { passwordHash, role: "Customer", isVerified: true, organisationId: org.id },
  create: {
    email: "musawi1989@gmail.com",
    name: "Musawi",
    role: "Customer",
    isVerified: true,
    passwordHash,
    organisationId: org.id,
  },
});
console.log("  customer              sign in as: musawi1989@gmail.com");

/* ------------------------------------------------------------------ *
 * Suppliers
 *
 * Attached to the two seeded supplier companies so a supplier signing in has
 * products to manage when the portal is built.
 * ------------------------------------------------------------------ */

const companies = await prisma.supplier.findMany({
  orderBy: { companyName: "asc" },
  take: 2,
});

for (const [index, company] of companies.entries()) {
  const username = `supplier${index + 1}`;
  const email = `${username}@aussiemed.local`;

  const user = await prisma.user.upsert({
    where: { email },
    update: { username, passwordHash, role: "Supplier", isVerified: true },
    create: {
      email,
      username,
      name: company.companyName,
      role: "Supplier",
      isVerified: true,
      passwordHash,
    },
  });

  // One user per supplier company.
  await prisma.supplier.update({
    where: { id: company.id },
    data: { userId: user.id },
  });

  console.log(
    `  ${username.padEnd(22)}sign in as: ${username}  (${company.companyName})`
  );
}

/* ------------------------------------------------------------------ *
 * Summary
 * ------------------------------------------------------------------ */

const counts = await prisma.user.groupBy({ by: ["role"], _count: true });
console.log(
  `\n  users: ${counts.map((c) => `${c.role} ${c._count}`).join(", ")}`
);
console.log(`  password for all accounts: ${PASSWORD}`);
console.log("  TEST CREDENTIALS — must not survive to production (SEC-01)\n");

await prisma.$disconnect();
