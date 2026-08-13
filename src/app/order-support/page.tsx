import type { Metadata } from "next";
import { ContentPage, Section } from "@/components/ContentPage";

export const metadata: Metadata = {
  title: "Order Support",
  description:
    "Help with AussieMed orders: tracking with your reference number, amending quantities, returns of damaged goods and invoice queries.",
};

export default function OrderSupportPage() {
  return (
    <ContentPage
      title="Order support"
      intro="Help with tracking, amendments, returns and invoices for orders placed with AussieMed."
    >
      <Section heading="Tracking an order">
        <p>
          Every order is issued a reference number when it is placed. Quote that
          reference in any correspondence and we can locate it immediately.
        </p>
      </Section>
      <Section heading="Amendments">
        <p>
          Quantities can usually be adjusted before an order is dispatched.
          Contact us with your reference number as early as you can.
        </p>
      </Section>
      <Section heading="Damaged or incorrect goods">
        <p>
          Let us know within a reasonable period of delivery and we will arrange
          a replacement or credit.
        </p>
      </Section>
    </ContentPage>
  );
}
