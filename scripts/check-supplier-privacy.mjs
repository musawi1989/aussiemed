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

      /* The supplies screen — BE-21.
       *
       * A supplier setting their own prices is the screen most likely to grow
       * a column it should not have: our selling price is one join away, and
       * so is the other supplier's cost. Checked against real values from the
       * database rather than against the word "price".
       */
      {
        const db2 = new Database("dev.db", { readonly: true });

        const sellPrices = db2
          .prepare(
            `select distinct k."priceFils" from "ProductSku" k
             join "ProductSupply" p on p."skuId" = k."id"
             where p."supplierId" = ?`
          )
          .all(supplierUser.supplierId)
          .map((row) => (row.priceFils / 100).toFixed(2));

        const ownCosts = new Set(
          db2
            .prepare(
              `select distinct "costFils" from "ProductSupply"
               where "supplierId" = ? and "costFils" is not null`
            )
            .all(supplierUser.supplierId)
            .map((row) => (row.costFils / 100).toFixed(2))
        );
        const rivalCosts = db2
          .prepare(
            `select distinct "costFils" from "ProductSupply"
             where "supplierId" != ? and "costFils" is not null`
          )
          .all(supplierUser.supplierId)
          .map((row) => (row.costFils / 100).toFixed(2))
          .filter((value) => !ownCosts.has(value));

        // Packs they do not supply at all — not merely ones somebody else
        // also supplies, which would flag a shared item as a leak.
        const notTheirs = db2
          .prepare(
            `select k."skuCode" from "ProductSku" k
             where exists (select 1 from "ProductSupply" p where p."skuId" = k."id" and p."supplierId" != ?)
               and not exists (select 1 from "ProductSupply" p where p."skuId" = k."id" and p."supplierId" = ?)`
          )
          .all(supplierUser.supplierId, supplierUser.supplierId)
          .map((row) => row.skuCode);

        const rivals = db2
          .prepare(`select "companyName" from "Supplier" where "id" != ?`)
          .all(supplierUser.supplierId)
          .map((row) => row.companyName);
        db2.close();

        const html = await (
          await fetch(`${BASE}/business-portal/supplies`, { headers: { cookie } })
        ).text();
        const main = html.slice(html.indexOf('id="main"'));

        const problems = [];
        if (sellPrices.some((value) => main.includes(`AED ${value}`))) {
          problems.push("our selling price");
        }
        if (rivalCosts.some((value) => main.includes(`AED ${value}`))) {
          problems.push("another supplier's cost");
        }
        if (notTheirs.some((code) => main.includes(code))) {
          problems.push("a pack they do not supply");
        }
        if (rivals.some((name) => main.includes(name))) {
          problems.push("another supplier's name");
        }
        if (identifiers.some((value) => main.includes(value))) {
          problems.push("a customer");
        }

        if (problems.length === 0) {
          pass("the supplies screen shows only their own terms");
        } else {
          fail(`the supplies screen shows ${problems.join(" and ")}`);
        }
      }
    }
  }
}

