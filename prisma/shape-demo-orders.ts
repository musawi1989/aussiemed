/**
 * The demo buyer's order history, shaped so it reads as a real account.
 *
 * Al Barsha Family Clinic had eight orders, five of them against one branch
 * and three of them placed on the same day. That is not what a clinic's
 * account looks like — it is what test data looks like — and the branch
 * feature, which is one of the things worth showing, was invisible because
 * almost everything sat on the default address.
 *
 * TWO RULES, BOTH THE CLIENT'S:
 *
 *   at most two orders against any one branch
 *   no two orders — and so no two invoices — on the same day
 *
 * WHAT IT WILL NOT DO. An order that has purchase-order allocations is never
 * deleted: it is the customer end of a real supply chain, and removing it
 * leaves a purchase order buying for nobody. Those orders are re-dated and
 * moved between branches instead, which changes nothing about what was bought.
 *
 * DATES RUN BACKWARDS FROM THE STATUS. A delivered order is old, a pending one
 * is from this week, and every order is placed BEFORE the purchase order that
 * bought for it — an order raised after its own purchase order reads as a
 * mistake to anybody who looks closely, and somebody being shown the system
 * will look closely.
 *
 * SAFE TO RE-RUN.
 *
 * Run with: npm run db:shape:orders
 */

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const ORGANISATION = "demo-org";

const NOW = new Date();
/** Mid-morning, so a date never lands either side of midnight by an hour. */
const daysAgo = (n: number) => {
  const d = new Date(NOW.getTime() - n * 86_400_000);
  d.setHours(10, 30, 0, 0);
  return d;
};

/**
 * The history to keep, oldest first.
 *
 * Two per branch, one order per day, and a spread of states so the account
 * page shows a delivered order, one on its way and one just placed rather
 * than nine variations of Pending.
 */
const KEEP: { reference: string; branch: string; daysAgo: number }[] = [
  // Delivered, and bought on PO-2026-000103 which was sent 21 days ago.
  { reference: "AM-2026-000006", branch: "Clinic", daysAgo: 24 },
  // Dispatched, bought on PO-000105 (17 days) and PO-000102 (22 days).
  { reference: "AM-2026-000004", branch: "Jumeirah surgery", daysAgo: 19 },
  // Processing, both bought on PO-2026-000104, sent 3 days ago.
  { reference: "AM-2026-000008", branch: "Clinic", daysAgo: 6 },
  { reference: "AM-2026-000007", branch: "Deira clinic", daysAgo: 5 },
  // Pending, nothing bought for them yet.
  { reference: "AM-2026-000009", branch: "Deira clinic", daysAgo: 2 },
  { reference: "AM-2026-000021", branch: "Jumeirah surgery", daysAgo: 1 },
];

