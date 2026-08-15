"use client";

import { saveProductAction } from "@/app/admin/products/[id]/actions";
import { AdminForm, Field, Panel, Select, TextArea } from "./AdminForm";

/**
 * The product's own details.
 *
 * Categories are checkboxes rather than a multi-select: a product can sit in
 * several, and a multi-select hides that from anyone who does not know to
 * ctrl-click. The tree is shown as departments with their children indented,
 * because "Wound Care" means something different under two departments.
 */
export function ProductDetailsForm({
  product,
  suppliers,
  brands,
  taxClasses,
  departments,
  selectedCategoryIds,
}: {
  product: {
    id: string;
    name: string;
    description: string | null;
    brandId: string | null;
    supplierId: string;
    taxClass: string;
    variantGroup: string | null;
    variantLabel: string | null;
  };
  suppliers: { id: string; companyName: string; status: string }[];
  brands: { id: string; name: string }[];
  taxClasses: string[];
  departments: {
    id: string;
    name: string;
    children: { id: string; name: string }[];
  }[];
  selectedCategoryIds: string[];
}) {
  const selected = new Set(selectedCategoryIds);

  return (
    <AdminForm action={saveProductAction}>
      <input type="hidden" name="id" value={product.id} />

      <Panel title="Details">
        <div className="space-y-4">
          <Field label="Name" name="name" defaultValue={product.name} required />

          <TextArea
            label="Description"
            name="description"
            defaultValue={product.description}
            hint="Shown on the product page. Trade buyers read this to confirm they have the right item."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Supplier"
              name="supplierId"
              defaultValue={product.supplierId}
              options={suppliers.map((s) => ({
                value: s.id,
                label:
                  s.status === "Active"
                    ? s.companyName
                    : `${s.companyName} (${s.status.toLowerCase()})`,
              }))}
            />
            <Select
              label="Brand"
              name="brandId"
              defaultValue={product.brandId}
              allowEmpty="No brand"
              options={brands.map((b) => ({ value: b.id, label: b.name }))}
            />
          </div>

          <Select
            label="Tax class"
            name="taxClass"
            defaultValue={product.taxClass}
            options={taxClasses.map((t) => ({
              value: t,
              label: t === "ZeroRated" ? "Zero rated" : "Standard (5%)",
            }))}
            hint="Zero rated charges no VAT. Getting this wrong overstates a tax document the customer keeps — see AC-02."
          />
        </div>
      </Panel>

      <div className="mt-5">
        <Panel
          title="Variant family"
          note="Products sharing a family key show each other in a dropdown, so a buyer who lands on the 60ml can reach the 375ml without searching again. Leave both blank if this product has no siblings."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Family key"
              name="variantGroup"
              defaultValue={product.variantGroup}
              placeholder="aqium-antibacterial-hand-sanitiser"
              hint="The same text on every member of the family."
            />
            <Field
              label="This one is the"
              name="variantLabel"
              defaultValue={product.variantLabel}
              placeholder="375ml"
              hint="What distinguishes it. Shown in the dropdown."
            />
          </div>
        </Panel>
      </div>

      <div className="mt-5">
        <Panel
          title="Categories"
          note="A product with no category exists and is searchable, but nobody can ever browse to it."
        >
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
      </div>
    </AdminForm>
  );
}
