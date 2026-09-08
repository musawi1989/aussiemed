/**
 * Types for privacy-match.mjs.
 *
 * The module itself stays plain JavaScript because check-supplier-privacy.mjs
 * runs under bare node, with no type stripping, and cannot import a .ts file.
 * Its test is TypeScript, so the shapes are declared here rather than the
 * import being left as an implicit any — an untyped import into a test whose
 * whole job is proving a privacy guard is narrow would be a poor trade.
 */

/** Removes file paths pointing at an image, wherever they appear. */
export function stripAssetPaths(html: string): string;

/** Whether a SKU code stands on its own rather than being another's prefix. */
export function mentionsCode(text: string, code: string): boolean;

/** Cuts our own product names out, so a brand is not read as an attribution. */
export function stripBrandNames(
  text: string,
  productNames: readonly string[]
): string;

/**
 * Which identifying strings a page genuinely names, matched on word
 * boundaries so a two-letter name does not match inside "node_modules".
 */
export function namesAnyOf(
  haystack: string,
  identifiers: readonly string[]
): string[];
