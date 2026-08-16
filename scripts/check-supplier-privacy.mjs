/**
 * Asserts that no supplier reaches an anonymous visitor — BE-38, SEC-05, DEC-24.
 *
 * AussieMed buys and resells, and a customer never learns who supplied their
 * goods. That is a rule about output, so it is checked against real responses
 * rather than by reading the source: the worst offender was not in the code at
 * all but in the seeded data, where every product carried a specification row
 * labelled "Supplier" naming the company it came from.
 *
 * Needs a server running. Run with: npm run check:privacy
 *
 * NOTE ON SCOPE. This checks for *structural* exposure — supplier fields, a
 * supplier list, a supplier-labelled attribute, the suppliers endpoint. It
 * deliberately does not fail on the strings "Livingstone" or "Chemist
 * Warehouse" appearing in a product name, brand or description, because the
 * seeded catalogue is literally their product data and those occurrences are
 * DA-01 and DA-17, not a leak in this code. Those counts are reported so the
 * number is visible, and should fall to zero when the real catalogue lands.
 */
const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";

const PUBLIC_PATHS = [
  "/api/v1/catalog/snapshot",
  "/api/v1/products",
  "/api/v1/search/suggest?q=glove",
  "/",
  "/products",
  "/cart",
];

let failures = 0;
const fail = (message) => {
  failures++;
  console.log(`  FAIL  ${message}`);
};
const pass = (message) => console.log(`  PASS  ${message}`);

console.log("Supplier privacy\n");

/* 1. The public suppliers endpoint must not exist. */
{
  const res = await fetch(`${BASE}/api/v1/suppliers`);
  if (res.status === 404) pass("the public suppliers endpoint is gone");
  else fail(`/api/v1/suppliers answered ${res.status}, expected 404`);
}

/* 2. No supplier field, list or attribute in any public payload. */
for (const path of PUBLIC_PATHS) {
  const res = await fetch(BASE + path);
  const body = await res.text();

  const problems = [];
  if (/"supplier(Id|Name)?"\s*:/.test(body)) problems.push("a supplier field");
  if (/"suppliers"\s*:/.test(body)) problems.push("a supplier list");
  if (/"label"\s*:\s*"Supplier"/.test(body)) problems.push("a Supplier attribute");
  // The rendered page carries the same data through the catalogue provider,
  // so the escaped form has to be checked too.
  if (/\\"label\\"\s*:\s*\\"Supplier\\"/.test(body)) problems.push("a Supplier attribute");

  if (problems.length === 0) pass(`${path} carries no supplier`);
  else fail(`${path} carries ${[...new Set(problems)].join(" and ")}`);
}

/* 3. Report third-party attribution, which is DA-17 rather than a leak. */
{
  const snapshot = await (await fetch(`${BASE}/api/v1/catalog/snapshot`)).json();
  const counts = { name: 0, brand: 0, description: 0 };
  for (const product of snapshot.products ?? []) {
    for (const field of Object.keys(counts)) {
      const value = product[field];
      if (typeof value === "string" && /Livingstone|Chemist Warehouse/.test(value)) {
        counts[field]++;
      }
    }
  }
  const total = counts.name + counts.brand + counts.description;
  console.log(
    total === 0
      ? "\n  Third-party attribution: none — the real catalogue has landed."
      : `\n  Third-party attribution (DA-17, expected until DA-01 lands): ` +
          `${counts.name} names, ${counts.brand} brands, ${counts.description} descriptions.`
  );
}

