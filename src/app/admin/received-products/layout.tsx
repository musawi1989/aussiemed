import { SectionGuard } from "@/components/admin/SectionGuard";
export default function Layout({ children }: { children: React.ReactNode }) { return <SectionGuard path="/admin/received-products">{children}</SectionGuard>; }
