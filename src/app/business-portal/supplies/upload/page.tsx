import type { Metadata } from "next";
import Link from "next/link";
import { SupplyUpload } from "@/components/supplier/SupplyUpload";
import { listMySupplies } from "@/lib/supplier-portal";

export const metadata: Metadata = {
  title: "Update by spreadsheet",
  robots: { index: false, follow: false },
};

export default async function SupplyUploadPage() {
  const supplies = await listMySupplies();

  return (
    <div className="px-4 py-6 lg:px-8">
      <Link
        href="/business-portal/supplies"
        className="text-sm font-semibold text-text-muted hover:text-navy"
      >
        &larr; What you supply
      </Link>

      <h1 className="mt-1 text-xl font-bold tracking-tight text-text">
        Update by spreadsheet
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-text-muted">
        For changing a lot of prices at once. One item at a time is quicker on
        the previous screen.
      </p>

      <div className="mt-5 max-w-3xl">
        <SupplyUpload itemCount={supplies.length} />
      </div>
    </div>
  );
}
