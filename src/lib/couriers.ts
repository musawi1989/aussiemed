import "server-only";

import { db } from "./db";
import { audit, requireAdmin, type Result } from "./admin";

/**
 * The list of carriers a parcel can be handed to.
 *
 * Two screens ask for a courier and both used a free-text box: the admin
 * setting who is taking an order to the customer, and a supplier in the
 * business portal saying who is bringing goods to us. Free text is how
 * "Aramex", "aramex" and "ARAMEX " become three couriers, and it is found out
 * by whoever first tries to compare carriers on late deliveries.
 *
 * READING IS NOT GUARDED, WRITING IS. A supplier in the portal needs the list
 * to pick from and is not an admin; the names of public carriers are not a
 * secret. Everything that changes the list requires an admin and is audited,
 * like every other admin write.
 *
 * Nothing is ever hard deleted. See the note on the model: the courier's NAME
 * is what an order stores, so a row can go from the pickers without touching
 * what last year's delivery notes say — which is exactly what archiving does,
 * and what a delete would not.
 */

const fail = (error: string): Result<never> => ({ ok: false, error });

export type CourierRow = {
  id: string;
  name: string;
  isArchived: boolean;
  sortOrder: number;
};

/** The whole list, in the order it should appear. */
export async function listCouriers(
  includeArchived = false
): Promise<CourierRow[]> {
  return db.courier.findMany({
    where: includeArchived ? {} : { isArchived: false },
    orderBy: [{ isArchived: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, isArchived: true, sortOrder: true },
  });
}

/**
 * The names a picker should offer, with whatever is already stored folded in.
 *
 * `current` is the value on the order being edited. If it is not on the list —
 * an archived courier, or a name typed before this list existed — it is added
 * so that opening an old order and saving it cannot silently blank a courier
 * that has been delivering parcels for a year. The same rule the address
 * subdivision picker follows.
 */
export async function courierOptions(
  current?: string | null
): Promise<string[]> {
  const names = (await listCouriers()).map((c) => c.name);
  const held = current?.trim();
  if (held && !names.some((n) => n.toLowerCase() === held.toLowerCase())) {
    return [...names, held];
  }
  return names;
}

export async function createCourier(name: string): Promise<Result<string>> {
  const actor = await requireAdmin("settings");

  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return fail("A courier needs a name.");
  if (clean.length > 60) return fail("That name is too long for a picker.");

  // Case-insensitively, because "Aramex" and "aramex" being two rows is the
  // whole problem this list exists to stop. SQLite's unique index would not
  // have caught it.
  const clash = (await listCouriers(true)).find(
    (c) => c.name.toLowerCase() === clean.toLowerCase()
  );
  if (clash) {
    return fail(
      clash.isArchived
        ? `${clash.name} is on the list but archived. Restore it rather than adding a second.`
        : `${clash.name} is already on the list.`
    );
  }

  const last = await db.courier.findFirst({ orderBy: { sortOrder: "desc" } });

  const created = await db.courier.create({
    data: { name: clean, sortOrder: (last?.sortOrder ?? 0) + 10 },
  });

  await audit(actor, "courier.create", "Courier", created.id, null, {
    name: clean,
  });
  return { ok: true, value: created.id };
}

/** Off the pickers, still readable on every order that names it. */
export async function archiveCourier(id: string): Promise<Result> {
  const actor = await requireAdmin("settings");

  const courier = await db.courier.findUnique({ where: { id } });
  if (!courier) return fail("That courier no longer exists.");
  if (courier.isArchived) return { ok: true, value: undefined };

  await db.courier.update({ where: { id }, data: { isArchived: true } });
  await audit(actor, "courier.archive", "Courier", id, courier, {
    ...courier,
    isArchived: true,
  });
  return { ok: true, value: undefined };
}

export async function restoreCourier(id: string): Promise<Result> {
  const actor = await requireAdmin("settings");

  const courier = await db.courier.findUnique({ where: { id } });
  if (!courier) return fail("That courier no longer exists.");
  if (!courier.isArchived) return { ok: true, value: undefined };

  await db.courier.update({ where: { id }, data: { isArchived: false } });
  await audit(actor, "courier.restore", "Courier", id, courier, {
    ...courier,
    isArchived: false,
  });
  return { ok: true, value: undefined };
}

/**
 * How many orders still name this courier.
 *
 * Shown beside the archive control so a person can see what they are taking
 * off the list. It is not a blocker — archiving is safe precisely because the
 * name is stored on the order — but "used by 43 orders" and "used by none" are
 * different decisions and the screen should not make them look the same.
 */
export async function courierUsage(name: string): Promise<number> {
  const [orders, purchaseOrders] = await Promise.all([
    db.order.count({ where: { courier: name } }),
    db.purchaseOrder.count({ where: { courier: name } }),
  ]);
  return orders + purchaseOrders;
}
