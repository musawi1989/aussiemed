import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { NextResponse } from "next/server";
export async function GET(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  const user = await getSessionUser();
  const own = user && (kind === "supplier" ? user.supplierId === id : kind === "organisation" ? user.organisationId === id : kind === "user" && user.id === id);
  let path: string | null | undefined;
  if (user && (user.role === "Admin" || own)) {
    const row = kind === "supplier" ? await db.supplier.findUnique({ where: { id }, select: { logoPath: true } }) : kind === "organisation" ? await db.organisation.findUnique({ where: { id }, select: { logoPath: true } }) : kind === "user" ? await db.user.findUnique({ where: { id }, select: { logoPath: true } }) : null;
    path = row?.logoPath;
  }
  const response = NextResponse.redirect(new URL(path?.startsWith("/uploads/") ? path : "/entity-placeholder.svg", request.url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