/* 4. The other direction: no customer reaches a supplier — SEC-05.
 *
 * Checked against the rendered purchase order rather than the schema, because
 * the risk is a template quietly rendering something, not a column existing.
 * Only the document is read; the operator's own name legitimately appears in
 * the sidebar, and the supplier's name legitimately appears on their own order.
 */
{
  const { default: Database } = await import("better-sqlite3");
  const db = new Database("dev.db", { readonly: true });

  const po = db
    .prepare(`select "poNumber" from "PurchaseOrder" order by "poNumber" limit 1`)
    .get();

  if (!po) {
    console.log("\n  SKIP  no purchase orders exist yet");
    db.close();
  } else {
    const identifiers = [
      ...db.prepare(`select "name","email" from "User" where "role" = 'Customer'`).all()
        .flatMap((u) => [u.name, u.email]),
      ...db.prepare(`select "name" from "Organisation"`).all().map((o) => o.name),
      ...db.prepare(`select "reference" from "Order"`).all().map((o) => o.reference),
    ].filter(Boolean);
    db.close();

    const auth = await fetch(`${BASE}/api/v1/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: "admin", password: "123456", expectRole: "Admin" }),
    });

    if (!auth.ok) {
      fail("could not sign in to read a purchase order");
    } else {
      const cookie = auth.headers.getSetCookie().join("; ").split(";")[0];
      const html = await (
        await fetch(`${BASE}/admin/purchasing/${po.poNumber}`, { headers: { cookie } })
      ).text();

      // <main> only — the shell around it carries the operator's identity.
      const main = html.slice(html.indexOf('id="main"'));
      const found = identifiers.filter((value) => main.includes(value));

      if (found.length === 0) pass(`${po.poNumber} names no customer`);
      else fail(`${po.poNumber} names ${found.join(", ")}`);
    }
  }
}

/* 5. The supplier portal — BE-39.
 *
 * Two separate risks: a supplier seeing a customer, and a supplier seeing
 * another supplier. The second is checked by asking for someone else's
 * purchase order by number, which should not resolve at all.
 */
{
  const { default: Database } = await import("better-sqlite3");
  const db = new Database("dev.db", { readonly: true });

  const supplierUser = db
    .prepare(
      `select u."username", s."id" as supplierId
       from "User" u join "Supplier" s on s."userId" = u."id" limit 1`
    )
    .get();

  const identifiers = [
    ...db.prepare(`select "name","email" from "User" where "role" = 'Customer'`).all()
      .flatMap((u) => [u.name, u.email]),
    ...db.prepare(`select "name" from "Organisation"`).all().map((o) => o.name),
    ...db.prepare(`select "reference" from "Order"`).all().map((o) => o.reference),
  ].filter(Boolean);

  const someoneElses = supplierUser
    ? db
        .prepare(
          `select "poNumber" from "PurchaseOrder"
           where "supplierId" != ? and "status" != 'Draft' limit 1`
        )
        .get(supplierUser.supplierId)
    : null;
  db.close();

  if (!supplierUser) {
    console.log("\n  SKIP  no supplier login exists");
  } else {
    const auth = await fetch(`${BASE}/api/v1/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identifier: supplierUser.username,
        password: "123456",
        expectRole: "Supplier",
      }),
    });

    if (!auth.ok) {
      fail("could not sign in as a supplier");
    } else {
      const cookie = auth.headers.getSetCookie().join("; ").split(";")[0];

      const portal = await (
        await fetch(`${BASE}/business-portal`, { headers: { cookie } })
      ).text();
      const found = identifiers.filter((value) => portal.includes(value));
      if (found.length === 0) pass("the supplier portal names no customer");
      else fail(`the supplier portal names ${found.join(", ")}`);

      if (someoneElses) {
        const res = await fetch(
          `${BASE}/business-portal/orders/${someoneElses.poNumber}`,
          { headers: { cookie } }
        );
        if (res.status === 404) {
          pass(`another supplier's ${someoneElses.poNumber} does not resolve`);
        } else {
          fail(
            `another supplier's ${someoneElses.poNumber} answered ${res.status}, expected 404`
          );
        }
      }
    }
  }
}

console.log(
  failures === 0
    ? "\nNeither side can see the other\n"
    : `\n${failures} check(s) failed\n`
);
process.exit(failures === 0 ? 0 : 1);
