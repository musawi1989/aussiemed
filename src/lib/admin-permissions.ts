/**
 * What each admin is allowed to see and do.
 *
 * PURE ON PURPOSE, like permission-catalogue.ts next door and for the same
 * reason: the master admin's console is a client component and the enforcement
 * is server-only, and a `server-only` import in a client component is a build
 * error. Definitions live here; reading and writing them lives in
 * admin-team.ts.
 *
 * ⚠ WHAT THIS IS, AND WHAT IT IS NOT.
 *
 * Each section has separate viewing and write permissions. Write access covers
 * the section's actions together, not individual fields or buttons. Orders
 * write access, for example, includes payment adjustments and refunds.
 *
 * THE MASTER ADMIN IS NOT IN THIS LIST. They hold everything, always, and it
 * cannot be switched off — a permission screen that can lock the last person
 * out of the permission screen is a bricked system with extra steps. See
 * admin-team.ts, where that is enforced rather than assumed.
 *
 * A NEW SECTION DEFAULTS TO GRANTED. When somebody adds a screen next month,
 * every existing admin keeps working and the master admin decides at leisure.
 * The alternative — deny by default — silently removes access from people who
 * had it, on a deploy nobody connected to permissions.
 */

export type AdminPermissionDef = {
  key: string;
  label: string;
  /** What granting it actually lets them reach, in plain words. */
  detail: string;
  /** Every path under this section. Order matters: longest match wins. */
  paths: string[];
};

export type AdminPermissionGroup = {
  heading: string;
  permissions: AdminPermissionDef[];
};

const ADMIN_SECTIONS: AdminPermissionGroup[] = [
  {
    heading: "Sales",
    permissions: [
      {
        key: "orders",
        label: "Orders",
        detail:
          "Every customer order: status, payments, delivery, packing lists, the tax invoice and the internal notes.",
        paths: ["/admin/orders", "/admin/searches", "/admin/received-products"],
      },
      {
        key: "bulkBuy",
        label: "Bulk buy requests",
        detail:
          "Requests a buyer has built from the catalogue: reading them, writing and emailing the answer, and marking a request completed.",
        paths: ["/admin/bulk-buy"],
      },
      {
        key: "approvals",
        label: "Needs attention",
        detail:
          "The queues — account changes to approve and the restock waitlist. Bulk buy requests have their own section.",
        paths: ["/admin/approvals"],
      },
    ],
  },
  {
    heading: "Catalogue",
    permissions: [
      {
        key: "products",
        label: "Products and categories",
        detail:
          "Creating and editing products, packs, prices, price breaks, images, documents and the category tree. Includes the catalogue upload.",
        paths: ["/admin/products", "/admin/categories"],
      },
    ],
  },
  {
    heading: "Buying",
    permissions: [
      {
        key: "purchasing",
        label: "Purchase orders and back orders",
        detail:
          "The daily buying run, sending orders to suppliers, booking goods in, and re-sourcing what a supplier cannot send. Shows what we pay.",
        paths: ["/admin/purchasing"],
      },
    ],
  },
  {
    heading: "People",
    permissions: [
      {
        key: "customers",
        label: "Customers and accounts",
        detail:
          "Trade accounts, their branches and people, agreed prices, payment terms and credit limits. Includes new trade applications.",
        paths: ["/admin/customers", "/admin/applications"],
      },
      {
        key: "suppliers",
        label: "Suppliers",
        detail:
          "Supplier records, who covers which pack, the prices they have asked for, and the daily demand report. Shows what we pay.",
        paths: ["/admin/suppliers"],
      },
    ],
  },
  {
    heading: "Money",
    permissions: [
      {
        key: "reports",
        label: "Profit and margin reports",
        detail:
          "What AussieMed makes, by product, by customer and by supplier. This is the section that shows margin, so it is the one most worth withholding.",
        paths: ["/admin/reports"],
      },
    ],
  },
  {
    heading: "System",
    permissions: [
      {
        key: "settings",
        label: "Settings",
        detail:
          "Company details, VAT, couriers, the daily cutoff, and what suppliers are allowed to do without us.",
        paths: ["/admin/settings", "/admin/roles"],
      },
      {
        key: "email",
        label: "Email",
        detail:
          "Everything AussieMed has tried to send, writing one by hand, and the wording of the automatic messages.",
        paths: ["/admin/emails"],
      },
      {
        key: "audit",
        label: "Audit trail",
        detail:
          "Every change anybody has made in the back office, and who made it.",
        paths: ["/admin/audit"],
      },
    ],
  },
];

export const ADMIN_PERMISSIONS: AdminPermissionGroup[] = ADMIN_SECTIONS.map((group) => ({
  ...group,
  permissions: group.permissions.flatMap((permission) => [permission, {
    key: `${permission.key}:write`,
    label: `${permission.label}: make changes`,
    detail: "Allow updates and actions in this section. Viewing the section must also be allowed.",
    paths: [],
  }]),
}));

export const ALL_ADMIN_PERMISSIONS: AdminPermissionDef[] =
  ADMIN_PERMISSIONS.flatMap((group) => group.permissions);

export const ADMIN_PERMISSION_KEYS: string[] = ALL_ADMIN_PERMISSIONS.map(
  (permission) => permission.key
);

export function findAdminPermission(key: string): AdminPermissionDef | undefined {
  return ALL_ADMIN_PERMISSIONS.find((permission) => permission.key === key);
}

/**
 * Which permission a path needs, or null where none does.
 *
 * LONGEST MATCH WINS, so a section nested under another is answered by its own
 * rule rather than by its parent's. Nothing nests today; the rule is here so
 * that the first time something does, it does not quietly inherit.
 *
 * A path nobody has claimed returns null and is allowed. That is the same
 * default as a new section — see the note at the top — and it is why the
 * dashboard and any one-off screen keep working without an entry.
 */
export function permissionForPath(pathname: string): string | null {
  let best: { key: string; length: number } | null = null;

  for (const permission of ALL_ADMIN_PERMISSIONS) {
    for (const path of permission.paths) {
      const matches = pathname === path || pathname.startsWith(`${path}/`);
      if (!matches) continue;
      if (!best || path.length > best.length) {
        best = { key: permission.key, length: path.length };
      }
    }
  }

  return best?.key ?? null;
}

/**
 * Whether somebody may reach a path.
 *
 * The master admin short-circuits everything, which is the point of them.
 */
export function canReach(
  pathname: string,
  { isMaster, denied }: { isMaster: boolean; denied: readonly string[] }
): boolean {
  if (isMaster) return true;
  const key = permissionForPath(pathname);
  return key === null || !denied.includes(key);
}

export function canUseSection(
  key: string,
  mode: "view" | "write",
  { isMaster, denied }: { isMaster: boolean; denied: readonly string[] }
): boolean {
  if (!ADMIN_SECTIONS.some((group) => group.permissions.some((permission) => permission.key === key))) return false;
  return isMaster || (!denied.includes(key) && (mode === "view" || !denied.includes(`${key}:write`)));
}

/**
 * Stored as DENIALS, not grants.
 *
 * A row means "this person may not", and its absence means they may. That is
 * what makes a new section default to granted without a migration writing a
 * row for every admin who exists — and it means a permission that is removed
 * from the catalogue leaves a harmless orphan rather than silently locking
 * somebody out of something else.
 */
export function deniedFrom(rows: readonly { key: string }[]): string[] {
  return rows
    .map((row) => row.key)
    .filter((key) => ADMIN_PERMISSION_KEYS.includes(key));
}
