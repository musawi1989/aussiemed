import type { Metadata } from "next";
import { ContentPage } from "@/components/ContentPage";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "The terms and conditions governing trade purchases from AussieMed, including pricing, VAT, delivery and returns.",
};

export default function TermsPage() {
  return (
    <ContentPage
      title="Terms & conditions"
      intro="The terms governing trade purchases from AussieMed, including pricing, VAT, delivery and returns."
    >
      <p>
        Approved legal wording has not been supplied yet. Nothing invented has
        been put here, because terms of sale are a legal document and must come
        from the business.
      </p>
    </ContentPage>
  );
}
