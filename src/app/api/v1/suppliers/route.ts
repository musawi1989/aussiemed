import { NextResponse } from "next/server";
import { getAllProducts, getSuppliers } from "@/lib/catalog";

/**
 * GET /api/v1/suppliers
 *
 * Public, so the storefront can attribute lines and show how an order will
 * split into invoices. Deliberately exposes no contact details, no secondary
 * email and no cost prices — those are admin-only and must never reach a
 * public endpoint.
 */
export async function GET() {
  const products = await getAllProducts();

  const suppliers = (await getSuppliers()).map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
    productCount: products.filter((p) => p.supplierId === supplier.id).length,
    isPlaceholder: supplier.isPlaceholder,
  }));

  return NextResponse.json({ suppliers });
}
