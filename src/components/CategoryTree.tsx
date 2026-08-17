"use client";

import { useActionState, useState } from "react";
import {
  createCategoryAction,
  deleteCategoryAction,
  deleteEmptyCategoriesAction,
  renameCategoryAction,
} from "@/app/admin/categories/actions";
import { AdminForm, Field, Panel, Select, type FormState } from "./AdminForm";

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
 *
 * Removing is deliberately quieter than renaming: it sits behind the rename
 * control, states what it is about to destroy before it does it, and refuses
 * outright when the damage would be invisible. The service layer holds those
 * rules, not this file — a hidden button guards nothing.
 */
export function CategoryTree({ tree }: { tree: Node[] }) {
  const [editing, setEditing] = useState<string | null>(null);

  const departments = tree.map((d) => ({ value: d.id, label: d.name }));

  const totalOf = (dept: Node) =>
    dept.productCount + dept.children.reduce((n, c) => n + c.productCount, 0);

  /**
   * Exactly what the button will remove, so it can say so before it does it.
   * "Remove empty categories" is a different proposition from "remove 125".
   *
   * This mirrors the server's rule rather than counting anything that merely
   * looks empty: a subcategory goes if it holds no products, and a department
   * goes only if it holds none itself AND every one of its subcategories is
   * going too — which is the same outcome as the server's repeated removal of
   * empty leaves, on a tree that is two deep by construction. A department
   * with one stocked subcategory is not empty, however bare its own row looks.
   */
  const emptyCount = tree.reduce((n, dept) => {
    const goingChildren = dept.children.filter((c) => c.productCount === 0);
    const deptGoes =
      dept.productCount === 0 && goingChildren.length === dept.children.length;
    return n + goingChildren.length + (deptGoes ? 1 : 0);
  }, 0);

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-3">
        {tree.map((dept) => (
          <section
            key={dept.id}
            className="rounded-card border border-border-base bg-surface p-4 shadow-card"
          >
            <Row
              node={dept}
              total={totalOf(dept)}
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
        ))}
      </div>

      <div className="space-y-5">
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

        {emptyCount > 0 && <ClearEmpty count={emptyCount} />}
      </div>
    </div>
  );
}

/**
 * The bulk clear.
 *
 * Only appears when there is something to clear, and always names the number,
 * because "remove empty categories" and "remove 125 categories" are different
 * propositions and only one of them is what the reader is agreeing to.
 */
function ClearEmpty({ count }: { count: number }) {
  const [state, submit, pending] = useActionState<FormState, FormData>(
    deleteEmptyCategoriesAction,
    null
  );

  const word = count === 1 ? "category" : "categories";

  return (
    <form
      action={submit}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Remove ${count} empty ${word}?\n\n` +
              `They hold no products and no subcategories, so no product ` +
              `changes and nothing is taken off sale. Anyone who bookmarked ` +
              `one of their pages will get a not-found.\n\nThis cannot be undone.`
          )
        ) {
          event.preventDefault();
        }
      }}
      className="rounded-card border border-border-base bg-surface p-5 shadow-card"
    >
      <h2 className="text-base font-bold tracking-tight text-text">
        Tidy up empty categories
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">
        {count} {word} hold no products. They are already kept out of the browse
        menu, but they still fill the search dropdown and this screen. Removing
        them changes no product and takes nothing off sale.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-card border border-danger px-3 py-1.5 text-sm font-bold text-danger transition-colors hover:bg-danger-soft disabled:opacity-60"
      >
        {pending ? "Removing…" : `Remove ${count} empty ${word}`}
      </button>

      {state?.ok === false && state.error && (
        <p role="alert" className="mt-2 text-xs font-semibold text-danger">
          {state.error}
        </p>
      )}
      {state?.ok === true && (
        <p role="status" className="mt-2 text-xs font-semibold text-success">
          {state.message}
        </p>
      )}
    </form>
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
          className={isDepartment ? "font-bold text-text" : "text-sm text-text-muted"}
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

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onEdit}
            className="text-xs font-bold text-navy hover:underline"
          >
            {editing ? "Cancel" : "Rename"}
          </button>
          <RemoveButton node={node} total={total} isDepartment={isDepartment} />
        </div>
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

/**
 * One row's remove.
 *
 * The confirmation says what is actually at stake for this particular
 * category, rather than asking "are you sure" — a prompt that says the same
 * thing every time teaches people to click through it. An empty category and
 * one holding seventeen products deserve different sentences, and a department
 * with subcategories is refused by the server before it gets this far.
 */
function RemoveButton({
  node,
  total,
  isDepartment,
}: {
  node: Node;
  total: number;
  isDepartment: boolean;
}) {
  const [state, submit, pending] = useActionState<FormState, FormData>(
    deleteCategoryAction,
    null
  );
  const [blocked, setBlocked] = useState<string | null>(null);

  const subcategories = node.children.length;

  const stakes =
    total === 0
      ? "It holds no products, so nothing changes on the storefront."
      : `${total} ${total === 1 ? "product stays" : "products stay"} on sale but ` +
        `${total === 1 ? "leaves" : "leave"} this ${isDepartment ? "department" : "category"}.`;

  return (
    <form
      action={submit}
      onSubmit={(event) => {
        // Answering a confirmation and then being told no is two steps to
        // learn one thing. What is already known here is said straight away;
        // the server still refuses independently, because that is the guard
        // and this is only a courtesy.
        if (subcategories > 0) {
          event.preventDefault();
          setBlocked(
            `Remove or move its ${subcategories} ` +
              `${subcategories === 1 ? "subcategory" : "subcategories"} first.`
          );
          return;
        }

        if (
          !window.confirm(
            `Remove ${node.name}?\n\n${stakes}\n\n` +
              `Anyone who bookmarked /${node.slug} will get a not-found. ` +
              `This cannot be undone.`
          )
        ) {
          event.preventDefault();
        }
      }}
      className="inline-flex items-center gap-2"
    >
      <input type="hidden" name="id" value={node.id} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-bold text-danger hover:underline disabled:opacity-60"
      >
        {pending ? "Removing…" : "Remove"}
      </button>

      {/* The refusals are the useful part of this control, and they are
          sentences rather than codes, so they sit next to the button that
          caused them rather than at the top of the page. */}
      {(blocked || (state?.ok === false && state.error)) && (
        <span
          role="alert"
          className="max-w-md text-xs font-semibold leading-snug text-danger"
        >
          {blocked ?? (state?.ok === false ? state.error : "")}
        </span>
      )}
      {!blocked && state?.ok === true && (
        <span role="status" className="text-xs font-semibold text-success">
          {state.message}
        </span>
      )}
    </form>
  );
}
