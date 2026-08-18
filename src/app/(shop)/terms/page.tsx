import type { Metadata } from "next";
import { ContentPage, Section } from "@/components/ContentPage";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "The terms and conditions governing trade purchases from AussieMed, including pricing, VAT, delivery and returns.",
};

/**
 * A DRAFT, written from how this platform actually trades — LG-01.
 *
 * The mechanics are taken from the code: prices ex-VAT, the daily supplier
 * cutoff, one AussieMed invoice per order (DEC-22), goods sourced against
 * orders rather than held in stock (DEC-24), and how a short delivery is
 * split. Those are facts about the system and a buyer is entitled to read them.
 *
 * The commercial terms are NOT taken from anywhere, because they do not exist
 * in the code and inventing them would be inventing the business: payment
 * terms (AC-09), a returns window, delivery charges, a liability position and a
 * governing jurisdiction. Each is marked in the text. A returns process is not
 * built at all, and this page says so rather than promising one.
 */

/** A decision only the business can make, left visible rather than guessed. */
function Confirm({ children }: { children: React.ReactNode }) {
  return (
    <strong className="font-semibold text-accent">[To confirm: {children}]</strong>
  );
}

export default function TermsPage() {
  return (
    <ContentPage
      title="Terms &amp; conditions"
      intro="The terms governing trade purchases from AussieMed."
      banner={
        <>
          <strong className="font-semibold">Draft, not yet approved.</strong>{" "}
          The mechanics below describe how this platform genuinely operates. The
          commercial terms marked &ldquo;to confirm&rdquo; are the
          business&rsquo;s to set, and the whole page needs legal review before
          launch. It is not legal advice.
        </>
      }
    >
      <Section heading="Who these terms are for">
        <p>
          AussieMed sells to businesses &mdash; clinics, laboratories, pharmacies
          and other trade buyers &mdash; and not to consumers. An account must be
          approved before orders can be placed, and we may decline an
          application.
        </p>
      </Section>

      <Section heading="Prices and VAT">
        <p>
          All prices are in UAE dirhams and are shown excluding VAT throughout
          the site. VAT is calculated at checkout and shown as its own line on
          your invoice, at 5% on standard-rated goods. Some lines are
          zero-rated, and where they are, the invoice says so.
        </p>
        <p>
          Many lines carry volume price breaks. The price that applies is the
          one for the quantity you actually order, and it is shown before you
          confirm. Prices may change without notice, but the price on your
          confirmed order is the price you pay.
        </p>
      </Section>

      <Section heading="How an order is accepted">
        <p>
          Placing an order is an offer to buy. A contract is formed when we
          confirm the order. We do not hold stock: goods are ordered from our
          suppliers against confirmed customer orders, which is why a line can
          occasionally prove unavailable after you have ordered it. If that
          happens we will tell you rather than substitute something.
        </p>
      </Section>

      <Section heading="Order cutoff">
        <p>
          Orders are grouped into a supplier run once a day. Orders confirmed
          before 5pm Gulf Standard Time enter that day&rsquo;s run; later ones
          enter the next. The site shows the time remaining on every page. The
          run operates every day, weekends included.
        </p>
      </Section>

      <Section heading="Delivery">
        <p>
          We deliver across the United Arab Emirates to the branch address on
          the order. Delivery dates given on the site are estimates based on
          supplier lead times and are not guaranteed.
        </p>
        <p>
          Where a supplier delivers less than we ordered, we fill the earliest
          customer order in full rather than splitting a shortfall across
          several &mdash; a part-filled box helps nobody. If your order is
          affected you will be told what is coming and when.
        </p>
        <p>
          <Confirm>
            delivery charges, any free-delivery threshold, and whether any
            emirates or areas are excluded
          </Confirm>
        </p>
      </Section>

      <Section heading="Payment">
        <p>
          Payment terms are set on your account. Unless agreed otherwise, orders
          are payable before despatch.
        </p>
        <p>
          <Confirm>
            the credit terms offered, credit limits, and what happens to an
            overdue account
          </Confirm>{" "}
          <Confirm>
            accepted payment methods &mdash; no payment is taken on the site
            today
          </Confirm>
        </p>
      </Section>

      <Section heading="Invoices">
        <p>
          AussieMed is the seller. However many suppliers a single order draws
          on, you receive one AussieMed invoice carrying our Tax Registration
          Number, and yours where you have given it to us. Suppliers invoice us,
          not you.
        </p>
      </Section>

      <Section heading="Cancellations and returns">
        <p>
          <strong className="font-semibold text-text">
            No returns process exists on this platform yet.
          </strong>{" "}
          An order that has not entered a supplier run can be cancelled by
          contacting us. Once goods have been ordered from a supplier on your
          behalf, cancellation depends on that supplier.
        </p>
        <p>
          <Confirm>
            the returns policy itself &mdash; what may be returned, within how
            many days, in what condition, who pays the carriage, and how
            sterile, refrigerated or dated stock is treated. Medical consumables
            usually cannot be returned once opened, and that needs a stated rule
          </Confirm>
        </p>
      </Section>

      <Section heading="Product information and suitability">
        <p>
          Product descriptions, images and specifications come from our
          suppliers and manufacturers. Images are illustrative and packaging may
          change. Nothing on this site is clinical or medical advice: it is your
          responsibility to confirm that a product is suitable for its intended
          use, and that using it complies with the regulations applying to your
          practice.
        </p>
        <p>
          Where goods carry a batch number and expiry date, both are recorded
          against your delivery, so a recall can be traced to the orders it
          affected.
        </p>
      </Section>

      <Section heading="Your account">
        <p>
          Keep your sign-in details to yourself. You are responsible for orders
          placed through your account, including by the people you have named as
          ordering for you. Tell us immediately if you believe somebody else has
          access to it.
        </p>
      </Section>

      <Section heading="Liability">
        <p>
          <Confirm>
            the liability position &mdash; a supplier of medical consumables
            normally limits liability to the value of the goods and excludes
            indirect loss, but this must be drafted and reviewed rather than
            assumed
          </Confirm>
        </p>
      </Section>

      <Section heading="Governing law">
        <p>
          <Confirm>
            the governing law and the courts with jurisdiction &mdash;
            ordinarily the laws of the UAE and the courts of the emirate the
            business is registered in
          </Confirm>
        </p>
      </Section>
    </ContentPage>
  );
}
