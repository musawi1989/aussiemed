import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PRODUCT_STATUSES, TAX_CLASSES } from "@/lib/admin";
import { StatusPill } from "@/components/StatusPill";
import { ProductStatusActions } from "@/components/ProductStatusActions";
import { SkuEditor } from "@/components/SkuEditor";
import { ProductDetailsForm } from "@/components/ProductDetailsForm";
import { ProductImages } from "@/components/admin/ProductImages";
import { ProductMargins } from "@/components/admin/ProductMargins";
import { productMargins } from "@/lib/margin-data";
import { MAX_IMAGE_BYTES } from "@/lib/storage";

/**
 * One product, everything about it.
 *
 * Laid out as separate forms rather than one enormous save: the details, each
 * SKU and each SKU's price breaks are independent decisions, and an admin
 * correcting a price should not have to re-submit a description to do it.
 */
export default async function AdminProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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
      },
    }),
    db.supplier.findMany({
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true, status: true },
    }),
    db.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.category.findMany({
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, parentId: true },
    }),
  ]);

  if (!product) notFound();

  // Admin-guarded and fetched separately on purpose: cost never rides along
  // inside a query that anything else might come to reuse.
  const margins = await productMargins(product.id);

  // Departments first, each followed by its own children, so the picker reads
  // as the tree rather than an alphabetical soup of 146 names.
  const departments = categories.filter((c) => c.parentId === null);
  const grouped = departments.map((dept) => ({
    ...dept,
    children: categories.filter((c) => c.parentId === dept.id),
  }));

  const selected = new Set(product.categories.map((c) => c.categoryId));

  return (
    <>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/admin/products"
            className="text-sm font-semibold text-text-muted hover:text-navy"
          >
            &larr; All products
          </Link>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-text">
            {product.name}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-muted">
            <StatusPill status={product.status} />
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
            departments={grouped}
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
            />
          ))}

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
              images={product.images.map((image) => ({
                id: image.id,
                path: image.path,
                altText: image.altText,
              }))}
              maxMb={MAX_IMAGE_BYTES / 1024 / 1024}
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
