/**
 * Giving AussieMed Distribution something to supply.
 *
 * Pruning their list (CHG-24) left them with one item and no cover, because
 * every pack they covered was a product that had come off sale. A supplier
 * account with nothing in it cannot demonstrate the supplier portal, the
 * standing badges, or the monthly purchase order.
 *
 * TWO KINDS OF COVER, AND THE FIRST ONE TAKES SOMETHING FROM SOMEBODY:
 *
 *  1. PRIMARY on a small set. There can only be one primary per pack, so this
 *     is a swap, not an addition: the incumbent moves down to backup and keeps
 *     the work if the new primary cannot supply. Nobody is dropped.
 *     Only packs with a FREE backup slot are eligible, so the incumbent always
 *     has somewhere to land — a swap that left them with no cover at all would
 *     be a demotion dressed up as a reshuffle.
 *
 *  2. BACKUP behind somebody else, which takes nothing from anyone.
 *
 * COSTS TELL THE STORY. A new primary is priced under the incumbent, because
 * that is why they won it; a backup is priced over, because that is why they
 * did not. The Cost and margin screen shows every supplier's price against a
 * pack (CHG-11) and would be a column of identical figures otherwise.
 *
 * SAFE TO RE-RUN. Cover already held is counted, not duplicated, so a second
 * run tops up to the targets rather than swapping ten more packs away.
 *
 * Run with: npm run db:seed:cover
 */

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const COMPANY = "AussieMed Distribution";
const WANT_PRIMARY = 10;
const WANT_BACKUP = 15;

/** Under the incumbent for a primary, over them for a backup. */
const UNDERCUT = 0.96;
const OVERBID = 1.04;

