import Link from "next/link";
import { db } from "@/lib/db";
import { COLUMNS } from "@/lib/catalogue-template";
import { CatalogueUpload } from "@/components/admin/CatalogueUpload";

/**
 * Loading the catalogue from a spreadsheet — BE-04.
 *
 * The template is generated on demand rather than kept as a file, so it always
 * lists the suppliers and categories that exist now.
 */
export default async function CatalogueUploadPage() {
  const [suppliers, jobs] = await Promise.all([
    db.supplier.findMany({
      where: { status: "Active" },
      orderBy: { companyName: "asc" },
      select: { companyName: true },
    }),
    db.bulkUploadJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        filename: true,
        status: true,
        rowsTotal: true,
        rowsCreated: true,
        rowsErrored: true,
        createdAt: true,
      },
    }),
  ]);

  const required = COLUMNS.filter((c) => c.required);

  return (
    <>
      <div className="mt-6">
        <Link
          href="/admin/products"
          className="inline-flex min-h-11 items-center gap-2 rounded-card border-2 border-navy bg-navy px-4 py-2 font-bold text-white text-sm"
        >
          &larr; All products
        </Link>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-text">
          Load the catalogue
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          One row is one pack a customer can buy. A product sold in three sizes
          gets three rows sharing a product code. Matching is on item code, so
          uploading a corrected file updates the same products rather than
          creating a second copy of the catalogue.
        </p>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <h2 className="text-base font-bold tracking-tight text-text">
              1. Get the template
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              It carries the columns, one worked example and a sheet explaining
              every field. It also lists the{" "}
              {suppliers.length} supplier{suppliers.length === 1 ? "" : "s"} set
              up today, because supplier names must match exactly.
            </p>
            <a
              href="/admin/products/upload/template"
              className="mt-4 inline-block rounded-card bg-navy px-5 py-2.5 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover"
            >
              Download template
            </a>
          </section>

          <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <h2 className="text-base font-bold tracking-tight text-text">
              2. Send it back
            </h2>
            <div className="mt-3">
              <CatalogueUpload />
            </div>
          </section>

          {jobs.length > 0 && (
            <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
              <h2 className="text-base font-bold tracking-tight text-text">
                Recent uploads
              </h2>
              <ul className="mt-3 space-y-1.5">
                {jobs.map((job) => (
                  <li
                    key={job.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-base pb-1.5 text-sm last:border-0"
                  >
                    <span className="text-text">{job.filename}</span>
                    <span className="text-xs tnum text-text-subtle">
                      {job.createdAt.toISOString().slice(0, 16).replace("T", " ")}{" "}
                      &middot; {job.rowsCreated} loaded of {job.rowsTotal}
                      {job.rowsErrored > 0 ? ` · ${job.rowsErrored} rejected` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <h2 className="text-base font-bold tracking-tight text-text">
              What must be filled in
            </h2>
            <ul className="mt-3 space-y-1 text-sm text-text-muted">
              {required.map((column) => (
                <li key={column.key}>{column.header}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-text-subtle">
              Everything else is optional. Cost is optional but worth filling
              in — without it nothing can tell you the margin on a line.
            </p>
          </section>

          <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <h2 className="text-base font-bold tracking-tight text-text">
              What happens after
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-text-muted">
              <li>
                Products arrive as <strong className="text-text">Draft</strong>.
                Nothing goes on sale until you approve it.
              </li>
              <li>
                Rows that cannot be read are listed with their row number and
                what is wrong. The rest still load.
              </li>
              <li>
                A supplier that is not already set up will reject its rows —
                add them under Suppliers first.
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
