/**
 * The category tree, shaped for a picker.
 *
 * PURE, so the shape can be tested without a database — and it needs testing,
 * because the version this replaces was quietly wrong. It built departments and
 * their direct children and stopped there, which was correct when the tree was
 * two levels deep and became a silent bug the day the dental taxonomy landed
 * three levels deep. 263 of 446 categories simply were not in the picker: not
 * greyed, not collapsed, absent. A product could not be filed under
 * "Dental › Anaesthetic › Dental Needles" at all, and nothing on the screen
 * suggested the shelf existed.
 *
 * ARBITRARY DEPTH, not three levels. Hard-coding three would repeat the same
 * mistake one level further out, and the next person to add a tier would find
 * the same silence.
 */

export type CategoryRow = {
  id: string;
  name: string;
  parentId: string | null;
};

export type CategoryNode = {
  id: string;
  name: string;
  /** 0 for a department, 1 for its children, and so on — drives the indent. */
  depth: number;
  /** Ancestors then self, e.g. "Dental › Anaesthetic › Dental Needles". */
  path: string;
  children: CategoryNode[];
};

/**
 * Nests the rows, keeping the order they arrived in at every level.
 *
 * A row whose parent is missing is treated as a root rather than dropped. A
 * category that vanishes from a picker because its parent was deleted is the
 * same failure this function exists to fix, and losing it silently would be
 * worse than showing it in the wrong place.
 */
export function buildCategoryTree(rows: readonly CategoryRow[]): CategoryNode[] {
  const known = new Set(rows.map((row) => row.id));
  const byParent = new Map<string | null, CategoryRow[]>();

  for (const row of rows) {
    const parent = row.parentId && known.has(row.parentId) ? row.parentId : null;
    const siblings = byParent.get(parent);
    if (siblings) siblings.push(row);
    else byParent.set(parent, [row]);
  }

  /*
   * Guarded against a cycle. A category that is its own ancestor should be
   * impossible, but this walks parent links from data somebody can edit, and
   * an infinite recursion here takes out every admin screen that lists
   * categories rather than just showing one of them in the wrong place.
   */
  const build = (parentId: string | null, depth: number, trail: string[], seen: Set<string>): CategoryNode[] =>
    (byParent.get(parentId) ?? [])
      .filter((row) => !seen.has(row.id))
      .map((row) => {
        const path = [...trail, row.name];
        return {
          id: row.id,
          name: row.name,
          depth,
          path: path.join(" › "),
          children: build(row.id, depth + 1, path, new Set([...seen, row.id])),
        };
      });

  return build(null, 0, [], new Set());
}

/** Every node, depth-first, so a flat list reads in tree order. */
export function flattenCategoryTree(nodes: readonly CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((node) => [node, ...flattenCategoryTree(node.children)]);
}

/**
 * The ids of a node and everything beneath it.
 *
 * For "tick a branch and get the lot", which on a tree this size is the
 * difference between filing a product in a minute and in five.
 */
export function branchIds(node: CategoryNode): string[] {
  return [node.id, ...node.children.flatMap(branchIds)];
}

/**
 * Nodes whose own name, or an ancestor's, matches every word of the query.
 *
 * MATCHES ON THE WHOLE PATH, so typing "dental needles" finds
 * "Dental › Anaesthetic › Dental Needles" even though no single name contains
 * both words. Searching a 446-item tree by leaf name alone means knowing the
 * leaf name, which is exactly what somebody searching does not have.
 *
 * A match keeps its ancestors, so the result still reads as a tree rather than
 * a list of orphaned leaves with no idea which department they belong to.
 */
export function filterCategoryTree(
  nodes: readonly CategoryNode[],
  query: string
): CategoryNode[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...nodes];

  const keep = (node: CategoryNode): CategoryNode | null => {
    const haystack = node.path.toLowerCase();
    const hit = words.every((word) => haystack.includes(word));

    // A hit keeps its whole subtree: somebody who searched "anaesthetic" wants
    // what is under it, not just the branch name.
    if (hit) return node;

    const children = node.children
      .map(keep)
      .filter((child): child is CategoryNode => child !== null);

    return children.length > 0 ? { ...node, children } : null;
  };

  return nodes.map(keep).filter((node): node is CategoryNode => node !== null);
}
