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

/* The three carve-outs this check makes, kept in their own module so they can
   be tested — see src/lib/privacy-match.test.ts. Each one makes the guard
   quieter, which is exactly the kind of code that should not live only inside
   a script nothing exercises. */
import {
  mentionsCode,
  namesAnyOf,
  stripAssetPaths,
  stripBrandNames,
} from "./privacy-match.mjs";

/**
 * The password every seeded account shares — prisma/seed-accounts.ts and
 * seed-demo.ts both set it.
 *
 * It was "123456", hard-coded in three places, and stopped being true when the
 * platform was wiped and reseeded. The check then failed at "could not sign in
 * as a supplier", which reads like a privacy failure and was a stale constant
 * — and a guardrail that cannot sign in is a guardrail checking nothing.
 */
const SEEDED_PASSWORD = "AussieMed2026!";

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
      body: JSON.stringify({ identifier: "admin", password: SEEDED_PASSWORD, expectRole: "Admin" }),
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
      const found = namesAnyOf(main, identifiers);

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
        password: SEEDED_PASSWORD,
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
      const found = namesAnyOf(portal, identifiers);
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

        /*
         * Product names carrying a supplier's name, so a BRAND is not read as
         * a disclosure of who supplies it — the same narrow carve-out the
         * email check makes, and made here for the same reason.
         *
         * "Livingstone" is one of our suppliers and also a brand on 16
         * products. This screen lists the packs THIS supplier has taken on,
         * and one of them is a Livingstone-branded glove: a name printed on
         * the storefront, on the box, and in the search results the supplier
         * found it through. That is not a disclosure, and a check that calls
         * it one is a check people learn to ignore.
         *
         * ⚠ NARROW, NOT A RELAXATION. Only occurrences inside a product name
         * from our own catalogue are forgiven; the name is cut out and
         * whatever is left is still searched, so a row actually attributing a
         * pack to "Livingstone" still fails.
         */
        const brandNames = db2
          .prepare(`select "name" from "ProductMaster"`)
          .all()
          .map((r) => r.name)
          .filter((name) => name && rivals.some((s) => name.includes(s)))
          // Longest first, so a longer title is stripped before a shorter one
          // that is a prefix of it and cannot leave a fragment behind.
          .sort((a, b) => b.length - a.length);
        db2.close();

        const html = await (
          await fetch(`${BASE}/business-portal/supplies`, { headers: { cookie } })
        ).text();

        /*
         * An image filename is not an attribution.
         *
         * The seed names product photographs after a SKU code, and a
         * photograph belongs to the PRODUCT rather than to one of its packs.
         * So a supplier looking at a pack they genuinely supply was served
         * /products/seed/GLPF100ZL.png, and a substring search read that
         * filename as "a pack they do not supply". Every occurrence it flagged
         * was a sibling pack of a product this supplier already covers, which
         * is to say it disclosed nothing at all.
         *
         * STRIPPED BY FILE PATH, NOT BY ATTRIBUTE, because the same paths come
         * back a second time inside the serialised props in the RSC payload —
         * as \"image\":\"/products/seed/GLPF100ZL.png\" — where no src=
         * attribute exists to match on. A path ending in an image extension is
         * never a disclosure however it is spelled.
         *
         * Only paths go. Every other word on the page, visible or serialised,
         * is still searched.
         */
        const main = stripAssetPaths(html.slice(html.indexOf('id="main"')));

        const problems = [];
        if (sellPrices.some((value) => main.includes(`AED ${value}`))) {
          problems.push("our selling price");
        }
        if (rivalCosts.some((value) => main.includes(`AED ${value}`))) {
          problems.push("another supplier's cost");
        }
        /*
         * SKU codes need a boundary, because they are prefixes of each other.
         *
         * The supplier covers GLPF100ZL-10; the catalogue also holds
         * GLPF100ZL, which they do not. A plain substring search finds the
         * shorter code inside the longer one and reports a pack they do not
         * supply — on a row showing the pack they do. Every occurrence this
         * check flagged was of that shape.
         *
         * A code is only really present if what follows it cannot be part of
         * the same code. Hyphens and alphanumerics continue a SKU code here,
         * so a match followed by one of those is a prefix, not a hit.
         */
        if (notTheirs.some((code) => mentionsCode(main, code))) {
          problems.push("a pack they do not supply");
        }
        // Brand occurrences cut out first; anything left that still names a
        // rival is a real attribution.
        const withoutBrands = stripBrandNames(main, brandNames);
        if (rivals.some((name) => withoutBrands.includes(name))) {
          problems.push("another supplier's name");
        }
        if (namesAnyOf(main, identifiers).length > 0) {
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

  // Active only. An Inactive product 404s, and a check that passes because
  // the page does not exist is worse than no check — it reads as proof.
  const product = db
    .prepare(
      `select p."slug", s."costFils"
       from "ProductSupply" s
       join "ProductSku" k on k."id" = s."skuId"
       join "ProductMaster" p on p."id" = k."productMasterId"
       where s."costFils" is not null and p."status" = 'Active' and k."isActive" = 1
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

      // A 404 carries no cost because it carries nothing. Say so rather than
      // recording a pass that proves nothing.
      if (res.status !== 200) {
        fail(`${path} answered ${res.status}, so this check proved nothing`);
        continue;
      }
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
          password: SEEDED_PASSWORD,
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

  /*
   * Product names, so a BRAND that shares a supplier's name is not read as a
   * disclosure of who supplies it.
   *
   * "Livingstone" is both one of our suppliers and a brand on 16 products. A
   * plain substring search therefore failed the moment a customer ordered a
   * Livingstone pipette, because their own order confirmation listed the item
   * they had just chosen — a name printed on the storefront, on the box, and
   * in the search results they found it through. That is not a leak, and a
   * check that calls it one is a check people learn to ignore.
   *
   * ⚠ THIS IS A NARROW CARVE-OUT, NOT A RELAXATION. Only occurrences INSIDE a
   * product name from our own catalogue are forgiven. The name is removed from
   * the body and whatever is left is still searched, so "supplied by
   * Livingstone" on a customer email fails exactly as it did before — which is
   * the sentence this check exists to catch.
   */
  const productNames = db
    .prepare(`select "name" from "ProductMaster"`)
    .all()
    .map((r) => r.name)
    .filter((name) => name && supplierNames.some((s) => name.includes(s)))
    // Longest first, so a longer title is stripped before a shorter one that
    // is a prefix of it and cannot leave a fragment behind.
    .sort((a, b) => b.length - a.length);
  db.close();

  if (supplierMail.length === 0 && customerMail.length === 0) {
    console.log("\n  SKIP  no email has been sent yet");
  } else {
    let leaked = 0;
    for (const mail of supplierMail) {
      const haystack = `${mail.subject}\n${mail.body}`;
      const found = namesAnyOf(haystack, customerIdentifiers);
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
      // What the email says once the names of the items they ordered are
      // taken out of it. See the note where productNames is built.
      let remainder = mail.body;
      for (const product of productNames) remainder = remainder.split(product).join(" ");

      const found = supplierNames.filter((name) => remainder.includes(name));
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
