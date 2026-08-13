import type { Metadata } from "next";
import { CheckoutView } from "./CheckoutView";

export const metadata: Metadata = {
  title: "Checkout",
  description:
    "Confirm your AussieMed trade order: delivery details, purchase order reference and payment terms, with subtotal, VAT and total shown in AED.",
};

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-text">
        Checkout
      </h1>
      <CheckoutView />
    </div>
  );
}
