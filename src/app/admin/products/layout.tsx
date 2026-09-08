import { SectionGuard } from "@/components/admin/SectionGuard";

/**
 * Permission gate for everything under /admin/products.
 *
 * A layout rather than a check in each page, so a screen added here later is
 * covered without anybody remembering to add one — see SectionGuard.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SectionGuard path="/admin/products">{children}</SectionGuard>;
}
