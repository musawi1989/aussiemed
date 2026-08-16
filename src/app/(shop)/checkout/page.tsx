import type { Metadata } from "next";
import { CheckoutView } from "./CheckoutView";
import {
  accountBranches,
  accountIdentity,
  accountSession,
  accountStaff,
} from "@/lib/account";

export const metadata: Metadata = {
  title: "Checkout",
  description:
    "Confirm your AussieMed trade order: delivery details, purchase order reference and payment terms, with subtotal, VAT and total shown in AED.",
};

/**
 * Checkout.
 *
 * A guest sees the plain form. A signed-in trade account also gets to say
 * which branch the order is for and who is placing it, from lists they keep
 * themselves — both empty for an account that has not set any up, in which
 * case the pickers simply do not appear rather than showing an empty select.
 */
export default async function CheckoutPage() {
  const session = await accountSession();

  const [branches, staff, identity] = session
    ? await Promise.all([accountBranches(), accountStaff(), accountIdentity()])
    : [[], [], null];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-text">
        Checkout
      </h1>
      <CheckoutView
        branches={branches.map((b) => ({
          id: b.id,
          label: b.label ?? b.city,
          line1: b.line1,
          city: b.city,
          contact: b.contact,
          phone: b.phone,
          emirate: b.emirate,
          isDefault: b.isDefault,
        }))}
        staff={staff.map((s) => ({ id: s.id, name: s.name }))}
        company={identity?.organisationName ?? ""}
        email={identity?.email ?? ""}
      />
    </div>
  );
}
