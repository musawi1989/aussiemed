"use client";

import { useMemo, useState } from "react";
import { Panel, useRestoredList } from "@/components/AdminForm";
import {
  branchIds,
  filterCategoryTree,
  flattenCategoryTree,
  type CategoryNode,
} from "@/lib/category-tree";

/**
 * Which categories a product sits in.
 *
 * WHAT WAS WRONG. This rendered departments and their direct children and
 * stopped. That was right when the tree was two levels deep and became a silent
 * bug the day the dental taxonomy arrived three levels deep: 263 of 446
 * categories were not in the picker at all — not greyed, not collapsed, absent.
 * A product could not be filed under "Dental › Anaesthetic › Dental Needles",
 * and nothing on screen suggested the shelf existed. The tree is now built to
 * whatever depth the data has, in category-tree.ts, where it is tested.
 *
 * CHECKBOXES, NOT A MULTI-SELECT. A product sits in several, and a multi-select
 * hides that from anybody who does not know to ctrl-click.
 *
 * A SEARCH BOX, because 446 checkboxes is not a list, it is a haystack. It
 * matches on the whole path, so "dental needles" finds the leaf even though no
 * single name contains both words — searching by leaf name alone means already
 * knowing the leaf name.
 *
 * ⚠ EVERY BOX STAYS MOUNTED WHILE SEARCHING. Filtering hides rows with CSS
 * rather than unmounting them, because an unmounted checkbox posts nothing:
 * searching for a second category would silently drop the one already ticked,
 * and the product would come back filed somewhere the person did not choose.
 * That is the kind of bug that looks like it works.
 *
 * Its own component rather than markup inside each form, and that is load
 * bearing: `useRestoredList` reads a context AdminForm provides *around* its
 * children, so a form calling the hook in its own body sits above the provider
 * and always reads nothing. The ticks silently failed to survive a refusal
 * until this moved down here.
 */
export function CategoryChecklist({
  tree,
  selectedCategoryIds = [],
  note = "A product with no category exists and is searchable, but nobody can ever browse to it. Choose at least one.",
}: {
  tree: CategoryNode[];
  selectedCategoryIds?: string[];
  note?: string;
}) {
  // After a refusal the person is correcting their own entry, so what they had
  // ticked wins over whatever is saved on the product.
  const restored = useRestoredList("categoryIds");

  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(restored ?? selectedCategoryIds)
  );
  const [query, setQuery] = useState("");

  const all = useMemo(() => flattenCategoryTree(tree), [tree]);
  const visible = useMemo(() => {
    if (!query.trim()) return null;
    return new Set(flattenCategoryTree(filterCategoryTree(tree, query)).map((n) => n.id));
  }, [tree, query]);

  const toggle = (id: string, on: boolean) =>
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggleBranch = (node: CategoryNode) => {
    const ids = branchIds(node);
    const allOn = ids.every((id) => ticked.has(id));
    setTicked((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const chosen = all.filter((node) => ticked.has(node.id));

  return (
    <Panel title="Categories" note={note}>
      {/* What is filed now, in full paths, before the haystack. Somebody
          opening a product wants to know where it sits without hunting for
          ticks in a 446-row list. */}
      <div className="mb-3">
        {chosen.length === 0 ? (
          <p className="text-xs font-semibold text-accent">
            Not in any category yet — nobody can browse to it.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {chosen.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => toggle(node.id, false)}
                  title={`Remove from ${node.path}`}
                  className="group flex items-center gap-1 rounded-card bg-navy-soft px-2 py-0.5 text-xs font-semibold text-navy transition-colors hover:bg-danger-soft hover:text-danger"
                >
                  {node.path}
                  <span aria-hidden="true" className="opacity-60 group-hover:opacity-100">
                    &times;
                  </span>
                  <span className="sr-only">Remove</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="block">
        <span className="sr-only">Search categories</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${all.length} categories — try "gloves" or "dental needles"`}
          className="w-full rounded-card border border-border-strong bg-surface px-2.5 py-1.5 text-sm text-text focus:border-navy focus:outline-none"
        />
      </label>

      {visible?.size === 0 && (
        <p className="mt-2 text-xs text-text-muted">
          Nothing matches &ldquo;{query}&rdquo;.
        </p>
      )}

      <div className="mt-2 max-h-80 overflow-y-auto pr-1">
        {tree.map((node) => (
          <Branch
            key={node.id}
            node={node}
            ticked={ticked}
            visible={visible}
            onToggle={toggle}
            onToggleBranch={toggleBranch}
          />
        ))}
      </div>
    </Panel>
  );
}

function Branch({
  node,
  ticked,
  visible,
  onToggle,
  onToggleBranch,
}: {
  node: CategoryNode;
  ticked: Set<string>;
  /** Null means no search is running and everything shows. */
  visible: Set<string> | null;
  onToggle: (id: string, on: boolean) => void;
  onToggleBranch: (node: CategoryNode) => void;
}) {
  const shown = visible === null || visible.has(node.id);

  return (
    <>
      {/* hidden, not unmounted — see the note on the component. */}
      <div className={shown ? "" : "hidden"}>
        <div
          className="flex items-center gap-2 py-0.5"
          style={{ paddingLeft: `${node.depth * 1.1}rem` }}
        >
          <input
            id={`cat-${node.id}`}
            type="checkbox"
            name="categoryIds"
            value={node.id}
            checked={ticked.has(node.id)}
            onChange={(event) => onToggle(node.id, event.target.checked)}
            className="h-4 w-4 shrink-0 accent-[var(--color-navy)]"
          />
          <label
            htmlFor={`cat-${node.id}`}
            className={`flex-1 cursor-pointer text-sm ${
              node.depth === 0
                ? "font-bold text-text"
                : node.depth === 1
                  ? "font-semibold text-text"
                  : "text-text-muted"
            }`}
          >
            {node.name}
          </label>

          {node.children.length > 0 && (
            <button
              type="button"
              onClick={() => onToggleBranch(node)}
              className="shrink-0 rounded-card px-1.5 py-0.5 text-[11px] font-bold text-text-subtle transition-colors hover:bg-navy-soft hover:text-navy"
              title={`Tick or clear ${node.name} and everything under it`}
            >
              {node.children.length} under
            </button>
          )}
        </div>
      </div>

      {node.children.map((child) => (
        <Branch
          key={child.id}
          node={child}
          ticked={ticked}
          visible={visible}
          onToggle={onToggle}
          onToggleBranch={onToggleBranch}
        />
      ))}
    </>
  );
}
