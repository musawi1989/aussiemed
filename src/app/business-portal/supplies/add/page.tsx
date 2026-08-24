import Link from "next/link";
import { db } from "@/lib/db";
import { UrlFilters } from "@/components/UrlFilters";
import { AddSupplyButton } from "@/components/portal/AddSupplyButton";
import { availableProducts, offersNeedApproval } from "@/lib/supply-offers";

/**
 * The catalogue, for a supplier to pick from.
 *
 * They know what they stock better than we do, and until now saying so meant
 * ringing us. Adding an item here records that they can supply it; it does not
 * decide that they will. Who receives a purchase order is set on our side, on
 * the Cover screen, and this page says so plainly rather than leaving them to
 * wonder why nothing arrived.
 *
 * Items already on their list are not shown. A list of things you cannot pick
 * is a list you read twice.
 */
export default async function AddSupplyPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoryId?: string }>;
}) {
  const filters = await searchParams;

  const [products, categories, needsApproval] = await Promise.all([
    availableProducts(filters),
    db.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    offersNeedApproval(),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link
        href="/business-portal/supplies"
        className="text-sm font-semibold text-text-muted hover:text-navy"
      >
        &larr; What you supply
      </Link>

      <h1 className="mt-1 text-2xl font-bold tracking-tight text-text">
        Add items you can supply
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-text-muted">
        Tell us what you stock and we will consider you for it.{" "}
        {needsApproval
          ? "Additions are checked by us before they take effect."
          : "Additions take effect straight away."}{" "}
        Adding an item does not put you in line for an order on its own &mdash;
        which supplier we buy each item from is set by AussieMed.
      </p>

      <UrlFilters
        basePath="/business-portal/supplies/add"
        // Picking a category applies it. Browsing a catalogue is a one-choice-
        // then-look job, the same as filtering your own orders — see the note
        // on the prop for why the admin lists deliberately do not do this.
        autoApply
        searchName="q"
        searchValue={filters.q ?? ""}
        searchPlaceholder="Search the catalogue"
        selects={[
          {
            name: "categoryId",
            label: "Category",
            allLabel: "All categories",
            value: filters.categoryId ?? "",
            options: categories.map((c) => ({ value: c.id, label: c.name })),
          },
        ]}
      />

      {products.length === 0 ? (
        <p className="mt-5 rounded-card border border-border-base bg-surface px-4 py-12 text-center text-sm text-text-muted shadow-card">
          Nothing in the catalogue matches that. Try a different search or
          category.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-border-base bg-surface shadow-card">
          <table className="w-full min-w-[42rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-base text-left text-xs font-bold uppercase tracking-wide text-text-subtle">
                {/* Their code and ours in separate columns: the two rarely
                    match, and a supplier scanning for their own number should
                    not have to read past ours. */}
                <th className="w-16 px-3 py-2">
                  <span className="sr-only">Photo</span>
                </th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Our code</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2 text-right">Add</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                /*
                  THE WHOLE ROW OPENS THE ITEM.

                  A stretched link again rather than wrapping the row, because
                  the row holds an Add button and a button inside a link is
                  invalid HTML that browsers resolve by breaking one of them.
                  The name is the only real link and its ::after covers the
                  row; Add is lifted above that overlay.

                  position: relative on a <tr> is doing the work here. It is
                  well supported now but was not always, so this was clicked in
                  a real browser at the far edge of a row rather than assumed.
                */
                <tr
                  key={product.skuId}
                  className="relative border-b border-border-base transition-colors last:border-0 hover:bg-navy-soft/40"
                >
                  <td className="px-3 py-2">
                    {/* Fixed size, so a hundred rows stay a list rather than
                        becoming a gallery. */}
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border-base bg-surface-sunken">
                      {product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.image}
                          alt={product.imageAlt ?? ""}
                          width={44}
                          height={44}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span aria-hidden="true" className="text-[10px] text-text-subtle">
                          no photo
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-semibold text-text">
                    <Link
                      href={`/products/${product.slug}`}
                      target="_blank"
                      rel="noopener"
                      className="text-navy after:absolute after:inset-0 after:content-[''] hover:underline"
                    >
                      {product.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 tnum text-text-muted">
                    {product.skuCode}
                  </td>
                  <td className="px-3 py-2 text-text-muted">
                    {product.categoryName ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-text-muted">
                    {product.unitLabel}
                  </td>
                  <td className="relative z-10 px-3 py-2 text-right">
                    {product.mine ? (
                      /* Said, not hidden. After adding, this is what the row
                         becomes — which is the confirmation, and it survives
                         the re-render a per-row message could not. */
                      <span className="text-xs font-bold text-success">
                        On your list
                      </span>
                    ) : (
                      <AddSupplyButton skuId={product.skuId} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-text-subtle tnum">
        {products.length === 100
          ? "Showing the first 100. Narrow the search to see more."
          : `${products.length} ${products.length === 1 ? "item" : "items"}`}
      </p>
    </div>
  );
}
