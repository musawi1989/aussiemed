/**
 * Turning a filter change into a URL.
 *
 * Lives here because both sides need it: the panel is a server component and
 * the price boxes are a client one, and a server component may not hand a
 * function to a client component — the RSC boundary carries data, not
 * behaviour. Passing the params and letting each side build its own links is
 * how one rule serves both without one of them growing a second copy.
 *
 * The filter state IS the URL, deliberately. A filtered view can then be
 * bookmarked, shared with the person who approves the order, and reloaded
 * without losing what was chosen.
 */

export type FilterParams = Record<string, string | undefined>;

export function hrefWith(params: FilterParams, patch: FilterParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...patch })) {
    // Undefined and empty both mean "not filtering by this", so neither is
    // written — an empty parameter in a shared link reads as a filter that is
    // on and doing nothing.
    if (value) search.set(key, value);
  }

  // Any change to the filters starts the list again. "Show more" state is a
  // window into one result set, and carrying it into a different one shows a
  // buyer 96 products of something they did not ask for.
  search.delete("show");

  const qs = search.toString();
  return qs ? `/products?${qs}` : "/products";
}
