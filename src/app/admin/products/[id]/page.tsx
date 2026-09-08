import { EntityLogo } from "@/components/EntityLogo";
import { rankLabel } from "@/lib/ranks";
import { formatAED } from "@/lib/money";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PRODUCT_STATUSES, TAX_CLASSES } from "@/lib/admin";
import { StatusPill } from "@/components/StatusPill";
import { buildCategoryTree } from "@/lib/category-tree";
import { ProductStatusActions } from "@/components/ProductStatusActions";
import { SkuEditor } from "@/components/SkuEditor";
import { AddPack, RemovePack } from "@/components/admin/PackControls";
import { ProductOptions, SkuVariant } from "@/components/admin/ProductOptions";
import { productOptions, skuOptionValues } from "@/lib/product-options";
import { canRemovePack } from "@/lib/sku-packs";
import { ProductDetailsForm } from "@/components/ProductDetailsForm";
import { ProductDocuments } from "@/components/admin/ProductDocuments";
import { ProductImages } from "@/components/admin/ProductImages";
import { ProductMargins } from "@/components/admin/ProductMargins";
import { ProductSupplyCover } from "@/components/admin/ProductSupplyCover";
import { productMargins } from "@/lib/margin-data";
import { productCover } from "@/lib/supply-cover";
import { mayReach } from "@/lib/admin-team";
import {
  ACCEPTED_DOCUMENTS,
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
} from "@/lib/storage";

/**
 * One product, everything about it.
 *
 * Laid out as separate forms rather than one enormous save: the details, each
 * SKU and each SKU's price breaks are independent decisions, and an admin
 * correcting a price should not have to re-submit a description to do it.
 */
