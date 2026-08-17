"use client";

import { Panel, useRestoredList } from "@/components/AdminForm";

export type Department = {
  id: string;
  name: string;
  children: { id: string; name: string }[];
};

/**
 * Which categories a product sits in.
 *
 * Checkboxes rather than a multi-select: a product can sit in several, and a
 * multi-select hides that from anyone who does not know to ctrl-click. The
 * tree is shown as departments with their children indented, because
 * "Wound Care" means something different under two departments.
 *
 * Its own component rather than markup inside each form, and that is load
 * bearing: `useRestoredList` reads a context that AdminForm provides *around*
 * its children, so a form calling the hook in its own body sits above the
 * provider and always reads nothing. The ticks silently failed to survive a
 * refusal until this moved down here — everything else on the form came back
 * and the categories quietly did not, which is the worst version of that bug,
 * because it looks like it works.
 */
export function CategoryChecklist({
  departments,
  selectedCategoryIds = [],
  note = "A product with no category exists and is searchable, but nobody can ever browse to it. Choose at least one.",
}: {
  departments: Department[];
  selectedCategoryIds?: string[];
  note?: string;
}) {
  // After a refusal the person is correcting their own entry, so what they had
  // ticked wins over whatever is saved on the product.
  const ticked = useRestoredList("categoryIds");
  const selected = new Set(ticked ?? selectedCategoryIds);

  return (
    <Panel title="Categories" note={note}>
      <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
        {departments.map((dept) => (
          <fieldset key={dept.id}>
            <legend className="text-xs font-bold uppercase tracking-wide text-text-subtle">
              {dept.name}
            </legend>
            <label className="mt-1 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="categoryIds"
                value={dept.id}
                defaultChecked={selected.has(dept.id)}
                className="h-4 w-4 accent-[var(--color-navy)]"
              />
              <span className="font-semibold text-text">
                {dept.name} (department itself)
              </span>
            </label>
            <div className="ml-5 mt-1 grid gap-1 sm:grid-cols-2">
              {dept.children.map((child) => (
                <label
                  key={child.id}
                  className="flex items-center gap-2 text-sm text-text-muted"
                >
                  <input
                    type="checkbox"
                    name="categoryIds"
                    value={child.id}
                    defaultChecked={selected.has(child.id)}
                    className="h-4 w-4 accent-[var(--color-navy)]"
                  />
                  {child.name}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </Panel>
  );
}
