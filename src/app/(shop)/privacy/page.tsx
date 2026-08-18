import type { Metadata } from "next";
import { ContentPage, Section } from "@/components/ContentPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How AussieMed collects, uses and stores the personal and business information you provide when ordering or opening a trade account.",
};

/**
 * A DRAFT, written from what the system actually does — LG-02.
 *
 * Every statement here was checked against the code rather than copied from a
 * template: the cookie names and lifetimes, what is stored on an order, the
 * search logging, the fact that suppliers never see a customer. A privacy
 * policy that describes a different system to the one running is worse than no
 * policy, because it is a promise nobody is keeping.
 *
 * It is not legal advice and it is not approved. Anything the business has to
 * decide is marked in the text rather than invented — a retention period and a
 * hosting location cannot be deduced from source code.
 */

/** A decision only the business can make, left visible rather than guessed. */
function Confirm({ children }: { children: React.ReactNode }) {
  return (
    <strong className="font-semibold text-accent">[To confirm: {children}]</strong>
  );
}

export default function PrivacyPage() {
  return (
    <ContentPage
      title="Privacy policy"
      intro="How we collect, use and store the information you give us when you order or open a trade account."
      banner={
        <>
          <strong className="font-semibold">Draft, not yet approved.</strong>{" "}
          Written from what this system actually does, so that a lawyer has
          something accurate to correct rather than a blank page. It is not
          legal advice, and the points marked “to confirm” are decisions for the
          business.
        </>
      }
    >
      <Section heading="Who we are">
        <p>
          AussieMed supplies medical, dental, laboratory and cleaning consumables
          to businesses in the UAE. You can reach us at{" "}
          <a href="mailto:info@aussiemed.com" className="font-semibold text-navy hover:underline">
            info@aussiemed.com
          </a>
          . <Confirm>registered company name, trade licence number and postal address</Confirm>
        </p>
      </Section>

      <Section heading="What we collect, and why">
        <p>
          We collect what an order needs and little else. When you open an
          account: your name, email address, telephone number, your company
          name, and your Tax Registration Number if you have one. When you add a
          branch: its address and label. When you tell us who orders for you:
          their names — not their email addresses, which we deliberately stopped
          collecting.
        </p>
        <p>
          When you place an order we keep the order itself: what was bought, at
          what price, which branch it was for, who placed it, and the VAT
          treatment of every line. Those details are copied onto the order
          rather than merely linked, so an invoice still reads correctly years
          later when a price or a product name has changed.
        </p>
        <p>
          If you ask for a quote, a bulk-buy price or to be told when something
          is back in stock, we keep what you sent us so somebody can answer it.
        </p>
      </Section>

      <Section heading="What we record about how the site is used">
        <p>
          Search terms typed into the site are recorded with the number of
          results they returned, so we can see what buyers are looking for and
          cannot find. Only submitted searches are recorded, not every keystroke,
          and repeats from the same visitor within five minutes are counted once.
        </p>
        <p>
          Changes made in the back office are recorded with who made them and
          when, and changes to your own account carry the reason the person gave.
          Failed sign-in attempts are counted for fifteen minutes to stop
          passwords being guessed, then deleted.
        </p>
        <p>
          There is no advertising, no analytics service, no third-party tracking
          and no tracking pixel in any email we send. Nothing about you is sold
          or shared for marketing.
        </p>
      </Section>

      <Section heading="Cookies and what your browser keeps">
        <p>
          Two cookies. A sign-in cookie that keeps you signed in for seven days,
          which your browser will not let a script read. A basket cookie called{" "}
          <code>aussiemed_cart</code>, kept for thirty days, so a basket started
          before you signed in is still there afterwards.
        </p>
        <p>
          Your browser also stores your basket, your quote list, your saved
          products and whether you prefer prices shown with or without VAT.
          Those stay on your device. Clearing your browser data removes them.
        </p>
      </Section>

      <Section heading="Who sees your information">
        <p>
          Our own staff, to process and deliver your orders and to answer you.
        </p>
        <p>
          <strong className="font-semibold text-text">Not our suppliers.</strong>{" "}
          We buy the goods and sell them to you, so a supplier receives a
          purchase order from AussieMed carrying part numbers and quantities. It
          does not carry your name, your company, your address or your order
          reference. This is enforced in the software and tested automatically
          on every change, not left to habit.
        </p>
        <p>
          Beyond that, only where the law requires it, or a service we depend on
          to run the site — <Confirm>hosting, email delivery and payment
          providers, once chosen</Confirm>
        </p>
      </Section>

      <Section heading="Where it is kept, and for how long">
        <p>
          Orders and invoices are kept as business records for as long as tax
          law requires. <Confirm>retention period — UAE VAT record-keeping is
          commonly five years</Confirm>
        </p>
        <p>
          Sign-in sessions expire after seven days. Sign-in attempt records are
          deleted after fifteen minutes. Everything else is kept while your
          account is open. <Confirm>which country the data is stored in, once
          hosting is chosen</Confirm>
        </p>
      </Section>

      <Section heading="Payments">
        <p>
          No card details are taken on this site, and none are stored anywhere in
          it. <Confirm>how payment will be taken, and which provider</Confirm>
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          Ask us for a copy of what we hold about you, ask us to correct it, or
          ask us to delete it, by emailing{" "}
          <a href="mailto:info@aussiemed.com" className="font-semibold text-navy hover:underline">
            info@aussiemed.com
          </a>
          . Some of it we must keep regardless — an invoice is a tax record and
          cannot be deleted on request.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          If this policy changes we will publish the new version here.{" "}
          <Confirm>whether account holders should be emailed when it does</Confirm>
        </p>
      </Section>
    </ContentPage>
  );
}