export default async function AdminProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ newVariant?: string }>;
}) {
  const { id } = await params;
  const { newVariant } = await searchParams;
  const canSeeSuppliers = await mayReach("/admin/suppliers");

  const [product, suppliers, brands, categories] = await Promise.all([
    db.productMaster.findUnique({
      where: { id },
      include: {
        categories: { select: { categoryId: true } },
        skus: {
          orderBy: [{ isActive: "desc" }, { eachesPerPack: "asc" }],
          include: { tiers: { orderBy: { minQty: "asc" } } },
        },
        images: { orderBy: { sortOrder: "asc" } },
        documents: { orderBy: { sortOrder: "asc" } },
      },
    }),
    canSeeSuppliers ? db.supplier.findMany({
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true, status: true },
    }) : Promise.resolve([]),
    db.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.category.findMany({
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, parentId: true },
    }),
  ]);

  if (!product) notFound();

  // Admin-guarded and fetched separately on purpose: cost never rides along
  // inside a query that anything else might come to reuse.
  /*
   * What each pack would cost to delete, asked once per pack.
   *
   * A handful of counts against a handful of packs. Doing it here rather
   * than inside the control keeps the answer on the server, where the
   * button can be labelled honestly before anybody presses it.
   */
  // What this product varies by, and which value each pack holds. Both are
  // read once for the page rather than per pack: thirty SKUs on a glove
  // product is thirty round trips otherwise, for two small tables.
  const [options, chosenValues] = await Promise.all([
    productOptions(product.id),
    skuOptionValues(product.id),
  ]);

  const removals = new Map(
    await Promise.all(
      product.skus.map(
        async (sku) => [sku.id, await canRemovePack(sku.id)] as const
      )
    )
  );

  const margins = await mayReach("/admin/reports") ? await productMargins(product.id) : [];

  // Who may cover this product, and who does. Its own query for the same
  // reason: the candidate list is derived from what suppliers have offered,
  // not from the supplier list the rest of the page uses.
  const cover = canSeeSuppliers ? await productCover(product.id) : null;
  const supplyPrices = canSeeSuppliers ? await db.productSupply.findMany({ where: { sku: { productMasterId: product.id } }, select: { skuId: true, supplierId: true, costFils: true, rank: true, supplier: { select: { companyName: true } } } }) : [];
  const mainImage = product.images.find(image => !image.skuId) ?? product.images[0];

  /*
   * The whole tree, to whatever depth it has.
   *
   * This used to build departments and their direct children only, which was
   * right at two levels and silently wrong at three: 263 of 446 categories
   * were absent from the picker, so a product could not be filed under
   * "Dental › Anaesthetic › Dental Needles" at all.
   */
  const tree = buildCategoryTree(categories);

  const selected = new Set(product.categories.map((c) => c.categoryId));

  return (
    <>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-4">
          <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-card border border-border-base bg-surface">
            {mainImage ? <Image src={mainImage.path} alt={mainImage.altText || product.name} fill sizes="128px" className="object-contain p-2" /> : <span className="flex h-full items-center justify-center text-xs text-text-muted">No product image</span>}
          </div>
          <div className="min-w-0">
          <Link
            href="/admin/products"
            className="inline-flex min-h-11 items-center gap-2 rounded-card border-2 border-navy bg-navy px-4 py-2 font-bold text-white text-sm"
          >
            &larr; All products
          </Link>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-text">
            {product.name}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-muted">
            <StatusPill axis="record" status={product.status} />
            <span className="tnum">/{product.slug}</span>
            {product.status === "Active" && (
              <Link
                href={`/products/${product.slug}`}
                className="font-semibold text-navy hover:underline"
              >
                View on the storefront
              </Link>
            )}
          </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          <ProductDetailsForm
            product={{
              id: product.id,
              name: product.name,
              description: product.description,
              brandId: product.brandId,
              taxClass: product.taxClass,
              variantGroup: product.variantGroup,
              variantLabel: product.variantLabel,
            }}
            brands={brands}
            taxClasses={[...TAX_CLASSES]}
            tree={tree}
            selectedCategoryIds={[...selected]}
          />

          {product.skus.map((sku) => (
            <SkuEditor
              key={sku.id}
              productId={product.id}
              sku={{
                id: sku.id,
                skuCode: sku.skuCode,
                baseUnitName: sku.baseUnitName,
                unitLabel: sku.unitLabel,
                unitShortLabel: sku.unitShortLabel,
                eachesPerPack: sku.eachesPerPack,
                priceAED: sku.priceFils / 100,
                manualOutOfStock: sku.manualOutOfStock,
                isActive: sku.isActive,
              }}
              tiers={sku.tiers.map((t) => ({
                minQty: t.minQty,
                priceAED: t.priceFils / 100,
                unitName: t.unitName,
                unitsPerLevel: t.unitsPerLevel,
              }))}
              footer={
                <>
                  {canSeeSuppliers && <div className="mb-4 rounded-card border border-border-base p-3"><h3 className="mb-2 font-bold">Supplier buying prices for {sku.skuCode}</h3><ul className="space-y-2">{supplyPrices.filter(s => s.skuId === sku.id).map(supply => <li key={supply.supplierId} className="flex items-center justify-between gap-3"><Link href={`/admin/suppliers/${supply.supplierId}`} className="font-semibold text-navy"><EntityLogo kind="supplier" id={supply.supplierId} name={supply.supplier.companyName} />{supply.supplier.companyName} · {rankLabel(supply.rank)}</Link><span>{supply.costFils === null ? "Price required" : formatAED(supply.costFils / 100)} per pack, excluding VAT</span></li>)}</ul>{!supplyPrices.some(s=>s.skuId===sku.id) && <p className="text-sm text-text-muted">No supplier price recorded.</p>}</div>}
                  <SkuVariant
                    productId={product.id}
                    slug={product.slug ?? ""}
                    skuId={sku.id}
                    options={options}
                    chosen={[...(chosenValues.get(sku.id) ?? [])]}
                  />
                {/* Whether this can be deleted or only retired is worked out
                    here, while the page renders, so the control can say which
                    it is BEFORE the click rather than refusing afterwards. */}
                <RemovePack
                  productId={product.id}
                  skuId={sku.id}
                  skuCode={sku.skuCode}
                  removal={
                    product.skus.length === 1
                      ? {
                          kind: "retire-only",
                          because: "the only pack on this product",
                        }
                      : (removals.get(sku.id) ?? { kind: "deletable" })
                  }
                />
                </>
              }
            />
          ))}

          {/* Opens already, on the variant just added, so a new colour has
              somewhere to put a price the moment it exists. */}
          <AddPack
            productId={product.id}
            masterSku={product.skus[0]?.skuCode ?? ""}
            existingCodes={product.skus.map(sku => sku.skuCode)}
            forValue={(() => {
              if (!newVariant) return null;
              for (const option of options) {
                const hit = option.values.find((v) => v.id === newVariant);
                if (hit) return { id: hit.id, label: `${option.name} ${hit.value}` };
              }
              return null;
            })()}
          />

          <ProductOptions
            productId={product.id}
            slug={product.slug ?? ""}
            options={options}
          />

          {product.skus.length === 0 && (
            <p className="rounded-card border border-dashed border-border-strong bg-surface-sunken p-6 text-center text-sm text-text-muted">
              This product has no SKU, so there is nothing to buy. It cannot be
              made active until one exists.
            </p>
          )}

          {margins.length > 0 && <ProductMargins margins={margins} />}
        </div>

        <div className="space-y-5">
          <ProductStatusActions
            productId={product.id}
            status={product.status}
            statuses={[...PRODUCT_STATUSES]}
            hasActiveSku={product.skus.some((s) => s.isActive)}
            hasCategory={selected.size > 0}
          />

          <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <h2 className="text-base font-bold tracking-tight text-text">
              Images
            </h2>
            <ProductImages
              productId={product.id}
              slug={product.slug}
              productName={product.name}
              skus={product.skus.map(sku => ({ id: sku.id, label: `${sku.skuCode} - ${sku.unitLabel}` }))}
              images={product.images.map((image) => ({
                id: image.id,
                path: image.path,
                altText: image.altText,
                skuId: image.skuId,
              }))}
              maxMb={MAX_IMAGE_BYTES / 1024 / 1024}
            />
          </section>

          {cover && <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <h2 className="text-base font-bold tracking-tight text-text">
              Supply
            </h2>
            <ProductSupplyCover
              productId={product.id}
              slug={product.slug}
              prices={supplyPrices}
              packs={product.skus.filter(sku => sku.isActive).map(sku => ({ id: sku.id, skuCode: sku.skuCode }))}
              totalPacks={cover.totalPacks}
              slots={cover.slots}
              candidates={cover.candidates}
            />
          </section>}

          <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <h2 className="text-base font-bold tracking-tight text-text">
              Documents
            </h2>
            <ProductDocuments
              productId={product.id}
              slug={product.slug}
              documents={product.documents.map((doc) => ({
                id: doc.id,
                label: doc.label,
                path: doc.path,
                kind: doc.kind,
              }))}
              maxMb={MAX_DOCUMENT_BYTES / 1024 / 1024}
              accepted={ACCEPTED_DOCUMENTS}
            />
          </section>

          <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <h2 className="text-base font-bold tracking-tight text-text">
              History
            </h2>
            <dl className="mt-3 space-y-1.5 text-xs text-text-muted">
              <div className="flex justify-between gap-3">
                <dt>Created</dt>
                <dd className="tnum">
                  {product.createdAt.toISOString().slice(0, 10)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Updated</dt>
                <dd className="tnum">
                  {product.updatedAt.toISOString().slice(0, 10)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Approved</dt>
                <dd className="tnum">
                  {product.approvedAt
                    ? product.approvedAt.toISOString().slice(0, 10)
                    : "never"}
                </dd>
              </div>
            </dl>
            <Link
              href={`/admin/audit?entity=ProductMaster&id=${product.id}`}
              className="mt-3 inline-block text-xs font-semibold text-navy hover:underline"
            >
              Every change to this product &rarr;
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}
