import { SectionGuard } from "@/components/admin/SectionGuard";
import { SectionTabs } from "@/components/admin/SectionTabs";

/**
 * Permission gate for everything under /admin/orders.
 *
 * A layout rather than a check in each page, so a screen added here later is
 * covered without anybody remembering to add one — see SectionGuard.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SectionGuard path="/admin/orders"><SectionTabs tabs={[
    { href: "/admin/orders", label: "Orders", exact: true },

  ]} />{children}</SectionGuard>;
}
