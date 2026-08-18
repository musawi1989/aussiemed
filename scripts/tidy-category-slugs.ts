/**
 * Gives a category back its plain URL when nothing holds it any more.
 *
 * A slug is disambiguated with a numeric suffix when its plain form is already
 * taken, which is right at the moment it is created and can stop being right
 * later. On 19 Aug the dental disciplines were created while the old Dental
 * department still held shelves of the same names, so Endodontics became
 * /products?category=endodontics-2 — and then the old shelves were absorbed,
 * leaving the clean URL free and the discipline answering to the awkward one.
 * Anybody typing or sharing the obvious address got the not-stocked-yet page.
 *
 * Where several categories want the same freed slug — three different shelves
 * are called Endodontics — it goes to the SHALLOWEST, because that is the one a
 * buyer means when they type it. Dental > Endodontics gets the name; Dental
 * Burs > Endodontics keeps its suffix.
 *
 * Sample product slugs are NOT rewritten. They embed the category slug they
 * were generated against, so a handful read sample-endodontics-2-3 under a
 * category now called endodontics. They are invented products due for deletion
 * at launch (DA-34), and renaming them would churn 2,000 rows to tidy a string
 * nobody reads.
 *
 * SAFE TO RE-RUN: it finds nothing to do the second time.
 *
 * Run with: node --experimental-strip-types scripts/tidy-category-slugs.ts
 */

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

/** Mirrors slugify in src/lib/admin.ts. */
const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const cats = await prisma.category.findMany({
  select: { id: true, name: true, slug: true, parentId: true },
});
const byId = new Map(cats.map((c) => [c.id, c]));
const taken = new Set(cats.map((c) => c.slug));

const depthOf = (id: string): number => {
  let depth = 0;
  let current = byId.get(id);
  while (current?.parentId) {
    current = byId.get(current.parentId);
    depth += 1;
  }
  return depth;
};

/** Claimants for each freed plain slug, shallowest first. */
const claims = new Map<string, typeof cats>();
for (const category of cats) {
  const plain = slugify(category.name);
  if (category.slug === plain || taken.has(plain)) continue;
  claims.set(plain, [...(claims.get(plain) ?? []), category]);
}

let renamed = 0;
for (const [plain, candidates] of claims) {
  const winner = candidates.sort(
    (a, b) => depthOf(a.id) - depthOf(b.id) || a.name.localeCompare(b.name)
  )[0];

  await prisma.category.update({ where: { id: winner.id }, data: { slug: plain } });
  taken.add(plain);
  renamed += 1;

  const others = candidates.filter((c) => c.id !== winner.id);
  console.log(
    `  ${winner.slug} -> ${plain}${others.length ? `   (${others.length} other claimant(s) keep their suffix)` : ""}`
  );
}

if (renamed > 0) {
  const current = await prisma.setting.findUnique({ where: { key: "catalogVersion" } });
  await prisma.setting.upsert({
    where: { key: "catalogVersion" },
    update: { value: String(Number(current?.value ?? "0") + 1) },
    create: { key: "catalogVersion", value: "1" },
  });
}

console.log(`\n  ${renamed} category slug(s) tidied\n`);
await prisma.$disconnect();
