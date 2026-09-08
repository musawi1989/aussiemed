import { LogoEditor } from "@/components/LogoEditor";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatAED } from "@/lib/money";
import { StatusPill } from "@/components/StatusPill";
import { SupplierForm } from "@/components/SupplierForm";
import { RemoveSupplier } from "@/components/admin/RemoveSupplier";
import { TrnDocument } from "@/components/admin/TrnDocument";
import { AddSupplierItems } from "@/components/admin/AddSupplierItems";
import { RemoveSupplierItem } from "@/components/admin/RemoveSupplierItem";
import { packsForSupplier } from "@/lib/supplier-items";
import { rankLabel } from "@/lib/ranks";
import { ACCEPTED_DOCUMENTS, MAX_DOCUMENT_BYTES } from "@/lib/document-file";
import {
  RETIRED,
  deepestCategory,
  groupByCategory,
} from "@/lib/supply-grouping";

const aed = (fils: number) => formatAED(fils / 100);

export default async function AdminSupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ items?: string }>;
}) {
  const { id } = await params;
  // Named "items" rather than "q": this page may well grow a second search
  // one day, and two things called q is how one of them stops working.
  const { items: itemQuery } = await searchParams;

  const supplier = await db.supplier.findUnique({
    where: { id },
    include: {
      user: { select: { username: true, email: true, name: true } },
      // What they can supply, and what we have bought. A supplier no longer
      // owns products or appears on a customer's invoice.
      supplies: {
        orderBy: { rank: "asc" },
        select: {
          id: true,
          rank: true,
          costFils: true,
          isAvailable: true,
          sku: {
            select: {
              skuCode: true,
              unitLabel: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                  // Three levels, because that is how deep the tree goes
                  // (DA-41) and the grouping walks parents rather than
                  // trusting the order this relation comes back in.
                  categories: {
                    select: {
                      category: {
                        select: {
                          id: true,
                          name: true,
                          parent: {
                            select: {
                              id: true,
                              name: true,
                              parent: { select: { id: true, name: true } },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      purchaseOrders: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          poNumber: true,
          status: true,
          totalCostFils: true,
          createdAt: true,
        },
      },
    },
  });

  if (!supplier) notFound();

  /*
   * Loaded after the guard, so a bad id 404s without running a catalogue
   * query first — and after the supplier, because the search marks which
   * packs are already theirs and needs their id to do it.
   */
  const packs2 = await packsForSupplier(supplier.id, { q: itemQuery });

  /*
   * Grouped for reading rather than left flat.
   *
   * Twelve packs is a list; a real supplier's two hundred is a wall, and the
   * question an admin has is "do they cover gloves" rather than "what is item
   * 147". The rank ordering inside each group is the query's — primary first,
   * which is the one that matters.
   */
  const packs = groupByCategory(supplier.supplies, (supply) =>
    /*
     * A retired product is filed as retired, not as uncategorised.
     *
     * Retiring a product deliberately drops its category links — the seed
     * rebuilds those from the catalogue and a retired product is no longer in
     * it — so without this they all land under "Uncategorised", which reads as
     * a data fault and sends somebody looking for one that is not there. This
     * supplier had eleven of them, which is how it was noticed.
     */
    supply.sku.product.status === "Active"
      ? deepestCategory(supply.sku.product.categories.map((c) => c.category))
      : { id: "__retired", name: RETIRED },
  );

  return (
    <>
      <LogoEditor kind="supplier" id={supplier.id} name={supplier.companyName} />
      <div className="mt-6">
        <Link
          href="/admin/suppliers"
          className="inline-flex min-h-11 items-center gap-2 rounded-card border-2 border-navy bg-navy px-4 py-2 font-bold text-white text-sm"
        >
          &larr; All suppliers
        </Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight text-text">
          {supplier.companyName}
          <StatusPill axis="record" status={supplier.status} />
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {supplier.user
            ? `Portal login: ${supplier.user.username ?? supplier.user.email}`
            : "No portal login — this supplier cannot sign in yet."}
        </p>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div>
        <Link href={`/admin/products/new?supplierId=${supplier.id}`} className="mb-3 inline-block text-sm font-semibold text-navy">Add a product from this supplier</Link>
        <SupplierForm
          supplier={{
            id: supplier.id,
            companyName: supplier.companyName,
            primaryEmail: supplier.primaryEmail,
            secondaryEmail: supplier.secondaryEmail,
            phone: supplier.phone,
            countryCode: supplier.countryCode,
            emirate: supplier.emirate,
            address: supplier.address,
            trn: supplier.trn,
            status: supplier.status,
            promisedLeadTimeDays: supplier.promisedLeadTimeDays,
            paymentTermsDays: supplier.paymentTermsDays,
            paymentTermsLabel: supplier.paymentTermsLabel,
            ackSlaHours: supplier.ackSlaHours,
          }}
        />
        {supplier.status !== "Archived" && <RemoveSupplier id={supplier.id} name={supplier.companyName} />}
        </div>

        <div className="space-y-5">
          {/* Beside the form rather than inside it: a file input among text
              fields means re-choosing the file to correct a phone number, and
              there is nothing to attach a document to until the record
              exists. */}
          <TrnDocument
            kind="supplier"
            id={supplier.id}
            document={
              supplier.trnDocumentName && supplier.trnDocumentUploadedAt
                ? {
                    name: supplier.trnDocumentName,
                    uploadedAt: supplier.trnDocumentUploadedAt,
                  }
                : null
            }
            maxMb={MAX_DOCUMENT_BYTES / 1024 / 1024}
            accepted={ACCEPTED_DOCUMENTS}
          />

          <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <h2 className="text-base font-bold tracking-tight text-text">
              Packs they supply ({supplier.supplies.length})
            </h2>
            {supplier.supplies.length === 0 ? (
              <p className="mt-3 text-sm text-text-muted">
                Nothing is sourced from this supplier yet.
              </p>
            ) : (
              <div className="mt-3 max-h-96 space-y-4 overflow-y-auto pr-1">
                {packs.map((group) => (
                  <div key={`${group.department} ${group.subCategory ?? ""}`}>
                    {/* Department, then the shelf within it. The count is on
                        the heading because "do they cover gloves, and how
                        much of it" is one question, not two. */}
                    <p className="sticky top-0 z-10 -mx-1 bg-surface px-1 pb-1 text-[11px] font-bold uppercase tracking-wide text-text-subtle">
                      {group.department}
                      {group.subCategory && (
                        <>
                          <span className="mx-1 text-border-strong">
                            &rsaquo;
                          </span>
                          <span className="text-text-muted">
                            {group.subCategory}
                          </span>
                        </>
                      )}
                      <span className="ml-1.5 font-semibold text-text-subtle tnum">
                        ({group.items.length})
                      </span>
                    </p>

                    <ul className="space-y-1.5 border-l border-border-base pl-2">
                      {group.items.map((supply) => (
                        <li
                          key={`${supply.sku.skuCode}-${supply.rank}`}
                          className="flex items-center gap-2"
                        >
                          <Link
                            href={`/admin/products/${supply.sku.product.id}`}
                            className="flex-1 truncate text-sm text-navy hover:underline"
                          >
                            {supply.sku.product.name}
                            <span className="ml-1 text-xs text-text-subtle tnum">
                              {supply.sku.unitLabel}
                            </span>
                          </Link>
                          <span className="shrink-0 text-xs tnum text-text-muted">
                            {supply.costFils === null
                              ? "no cost"
                              : aed(supply.costFils)}
                          </span>
                          {/* A null rank rendered as an empty pill, which
                              read as a missing value rather than as what it
                              is: an offer, meaning they can supply it and we
                              have not allocated it to them. */}
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              supply.rank === "Primary"
                                ? "bg-navy-soft text-navy"
                                : "bg-surface-sunken text-text-muted"
                            }`}
                            title={
                              supply.rank === null
                                ? "They can supply this. We have not allocated it to them — that is Cover."
                                : undefined
                            }
                          >
                            {rankLabel(supply.rank)}
                          </span>
                          {supply.sku.product.status !== "Active" && (
                            /* On the row as well as in the heading: a
                               supplier's list is read a line at a time, and a
                               heading two screens up is not context. */
                            <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-bold text-text-subtle">
                              retired
                            </span>
                          )}
                          {!supply.isAvailable && (
                            <span className="shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">
                              unavailable
                            </span>
                          )}
                          {supply.rank === null && (
                            <RemoveSupplierItem
                              supplierId={supplier.id}
                              supplyId={supply.id}
                              name={supply.sku.product.name}
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <AddSupplierItems
              supplierId={supplier.id}
              packs={packs2}
              query={itemQuery ?? ""}
              total={supplier.supplies.length}
            />
          </section>

          <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <h2 className="text-base font-bold tracking-tight text-text">
              Recent purchase orders
            </h2>
            {supplier.purchaseOrders.length === 0 ? (
              <p className="mt-3 text-sm text-text-muted">
                Nothing has been ordered from this supplier yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {supplier.purchaseOrders.map((po) => (
                  <li
                    key={po.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <Link
                      href={`/admin/purchasing/${po.poNumber}`}
                      className="font-semibold tnum text-navy hover:underline"
                    >
                      {po.poNumber}
                    </Link>
                    <span className="flex items-center gap-2">
                      <StatusPill axis="fulfilment" status={po.status} />
                      <span className="font-semibold tnum text-text">
                        {po.totalCostFils === null
                          ? "—"
                          : aed(po.totalCostFils)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
