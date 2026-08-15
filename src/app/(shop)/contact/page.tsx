import type { Metadata } from "next";
import { ContentPage, Section } from "@/components/ContentPage";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get in touch with the AussieMed team about products, pricing, an existing order or setting up a trade account.",
};

export default function ContactPage() {
  return (
    <ContentPage
      title="Contact us"
      intro="Questions about a product, an order or opening a trade account? Our team is here to help."
    >
      <Section heading="Email">
        {/* TODO: confirm the final address. The previous site used a
            misspelled domain, which must not carry over. */}
        <p>info@aussiemed.com</p>
      </Section>
      <Section heading="Existing orders">
        <p>
          Quote your reference number when you get in touch and we can find your
          order straight away.
        </p>
      </Section>
    </ContentPage>
  );
}
