import type { Metadata } from "next";
import { ContentPage } from "@/components/ContentPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How AussieMed collects, uses and stores the personal and business information you provide when ordering or opening a trade account.",
};

export default function PrivacyPage() {
  return (
    <ContentPage
      title="Privacy policy"
      intro="How we collect, use and store the information you provide when ordering or opening a trade account."
    >
      <p>
        Approved wording has not been supplied yet. A privacy policy has to
        describe what the system actually does with personal data, so this page
        will be written once the backend and email flows exist.
      </p>
    </ContentPage>
  );
}
