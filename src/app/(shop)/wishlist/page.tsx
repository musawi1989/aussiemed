import type { Metadata } from "next";
import { WishlistView } from "./WishlistView";

export const metadata: Metadata = {
  title: "Your Wishlist",
  description:
    "Products you've saved for a future AussieMed order. Add them straight to your cart when you're ready to reorder.",
};

export default function WishlistPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-text">
        Your wishlist
      </h1>
      <WishlistView />
    </div>
  );
}
