import type { Metadata } from "next";
import { CartView } from "./CartView";

export const metadata: Metadata = {
  title: "Your Cart",
  description:
    "Review the items in your AussieMed trade order, adjust quantities to reach volume price breaks, and see your subtotal, VAT and total in AED.",
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-text">
        Your cart
      </h1>
      <CartView />
    </div>
  );
}
