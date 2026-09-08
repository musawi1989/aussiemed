"use client";
import { usePathname, useRouter } from "next/navigation";
export function AdminBackButton() {
  const path = usePathname(); const router = useRouter();
  if (path === "/admin") return null;
  return <button type="button" onClick={() => { if (window.history.length > 1) router.back(); else router.push("/admin"); }} className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-card border-2 border-navy bg-navy px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-navy-hover print:hidden">← Back</button>;
}
