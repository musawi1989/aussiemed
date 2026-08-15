import { ShopChrome } from "@/components/ShopChrome";

/**
 * Everything a customer sees. The group name is in parentheses, so it does not
 * appear in any URL — /products is still /products.
 */
export default function ShopLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ShopChrome>{children}</ShopChrome>;
}
