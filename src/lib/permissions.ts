import "server-only";

import { db } from "./db";
import { audit, requireAdmin, type Result } from "./admin";
import {
  ALL_SUPPLIER_PERMISSIONS,
  findPermission,
  permissionSettingKey,
  resolveMode,
  type PermissionMap,
  type PermissionMode,
} from "./permission-catalogue";

/**
 * Reading and enforcing what a supplier is allowed to do.
 *
 * The definitions are in permission-catalogue.ts, which is pure so the admin
 * panel can import it. This half touches the database and is server-only.
 *
 * HELD AS Setting ROWS, not as a new table. It is the same shape as every
 * other piece of configuration here — a key and a value, changed without a
 * deploy — and a ten-row table with a fixed set of keys would be a table
 * pretending to be a settings file. It also means no migration, which matters
 * for something whose whole promise is that it changes nothing on install.
 *
 * ENFORCEMENT IS SERVER-SIDE, ALWAYS. The portal hides what a supplier cannot
 * do, but hiding is a courtesy, not a control: the form still posts if
 * somebody has the page open when a permission changes under them. Every
 * capability calls `ensure` before it acts, so the answer is the same whether
 * it arrives from our button or from curl.
 */

/**
 * Every permission with its live mode, defaults filled in.
 *
 * One query for all ten rather than one per capability, because the supplier
 * portal reads several on a single page render and ten round trips to answer
 * "what can this person see" is a page that feels slow for no reason.
 */
export async function supplierPermissions(): Promise<PermissionMap> {
  const rows = await db.setting.findMany({
    where: {
      key: { in: ALL_SUPPLIER_PERMISSIONS.map((p) => permissionSettingKey(p.key)) },
    },
    select: { key: true, value: true },
  });

  const stored = new Map(rows.map((row) => [row.key, row.value]));

  const map: PermissionMap = {};
  for (const definition of ALL_SUPPLIER_PERMISSIONS) {
    map[definition.key] = resolveMode(
      definition,
      stored.get(permissionSettingKey(definition.key))
    );
  }
  return map;
}

/** One permission, for the many callers that only care about one. */
export async function supplierPermission(key: string): Promise<PermissionMode> {
  const definition = findPermission(key);
  if (!definition) {
    // A typo in a key would otherwise read as "off" and quietly disable a
    // working feature. Loud, because it is a programming error, not a setting.
    throw new Error(`Unknown supplier permission: ${key}`);
  }

  const row = await db.setting.findUnique({
    where: { key: permissionSettingKey(key) },
    select: { value: true },
  });
  return resolveMode(definition, row?.value);
}

/**
 * The guard every gated function calls.
 *
 * Returns a Result rather than throwing, because a supplier meeting a
 * permission they do not have is not an exception — it is an ordinary refusal
 * that the portal should show them in words. The message names the thing they
 * tried to do and tells them who to ask, because "Forbidden" leaves somebody
 * ringing us to find out what happened.
 */
export async function ensure(key: string): Promise<Result> {
  const mode = await supplierPermission(key);
  if (mode === "off") {
    const definition = findPermission(key);
    return {
      ok: false,
      error: `${definition?.label ?? "That"} is not something your account can do. Get in touch and we will sort it out.`,
    };
  }
  return { ok: true, value: undefined };
}

export async function setSupplierPermission(
  key: string,
  mode: string
): Promise<Result> {
  const actor = await requireAdmin("settings");

  const definition = findPermission(key);
  if (!definition) return { ok: false, error: "No such permission." };

  if (!definition.modes.includes(mode as PermissionMode)) {
    // Not every capability offers every mode, and a posted value that is not
    // on the list is either a stale form or somebody trying it on.
    return { ok: false, error: `${definition.label} cannot be set to that.` };
  }

  const settingKey = permissionSettingKey(key);
  const before = await supplierPermission(key);
  if (before === mode) return { ok: true, value: undefined };

  await db.setting.upsert({
    where: { key: settingKey },
    update: { value: mode },
    create: { key: settingKey, value: mode },
  });

  // Audited by permission key, so the trail reads "changePrice: approval to
  // allowed" rather than naming a Setting row nobody recognises.
  await audit(actor, "permission.supplier", "Permission", key, before, mode);
  return { ok: true, value: undefined };
}

/**
 * Put every permission back to how the code behaved before the panel existed.
 *
 * Deletes the rows rather than writing the defaults into them, so a later
 * change to a default is picked up rather than being frozen at whatever it was
 * on the day somebody pressed this.
 */
export async function resetSupplierPermissions(): Promise<Result<number>> {
  const actor = await requireAdmin("settings");

  const { count } = await db.setting.deleteMany({
    where: {
      key: { in: ALL_SUPPLIER_PERMISSIONS.map((p) => permissionSettingKey(p.key)) },
    },
  });

  await audit(actor, "permission.supplier.reset", "Permission", "all", count, 0);
  return { ok: true, value: count };
}
