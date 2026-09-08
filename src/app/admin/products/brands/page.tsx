import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { AdminForm, Field } from "@/components/AdminForm";
import { BrandStatusForm } from "@/components/admin/BrandStatusForm";
import { createBrandAction } from "./actions";
export default async function BrandsPage() {
  await requireAdmin("products", "view");
  const brands = await db.brand.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } });
  return <div className="mt-6 max-w-3xl">
    <Link href="/admin/products" className="text-sm text-navy">All products</Link>
    <h1 className="mt-2 text-xl font-bold text-text">Brands</h1>
    <table className="mt-4 w-full text-left text-sm"><thead><tr className="border-b border-border-base"><th className="py-2">Brand</th><th>Products</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{brands.map(brand => <tr key={brand.id} className="border-b border-border-base"><td className="py-3">{brand.name}</td><td>{brand._count.products}</td><td>{brand.isActive ? "Active" : "Removed"}</td><td>{brand.slug !== "generic" && <BrandStatusForm id={brand.id} name={brand.name} active={brand.isActive} />}</td></tr>)}</tbody>
    </table>
    <div className="mt-6 border-t border-border-base pt-4"><AdminForm action={createBrandAction} submitLabel="Add brand"><Field label="Brand name" name="name" required maxLength={100} /></AdminForm></div>
  </div>;
}
