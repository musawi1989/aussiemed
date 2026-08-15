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

console.log(
  failures === 0
    ? "\nNo supplier reaches an anonymous visitor\n"
    : `\n${failures} check(s) failed\n`
);
process.exit(failures === 0 ? 0 : 1);