async function main() {
  const supplier = await prisma.supplier.findFirst({
    where: { companyName: COMPANY },
    select: { id: true, companyName: true },
  });
  if (!supplier) throw new Error(`No supplier named ${COMPANY}`);

  // Every pack still on sale, with whatever cover it already has.
  const packs = await prisma.productSku.findMany({
    // isActive as well as the product's status: a withdrawn pack of a product
    // still on sale has no listing either, and cover on one is cover on
    // nothing. Same rule the portal uses to decide what it will show.
    where: { isActive: true, product: { status: "Active" } },
    select: {
      id: true,
      skuCode: true,
      productMasterId: true,
      product: { select: { name: true } },
      supplies: {
        select: {
          id: true,
          rank: true,
          costFils: true,
          supplierId: true,
          supplier: { select: { companyName: true } },
        },
      },
    },
    orderBy: { skuCode: "asc" }, // deterministic: the same run twice picks the same packs
  });

  const heldPrimary = packs.filter((p) =>
    p.supplies.some((s) => s.supplierId === supplier.id && s.rank === "Primary")
  ).length;
  const heldBackup = packs.filter((p) =>
    p.supplies.some(
      (s) =>
        s.supplierId === supplier.id && (s.rank === "Backup" || s.rank === "Third")
    )
  ).length;

  let needPrimary = Math.max(0, WANT_PRIMARY - heldPrimary);
  let needBackup = Math.max(0, WANT_BACKUP - heldBackup);

  console.log(
    `${COMPANY}: holds ${heldPrimary} primary, ${heldBackup} backup. ` +
      `Needs ${needPrimary} more primary, ${needBackup} more backup.`
  );

  const untouched = (p: (typeof packs)[number]) =>
    !p.supplies.some((s) => s.supplierId === supplier.id);

  /*
   * One pack per product before a second pack of any of them.
   *
   * Straight SKU order gave this supplier eight sizes of the same glove and
   * little else, because variants of one product sort together. A supplier
   * list that reads "gloves, gloves, gloves" demonstrates nothing about the
   * catalogue, and a buying run against it exercises one product. Passing over
   * a family once it is represented spreads the cover across the range, and
   * the leftovers come back round if the target is not met.
   */
  function spread<T extends { productMasterId: string }>(list: T[], want: number): T[] {
    const picked: T[] = [];
    const held = new Set<string>();
    const passedOver: T[] = [];

    for (const item of list) {
      if (picked.length >= want) break;
      if (held.has(item.productMasterId)) {
        passedOver.push(item);
        continue;
      }
      held.add(item.productMasterId);
      picked.push(item);
    }
    // Not enough distinct products to go round — take the seconds.
    for (const item of passedOver) {
      if (picked.length >= want) break;
      picked.push(item);
    }
    return picked;
  }

  /* ---- 1. take over as primary, incumbent steps down to backup -------- */

  const swappable = packs.filter(
    (p) =>
      untouched(p) &&
      p.supplies.some((s) => s.rank === "Primary") &&
      // The incumbent needs a free slot to land in. No free slot, no swap.
      !p.supplies.some((s) => s.rank === "Backup")
  );

  if (needPrimary > 0 && swappable.length < needPrimary) {
    console.log(
      `  ! only ${swappable.length} pack(s) can be swapped without leaving the incumbent uncovered`
    );
  }

  const takingOver = spread(swappable, needPrimary);

  for (const pack of takingOver) {
    const incumbent = pack.supplies.find((s) => s.rank === "Primary")!;
    const cost =
      incumbent.costFils === null ? null : Math.round(incumbent.costFils * UNDERCUT);

    await prisma.$transaction(async (tx) => {
      // Vacate before filling: one Primary per pack is a database rule, not a
      // convention, and the insert below fails outright against a taken slot.
      await tx.productSupply.update({
        where: { id: incumbent.id },
        data: { rank: "Backup" },
      });
      await tx.productSupply.create({
        data: {
          skuId: pack.id,
          supplierId: supplier.id,
          rank: "Primary",
          costFils: cost,
          supplierPartNumber: `AMD-${pack.skuCode}`,
          leadTimeDays: 3,
          supplyStatus: "Available",
          isAvailable: true,
          isApproved: true,
        },
      });
    });

    console.log(
      `  primary  ${pack.skuCode.padEnd(16)} ${pack.product.name.slice(0, 40).padEnd(40)} ` +
        `(${incumbent.supplier.companyName} → backup)`
    );
    needPrimary--;
  }

  /* ---- 2. backup behind whoever holds the pack ------------------------ */

  const backupFree = (p: (typeof packs)[number]) =>
    !p.supplies.some((s) => s.rank === "Backup");

  const openSlot = packs
    .filter(
      (p) =>
        untouched(p) &&
        p.supplies.some((s) => s.rank === "Primary") &&
        !(
          p.supplies.some((s) => s.rank === "Backup") &&
          p.supplies.some((s) => s.rank === "Third")
        )
    )
    // Packs with a free backup slot first. Third reads as "backup" to the
    // supplier either way (CHG-23), but an admin looking at the cover screen
    // should see them holding actual backup somewhere, not fifteen thirds
    // sitting behind a backup we never gave them.
    .sort((a, b) => Number(backupFree(b)) - Number(backupFree(a)));

  const takingBackup = spread(
    openSlot.filter((p) => !takingOver.includes(p)),
    needBackup
  );

  let placed = 0;
  for (const pack of takingBackup) {
    if (placed >= needBackup) break;
    // Already used as a primary swap above; its rows are stale in this copy.
    if (takingOver.includes(pack)) continue;

    // Third is a backup by another name (CHG-23), so it is a fine second choice.
    const rank = pack.supplies.some((s) => s.rank === "Backup") ? "Third" : "Backup";
    const incumbent = pack.supplies.find((s) => s.rank === "Primary")!;
    const cost =
      incumbent.costFils === null ? null : Math.round(incumbent.costFils * OVERBID);

    await prisma.productSupply.create({
      data: {
        skuId: pack.id,
        supplierId: supplier.id,
        rank,
        costFils: cost,
        supplierPartNumber: `AMD-${pack.skuCode}`,
        leadTimeDays: 5,
        supplyStatus: "Available",
        isAvailable: true,
        isApproved: true,
      },
    });

    console.log(
      `  ${rank.toLowerCase().padEnd(8)} ${pack.skuCode.padEnd(16)} ${pack.product.name.slice(0, 40)}`
    );
    placed++;
  }

  /* ---- what it looks like now ----------------------------------------- */

  const after = await prisma.productSupply.groupBy({
    by: ["rank"],
    where: { supplierId: supplier.id },
    _count: true,
  });

  console.log("");
  console.log(`${COMPANY} now supplies:`);
  for (const row of after) {
    console.log(`  ${(row.rank ?? "(offer)").padEnd(10)} ${row._count}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
