/**
 * How the supplier-privacy check decides whether a page really names something.
 *
 * ITS OWN FILE SO IT CAN BE TESTED. These three functions are carve-outs in a
 * privacy check, which makes them the most dangerous kind of code in the
 * repository: every one of them makes the check quieter, and a carve-out that
 * is slightly too wide turns a guard into decoration without anybody noticing.
 * They were written to silence three specific false positives, and the tests
 * beside them exist to prove that the real leaks still fail.
 *
 * Plain .mjs, no imports, so check-supplier-privacy.mjs can use it without a
 * loader and the test can import it directly.
 */

/**
 * Removes file paths that point at an image.
 *
 * The seed names product photographs after a SKU code, and a photograph
 * belongs to the PRODUCT rather than to one of its packs. A supplier looking
 * at a pack they genuinely supply is served /products/seed/GLPF100ZL.png, and
 * a substring search reads that filename as "a pack they do not supply".
 *
 * BY PATH, NOT BY ATTRIBUTE, because the same paths appear a second time
 * inside the serialised props in the RSC payload — as \"image\":\"/products/
 * seed/GLPF100ZL.png\" — where there is no src= to match on.
 */
export function stripAssetPaths(html) {
  return html.replace(/\/[\w./-]+\.(?:png|jpe?g|webp|avif|gif|svg)/gi, " ");
}

/**
 * Whether a SKU code is really present, rather than being the prefix of
 * another one.
 *
 * SKU codes are prefixes of each other: a supplier covers GLPF100ZL-10 while
 * the catalogue also holds GLPF100ZL, which they do not. A plain substring
 * search finds the shorter inside the longer and reports a leak on the row
 * showing the pack they do supply.
 *
 * Hyphens and alphanumerics continue a code, so a match followed or preceded
 * by one is a fragment rather than a mention.
 */
export function mentionsCode(text, code) {
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9-])${escaped}(?![A-Za-z0-9-])`).test(text);
}

/**
 * Cuts product names out of a page so a BRAND sharing a supplier's name is not
 * read as a disclosure of who supplies it.
 *
 * "Livingstone" is one of our suppliers and also a brand on 16 products. A
 * supplier's own screen listing a Livingstone-branded glove they have taken on
 * is not telling them anything — that name is on the storefront, on the box,
 * and in the search results they found it through.
 *
 * ⚠ NARROW ON PURPOSE. Only occurrences inside a product name from our own
 * catalogue are cut; whatever is left is still searched, so a row actually
 * attributing a pack to "Livingstone" still fails. Longest first, so a longer
 * title is removed before a shorter one that is a prefix of it and cannot
 * leave a fragment behind.
 */
export function stripBrandNames(text, productNames) {
  return [...productNames]
    .sort((a, b) => b.length - a.length)
    .reduce((acc, name) => acc.split(name).join(" "), text);
}

/**
 * Which of a set of identifying strings a page actually NAMES.
 *
 * A plain `html.includes(name)` was doing this, and it failed the moment a
 * customer signed up as "mo": the supplier portal's HTML contains "mo" 76
 * times — in "node_modules", in "roboto", in a hashed chunk filename — and
 * none of them is a customer. The check reported a DEC-24 breach on every run
 * and there was no breach, which is the worst state a guardrail can be in:
 * one that cries wolf gets ignored, and then it is not guarding anything.
 *
 * MATCHED ON WORD BOUNDARIES, so "mo" no longer hides inside "modules" while
 * "mo Hamdani" still fails. An email address matches whole, since the @ and
 * the dots make it unambiguous on its own.
 *
 * ⚠ THIS DOES NOT SOFTEN THE RULE. A supplier must never learn a customer
 * exists (DEC-24); this only stops the check pointing at letters that are not
 * a name. Anything genuinely printed on the page — a contact, a company, an
 * order reference — still comes back.
 */
export function namesAnyOf(haystack, identifiers) {
  return identifiers.filter((value) => {
    const needle = String(value ?? "").trim();
    if (!needle) return false;

    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    /*
     * Letters, digits and the characters that hold a word together. A name
     * bounded by markup, punctuation or whitespace is a mention; one bounded
     * by more word characters is a fragment of something longer.
     */
    return new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`, "i").test(
      haystack
    );
  });
}
