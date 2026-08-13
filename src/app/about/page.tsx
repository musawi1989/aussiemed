import type { Metadata } from "next";
import { ContentPage, Section } from "@/components/ContentPage";

export const metadata: Metadata = {
  title: "About AussieMed",
  description:
    "AussieMed supplies medical, dental, laboratory and cleaning products to clinics, laboratories and aged-care providers across the UAE, with published volume pricing.",
};

export default function AboutPage() {
  return (
    <ContentPage
      title="About AussieMed"
      intro="We supply medical, dental, laboratory and cleaning products to clinics, laboratories and aged-care providers across the UAE."
    >
      <Section heading="What we do">
        <p>
          AussieMed is a trade supplier. We work with a network of suppliers to
          keep everyday consumables in stock and priced transparently, so
          procurement teams can order without chasing quotes for routine lines.
        </p>
      </Section>
      <Section heading="How we price">
        <p>
          Volume breaks are published on every product page rather than held
          back for negotiation. Prices are shown in AED excluding 5% VAT, which
          is applied at checkout.
        </p>
      </Section>
    </ContentPage>
  );
}
