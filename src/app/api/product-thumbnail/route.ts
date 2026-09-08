import { db } from "@/lib/db";
import { NextResponse } from "next/server";
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("sku");
  if (!code || code.length > 200) return NextResponse.redirect(new URL("/product-placeholder.svg", request.url));
  const sku = await db.productSku.findUnique({ where: { skuCode: code }, select: { images: { orderBy: { sortOrder: "asc" }, take: 1, select: { path: true } }, product: { select: { images: { where: { skuId: null }, orderBy: { sortOrder: "asc" }, take: 1, select: { path: true } } } } } });
  const path = sku?.images[0]?.path ?? sku?.product.images[0]?.path;
  return NextResponse.redirect(new URL(path?.startsWith("/") && !path.startsWith("//") ? path : "/product-placeholder.svg", request.url));
}
