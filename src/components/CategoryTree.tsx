"use client";

import { useState } from "react";
import {
  createCategoryAction,
  renameCategoryAction,
} from "@/app/admin/categories/actions";
import { AdminForm, Field, Panel, Select } from "./AdminForm";

type Node = {
  id: string;
  name: string;
  slug: string;
  productCount: number;
  children: Node[];
};

/**
 * The category tree, with the count that decides whether a category is visible
 * on the storefront at all.
 *
 * Renaming is inline because it is the common case and a whole screen for one
 * text field would be silly. Renaming does not change the slug — the slug is
 * the URL, and a category that has been linked to keeps working.
 */
export function CategoryTree({ tree }: { tree: Node[] }) {
  const [editing, setEditing] = useState<string | null>(null);

  const departments = tree.map((d) => ({ value: d.id, label: d.name }));

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-3">
        {tree.map((dept) => {
          const total =
            dept.productCount +
            dept.children.reduce((n, c) => n + c.productCount, 0);
          return (
            <section
              key={dept.id}
              className="rounded-card border border-border-base bg-surface p-4 shadow-card"
            >
              <Row
                node={dept}
                total={total}
                editing={editing === dept.id}
                onEdit={() => setEditing(editing === dept.id ? null : dept.id)}
                isDepartment
              />

              {dept.children.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-border-base pt-2">
                  {dept.children.map((child) => (
                    <li key={child.id}>
                      <Row
                        node={child}
                        total={child.productCount}
                        editing={editing === child.id}
                        onEdit={() =>
                          setEditing(editing === child.id ? null : child.id)
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <AdminForm action={createCategoryAction} submitLabel="Create category">
        <Panel
          title="New category"
          note="Leave the department blank to create a new department. The tree is two levels deep."
        >
          <div className="space-y-4">
            <Field label="Name" name="name" required />
            <Select
              label="Inside department"
              name="parentId"
              allowEmpty="None — this is a new department"
              options={departments}
            />
          </div>
        </Panel>
      </AdminForm>
    </div>
  );
}

function Row({
  node,
  total,
  editing,
  onEdit,
  isDepartment = false,
}: {
  node: Node;
  total: number;
  editing: boolean;
  onEdit: () => void;
  isDepartment?: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={
            isDepartment
              ? "font-bold text-text"
              : "text-sm text-text-muted"
          }
        >
          {node.name}
        </span>
        <span className="text-xs text-text-subtle tnum">/{node.slug}</span>

        {total === 0 ? (
          <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-semibold text-text-subtle">
            empty — hidden from the menu
          </span>
        ) : (
          <span className="text-xs font-semibold tnum text-text-muted">
            {total} {total === 1 ? "product" : "products"}
          </span>
        )}

        <button
          type="button"
          onClick={onEdit}
          className="ml-auto text-xs font-bold text-navy hover:underline"
        >
          {editing ? "Cancel" : "Rename"}
        </button>
      </div>

      {editing && (
        <AdminForm
          action={renameCategoryAction}
          submitLabel="Rename"
          className="mt-2 max-w-md"
        >
          <input type="hidden" name="id" value={node.id} />
          <Field
            label="New name"
            name="name"
            defaultValue={node.name}
            required
            hint="The URL stays /{slug}, so existing links keep working."
          />
        </AdminForm>
      )}
    </div>
  );
}
