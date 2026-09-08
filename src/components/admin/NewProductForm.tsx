"use client";

import { useState } from "react";
import { createProductAction } from "@/app/admin/products/new/actions";
import { AdminForm, Field, Panel, Select, TextArea } from "@/components/AdminForm";
import { CategoryChecklist } from "./CategoryChecklist";
import type { CategoryNode } from "@/lib/category-tree";
import { BrandPicker } from "./BrandPicker";
import { SupplierPicker } from "./SupplierPicker";

/**
 * Adding one product by hand.
 *
 * The bulk upload exists for a price list arriving as a spreadsheet. This is
 * for the other case, which is just as common and had no answer at all: one
 * new line, typed in, usually while somebody is on the phone about it.
 *
 * The first pack is on this form rather than a step afterwards. A product with
 * no pack has no code, no unit and no price — there is nothing to put in a
 * cart, so it is not a product yet, it is a name. Splitting it in two would
 * let somebody stop halfway and leave a row that looks finished on every
 * screen and cannot be bought.
 */
export function NewProductForm({
  brands,
  taxClasses,
  tree,
  suppliers,
  supplierId,
}: {
  brands: { id: string; name: string }[];
  taxClasses: string[];
  tree: CategoryNode[];
  suppliers: { id: string; companyName: string }[];
  supplierId: string;
}) {
  const [selectedSupplier, setSelectedSupplier] = useState(supplierId);
  return (
    <AdminForm action={createProductAction} submitLabel="Create product">
      <Panel
        title="What it is"
        note="It is created as a draft, so nothing appears in the shop until you approve it."
      >
        <div className="space-y-4">
          <Field
            label="Name"
            name="name"
            required
            placeholder="Nitrile Examination Gloves, Powder Free, Blue, Large"
            hint="Write it as a trade buyer would search for it. Brand, what it is, then the details that separate it from its siblings."
          />

          <TextArea
            label="Description"
            name="description"
            hint="Shown on the product page. Trade buyers read this to confirm they have the right item."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <BrandPicker brands={brands} />

            <Select
              label="Tax class"
              name="taxClass"
              options={taxClasses.map((t) => ({
                value: t,
                label: t === "ZeroRated" ? "Zero rated" : "Standard (5%)",
              }))}
              hint="Zero rated charges no VAT. Getting this wrong overstates a tax document the customer keeps — see AC-02."
            />
          </div>
          <SupplierPicker label="Primary supplier" defaultValue={supplierId} suppliers={suppliers} onChange={setSelectedSupplier} />
          {selectedSupplier && <Field label="Supplier buying price (AED per pack, excluding VAT)" name="buyingPriceAED" type="number" min="0.01" step="0.01" required />}
        </div>
      </Panel>

      {/* ------------------------------------------------------------ *
       * The first pack
       * ------------------------------------------------------------ */}
      <div className="mt-5">
        <Panel
          title="The first pack"
          note="What a buyer actually puts in a cart. You can add more pack sizes — a box and a carton of the same thing — once it exists."
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Item code"
                name="skuCode"
                required
                placeholder="GLV-NIT-BL-L"
                hint="Unique across the whole catalogue. This is what appears on purchase orders and invoices."
              />
              <Field
                label="Price to the customer"
                name="priceAED"
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="24.50"
                hint="In AED, excluding VAT."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Full pack label"
                name="unitLabel"
                required
                placeholder="100 Pieces/Box"
                hint="What the buyer sees on the unit selector."
              />
              <Field
                label="Short pack name"
                name="unitShortLabel"
                placeholder="Box"
                hint="Shown beside Add to cart. Left blank, the unit label is used."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Name of one unit"
                name="baseUnitName"
                defaultValue="Each"
                placeholder="Each"
                hint="What one of them is called — Each, Bottle, Pair."
              />
              <Field
                label="Units in this pack"
                name="eachesPerPack"
                type="number"
                step="1"
                min="1"
                defaultValue="1"
                required
                hint="100 for a box of 100. This is what lets a box and a carton be compared per unit."
              />
            </div>
          </div>
        </Panel>
      </div>

      {/* ------------------------------------------------------------ *
       * Where it lives
       * ------------------------------------------------------------ */}
      <div className="mt-5">
        <CategoryChecklist tree={tree} />
      </div>

      <div className="mt-5">
        <Panel
          title="Variant family"
          note="Only if this has siblings — the same line in three glove sizes, or two bottle sizes. Products sharing a family key show each other in a dropdown. Leave both blank otherwise."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Related-product family key"
              name="variantGroup"
              placeholder="nitrile-examination-gloves"
              hint="The same text on every member of the family."
            />
            <Field
              label="This one is the"
              name="variantLabel"
              placeholder="Large"
              hint="What distinguishes it. Shown in the dropdown."
            />
          </div>
        </Panel>
      </div>
    </AdminForm>
  );
}
