"use client";

import { saveProductAction } from "@/app/admin/products/[id]/actions";
import { AdminForm, Field, Panel, Select, TextArea } from "./AdminForm";
import { CategoryChecklist } from "./admin/CategoryChecklist";
import type { CategoryNode } from "@/lib/category-tree";

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
  brands,
  taxClasses,
  tree,
  selectedCategoryIds,
}: {
  product: {
    id: string;
    name: string;
    description: string | null;
    brandId: string | null;
    taxClass: string;
    variantGroup: string | null;
    variantLabel: string | null;
  };
  brands: { id: string; name: string }[];
  taxClasses: string[];
  tree: CategoryNode[];
  selectedCategoryIds: string[];
}) {
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

          {/* No supplier here. Supply is per pack and has two ranks with their
              own costs and part numbers, so it belongs beside the SKU rather
              than on the product — DEC-25, and it is loaded from the catalogue
              template under BE-04. */}
          <Select
            label="Brand"
            name="brandId"
            defaultValue={product.brandId}
            allowEmpty="No brand"
            options={brands.map((b) => ({ value: b.id, label: b.name }))}
          />

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
          label="Related-product family key"
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
        <CategoryChecklist
          tree={tree}
          selectedCategoryIds={selectedCategoryIds}
        />
      </div>
    </AdminForm>
  );
}