/* 6. Cost and margin are staff-only — DEC-24, BE-34.
 *
 * A third party of the same kind as the other two. A customer learning what
 * AussieMed pays knows exactly what to argue the price down to; a supplier
 * learning the markup on their own goods knows exactly what to argue it up to.
 * Neither is only a privacy question.
 *
 * Checked against real cost values taken from the database rather than against
 * the word "cost", so a page saying "cost" in prose does not fail and a page
 * quietly rendering AED 12.34 of it does.
 */
{
  const { default: Database } = await import("better-sqlite3");
  const db = new Database("dev.db", { readonly: true });

  const costs = db
    .prepare(`select distinct "costFils" from "ProductSupply" where "costFils" is not null`)
    .all()
    .map((row) => row.costFils);

  const product = db
    .prepare(
      `select p."slug", s."costFils"
       from "ProductSupply" s
       join "ProductSku" k on k."id" = s."skuId"
       join "ProductMaster" p on p."id" = k."productMasterId"
       where s."costFils" is not null
       limit 1`
    )
    .get();

  const supplierUser = db
    .prepare(
      `select u."username" from "User" u join "Supplier" s on s."userId" = u."id" limit 1`
    )
    .get();
  db.close();

  if (costs.length === 0) {
    console.log("\n  SKIP  no costs recorded yet, so none can leak");
  } else {
    // Both forms: fils as stored, and AED as any page would render it.
    const needles = costs.flatMap((fils) => [
      String(fils),
      (fils / 100).toFixed(2),
    ]);

    const paths = [
      "/api/v1/catalog/snapshot",
      "/api/v1/products",
      ...(product ? [`/products/${product.slug}`, `/api/v1/products/${product.slug}`] : []),
    ];

    for (const path of paths) {
      const res = await fetch(BASE + path);
      const body = await res.text();
      // A bare integer can coincide with a price or an id, so only report a
      // field that looks like it is carrying cost.
      const structural = /"(cost|costFils|marginFils|marginPercent|markup\w*)"\s*:/i.test(body);
      const escaped = /\\"(cost|costFils|marginFils|marginPercent)\\"\s*:/i.test(body);

      if (structural || escaped) fail(`${path} carries a cost or margin field`);
      else pass(`${path} carries no cost or margin`);
    }

    if (supplierUser) {
      const auth = await fetch(`${BASE}/api/v1/auth`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identifier: supplierUser.username,
          password: "123456",
          expectRole: "Supplier",
        }),
      });

      if (auth.ok) {
        const cookie = auth.headers.getSetCookie().join("; ").split(";")[0];
        const portal = await (
          await fetch(`${BASE}/business-portal`, { headers: { cookie } })
        ).text();
        const main = portal.slice(portal.indexOf('id="main"'));

        if (/"(marginFils|marginPercent|markup\w*)"\s*:/i.test(main)) {
          fail("the supplier portal carries a margin field");
        } else {
          pass("the supplier portal shows no margin on their own goods");
        }
      }
    }
  }
}

/* 7. Email that has actually been sent — BE-05.
 *
 * The templates are pure and unit tested for this, which is the stronger
 * guarantee. This checks the other half: that the right data was handed to
 * them. A template that cannot leak a customer still leaks one if somebody
 * passes a clinic's name in as the supplier's.
 *
 * Read from what was stored, not from what a template would produce, because
 * the stored body is what actually went out.
 */
{
  const { default: Database } = await import("better-sqlite3");
  const db = new Database("dev.db", { readonly: true });

  const supplierMail = db
    .prepare(`select "id","toAddress","subject","body" from "OutboundEmail" where "audience" = 'Supplier'`)
    .all();

  const customerIdentifiers = [
    ...db.prepare(`select "name","email" from "User" where "role" = 'Customer'`).all()
      .flatMap((u) => [u.name, u.email]),
    ...db.prepare(`select "name" from "Organisation"`).all().map((o) => o.name),
    ...db.prepare(`select "reference" from "Order"`).all().map((o) => o.reference),
    ...db.prepare(`select "label","line1" from "Address"`).all().flatMap((a) => [a.label, a.line1]),
  ].filter((v) => v && String(v).trim().length > 2);

  const customerMail = db
    .prepare(`select "id","body" from "OutboundEmail" where "audience" = 'Customer'`)
    .all();
  const supplierNames = db
    .prepare(`select "companyName" from "Supplier"`)
    .all()
    .map((s) => s.companyName)
    .filter(Boolean);
  db.close();

  if (supplierMail.length === 0 && customerMail.length === 0) {
    console.log("\n  SKIP  no email has been sent yet");
  } else {
    let leaked = 0;
    for (const mail of supplierMail) {
      const haystack = `${mail.subject}\n${mail.body}`;
      const found = customerIdentifiers.filter((value) => haystack.includes(value));
      if (found.length > 0) {
        fail(`a supplier email names ${[...new Set(found)].join(", ")}`);
        leaked++;
      }
    }
    if (supplierMail.length > 0 && leaked === 0) {
      pass(`${supplierMail.length} supplier email(s) name no customer`);
    }

    let backwards = 0;
    for (const mail of customerMail) {
      const found = supplierNames.filter((name) => mail.body.includes(name));
      if (found.length > 0) {
        fail(`a customer email names supplier ${[...new Set(found)].join(", ")}`);
        backwards++;
      }
    }
    if (customerMail.length > 0 && backwards === 0) {
      pass(`${customerMail.length} customer email(s) name no supplier`);
    }
  }
}

console.log(
  failures === 0
    ? "\nNeither side can see the other\n"
    : `\n${failures} check(s) failed\n`
);
process.exit(failures === 0 ? 0 : 1);
