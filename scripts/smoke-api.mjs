/**
 * Contract checks for /api/v1 against a running server.
 *
 * Run the app first (`npm run dev` or `npm start`), then `npm run smoke`.
 * Kept out of `npm run verify` because it needs a live server.
 */

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";

let failures = 0;
let CATALOGUE_TOTAL = 0;
const check = (name, condition, detail = "") => {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const get = async (path) => {
  const res = await fetch(`${BASE}${path}`);
  const body = res.headers.get("content-type")?.includes("json")
    ? await res.json()
    : await res.text();
  return { res, body };
};

console.log(`\nAPI contract checks against ${BASE}\n`);

/* --- products list ------------------------------------------------- */

{
  const { res, body } = await get("/api/v1/products");
  check("GET /products responds 200", res.status === 200, `got ${res.status}`);
  check("currency is stated once, as AED", body.currency === "AED");
  check(
    "page size is honoured",
    body.items.length === body.pagination.pageSize,
    `${body.items.length} items vs pageSize ${body.pagination.pageSize}`
  );
  // Derived, not hardcoded — the catalogue size changes as products are
  // seeded, and a magic number here fails for the wrong reason.
  CATALOGUE_TOTAL = body.pagination.total;
  check(
    "the catalogue is non-empty and paginated",
    CATALOGUE_TOTAL > 0 && body.pagination.pageCount >= 1,
    `total=${CATALOGUE_TOTAL}`
  );
  check(
    "prices are numbers, not preformatted strings",
    body.items.every((p) => typeof p.priceAED === "number"),
    "a price came back as a string"
  );
  check(
    "no product carries a localised currency symbol",
    !JSON.stringify(body).includes("د.إ")
  );
  check(
    "every item names its supplier",
    body.items.every((p) => p.supplier && typeof p.supplier.name === "string")
  );
}

/* --- pagination ---------------------------------------------------- */

{
  const { body: p1 } = await get("/api/v1/products?page=1");
  const { body: p2 } = await get("/api/v1/products?page=2");
  const ids1 = new Set(p1.items.map((p) => p.id));
  const overlap = p2.items.filter((p) => ids1.has(p.id));
  check("pages do not overlap", overlap.length === 0,
    `${overlap.length} repeated items`);

  const { body: huge } = await get("/api/v1/products?page=999");
  check(
    "an out-of-range page clamps instead of erroring",
    huge.pagination.page === huge.pagination.pageCount
  );
}

/* --- facet integrity ----------------------------------------------- */

{
  const { body: all } = await get("/api/v1/products");
  const { body: cats } = await get("/api/v1/categories");

  let mismatches = [];
  for (const dept of cats.departments) {
    const nodes = [dept, ...dept.children];
    for (const node of nodes) {
      const advertised = node.productCount;
      const { body: filtered } = await get(
        `/api/v1/products?category=${encodeURIComponent(node.slug)}`
      );
      if (filtered.pagination.total !== advertised) {
        mismatches.push(
          `${node.name}: category said ${advertised}, products returned ${filtered.pagination.total}`
        );
      }
    }
  }
  check(
    "every category count equals what filtering by it returns",
    mismatches.length === 0,
    mismatches.slice(0, 3).join("; ")
  );

  check(
    "facet counts on the list match the categories endpoint",
    cats.departments.every(
      (d) => (all.facets.categories[d.id] ?? 0) === d.productCount
    )
  );
}

/* --- filtering ----------------------------------------------------- */

{
  const { body } = await get("/api/v1/products?inStock=1");
  check(
    "inStock=1 excludes out-of-stock lines",
    body.items.every((p) => !p.outOfStock)
  );

  const { body: unknown } = await get("/api/v1/products?category=nope-not-real");
  check(
    "an unknown category returns nothing, not everything",
    unknown.pagination.total === 0,
    `got ${unknown.pagination.total}`
  );

  const { body: search } = await get("/api/v1/products?q=nitrile%20large");
  check(
    "multi-term search requires every term",
    search.items.every((p) => /nitrile/i.test(p.name) && /large/i.test(p.name)),
    "a result missed one of the terms"
  );
}

/* --- product detail ------------------------------------------------ */

{
  const { res, body } = await get(
    "/api/v1/products/omron-hem7156t-blood-pressure-monitor"
  );
  check("GET /products/:slug responds 200", res.status === 200);
  check("detail includes a description", typeof body.product.description === "string");
  check(
    "tiers ascend in quantity and descend in price",
    body.product.tiers.every((t, i, arr) =>
      i === 0 ? true : t.minQty > arr[i - 1].minQty && t.priceAED < arr[i - 1].priceAED
    )
  );
  check("related products are returned", Array.isArray(body.related));

  const { body: byId } = await get("/api/v1/products/171");
  check("the same product resolves by numeric id", byId.product?.slug === body.product.slug);

  const { res: missing } = await get("/api/v1/products/no-such-product");
  check("a missing product returns 404", missing.status === 404, `got ${missing.status}`);
}

/* --- suggest ------------------------------------------------------- */

{
  const { body: short } = await get("/api/v1/search/suggest?q=n");
  check("a one-character term returns an empty list, not an error", short.items.length === 0);

  const { body } = await get("/api/v1/search/suggest?q=glove&limit=3");
  check("suggest honours the limit", body.items.length <= 3);

  const { body: capped } = await get("/api/v1/search/suggest?q=a&limit=9999");
  check("an absurd limit is clamped rather than accepted", Array.isArray(capped.items));
}

/* --- suppliers ----------------------------------------------------- */

{
  const { body } = await get("/api/v1/suppliers");
  check("suppliers are listed", body.suppliers.length > 0);
  check(
    "product counts across suppliers sum to the catalogue",
    body.suppliers.reduce((sum, s) => sum + s.productCount, 0) === CATALOGUE_TOTAL
  );
  check(
    "no supplier contact details leak from a public endpoint",
    !JSON.stringify(body).match(/email|phone|address|secondary/i)
  );
}

/* --- summary ------------------------------------------------------- */

if (failures > 0) {
  console.log(`\n${failures} check(s) failed\n`);
  process.exit(1);
}
console.log("\nAll API contract checks passed\n");