async function main() {
  const org = await prisma.organisation.findUnique({
    where: { id: ORGANISATION },
    select: { id: true, name: true },
  });
  if (!org) {
    console.log(`No organisation "${ORGANISATION}".`);
    return;
  }

  const branches = await prisma.address.findMany({
    where: { organisationId: org.id },
    select: { id: true, label: true, line1: true, emirate: true, phone: true, contact: true },
  });

  /*
   * By label, first match wins.
   *
   * This account has TWO branches both called "dubai" — a duplicate nobody
   * has cleaned up. Neither is used here, so it does not matter today, but a
   * lookup by label is only safe because the labels this script names are
   * unique among them.
   */
  const branchByLabel = new Map<string, (typeof branches)[number]>();
  for (const branch of branches) {
    if (branch.label && !branchByLabel.has(branch.label)) {
      branchByLabel.set(branch.label, branch);
    }
  }

  const keepRefs = new Set(KEEP.map((k) => k.reference));

  /* ---- what goes ----------------------------------------------------- */

  const mine = await prisma.order.findMany({
    where: {
      organisationId: org.id,
      // The AM-TEST- orders belong to a different account holder and to the
      // order-state demo. Not ours to reshape.
      reference: { startsWith: "AM-2026-" },
    },
    select: {
      id: true,
      reference: true,
      items: { select: { allocations: { select: { id: true } } } },
    },
  });

  const surplus = mine.filter((o) => !keepRefs.has(o.reference));
  const refused = surplus.filter((o) =>
    o.items.some((i) => i.allocations.length > 0)
  );
  const removable = surplus.filter((o) => !refused.includes(o));

  for (const order of refused) {
    console.log(
      `  ${order.reference} — KEPT anyway: it has purchase-order allocations.`
    );
  }

  if (removable.length > 0) {
    await prisma.order.deleteMany({
      where: { id: { in: removable.map((o) => o.id) } },
    });
    for (const order of removable) console.log(`  ${order.reference} — removed`);
  }

  /* ---- what stays, put in order -------------------------------------- */

  console.log("");
  for (const plan of KEEP) {
    const branch = branchByLabel.get(plan.branch);
    if (!branch) {
      console.log(`  ${plan.reference} — no branch called "${plan.branch}", left as it was`);
      continue;
    }

    const order = await prisma.order.findUnique({
      where: { reference: plan.reference },
      select: { id: true, shippingSnapshot: true, status: true },
    });
    if (!order) {
      console.log(`  ${plan.reference} — not found`);
      continue;
    }

    /*
     * The snapshot moves with the address.
     *
     * shippingSnapshot is what the invoice and the delivery note print. Moving
     * an order to a different branch and leaving the snapshot behind would put
     * one branch's name on the record and another's address on the paperwork —
     * exactly the kind of quiet disagreement nobody spots until a delivery
     * goes to the wrong clinic.
     */
    let snapshot = order.shippingSnapshot;
    try {
      const parsed = JSON.parse(order.shippingSnapshot ?? "{}");
      snapshot = JSON.stringify({
        ...parsed,
        line1: branch.line1 ?? parsed.line1,
        emirate: branch.emirate ?? parsed.emirate,
        ...(branch.phone ? { phone: branch.phone } : {}),
        ...(branch.contact ? { contact: branch.contact } : {}),
      });
    } catch {
      // An unparseable snapshot is left exactly as it is rather than replaced
      // with a guess: it is the record of what was actually sent.
    }

    const placedAt = daysAgo(plan.daysAgo);

    await prisma.order.update({
      where: { id: order.id },
      data: {
        addressId: branch.id,
        shippingSnapshot: snapshot,
        placedAt,
        // Payment falls due on the account's terms from the day it was placed;
        // leaving the old due date would put some of them in the past.
        paymentDueOn: new Date(placedAt.getTime() + 14 * 86_400_000),
      },
    });

    console.log(
      `  ${plan.reference}  ${order.status.padEnd(11)} ${plan.branch.padEnd(18)} ${placedAt
        .toISOString()
        .slice(0, 10)}`
    );
  }

  /* ---- prove the two rules hold -------------------------------------- */

  const after = await prisma.order.findMany({
    where: { organisationId: org.id, reference: { startsWith: "AM-2026-" } },
    select: { reference: true, placedAt: true, addressId: true },
  });

  const perBranch = new Map<string, number>();
  const perDay = new Map<string, number>();
  for (const order of after) {
    const b = order.addressId ?? "(none)";
    perBranch.set(b, (perBranch.get(b) ?? 0) + 1);
    const d = order.placedAt.toISOString().slice(0, 10);
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }

  const overBranch = [...perBranch.values()].filter((n) => n > 2).length;
  const overDay = [...perDay.entries()].filter(([, n]) => n > 1);

  console.log("");
  console.log(`${after.length} order(s) on ${org.name}.`);
  console.log(`  branches carrying more than two : ${overBranch}`);
  console.log(
    `  days carrying more than one     : ${overDay.length}` +
      (overDay.length > 0 ? ` (${overDay.map(([d]) => d).join(", ")})` : "")
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
