/**
 * One colour system for every status in the business.
 *
 * An order carries three separate questions at once, and they genuinely have
 * different answers: where the goods are (fulfilment), where the parcel is
 * (delivery), and whether we have been paid (payment). An order can be
 * delivered and unpaid, or paid and backordered. Collapsing them into one
 * status word is how a business loses track of money, so they stay apart —
 * and each one gets the same five tones, meaning the same five things.
 *
 * THE RULE THE WHOLE SYSTEM RESTS ON: a colour describes *how concerned to be*,
 * never which department a word belongs to. Green always means finished and
 * fine. Amber always means a person has to do something. Red always means
 * stopped or wrong. Learn it once on the orders list and it reads the same on
 * an invoice, a purchase order and a supplier screen.
 *
 * Before this existed there was a flat list of eleven words, and the twenty-odd
 * it did not know about all fell through to grey — so "Overdue" was rendered
 * in exactly the same grey as "Draft". An overdue invoice looked dormant. That
 * is the failure this module is shaped to make impossible: every status word
 * in the schema is mapped here, and a test walks the schema comments to prove
 * none has been missed.
 *
 * Pure. No imports at runtime, so the pills, the print stylesheet, the seed
 * script and the tests all read one set of definitions.
 */

/* ------------------------------------------------------------------ *
 * The five tones
 * ------------------------------------------------------------------ */

export type Tone = "resting" | "active" | "attention" | "complete" | "stopped";

export type ToneMeta = {
  /**
   * A shape as well as a colour.
   *
   * Roughly one man in twelve cannot separate red from green, and every one of
   * these documents is designed to be printed — often on a mono office laser,
   * where all five tones arrive as the same grey. Colour carries the meaning
   * quickly for the people who can see it; the glyph carries it at all for
   * everyone else. Neither is decoration.
   */
  glyph: string;
  /** What this tone means, in the words we would use out loud. */
  meaning: string;
  /** Tailwind classes for a filled pill. */
  pill: string;
  /** Just the text colour, for a word set in running copy. */
  text: string;
  /** A 3px rail down the side of a row or card. */
  rail: string;
  /** A bare dot, for a dense table where a pill would be too heavy. */
  dot: string;
};

export const TONES: Record<Tone, ToneMeta> = {
  resting: {
    glyph: "○",
    meaning: "Nothing is happening, and nothing should be yet.",
    pill: "bg-[var(--tone-resting-soft)] text-[var(--tone-resting)] ring-1 ring-inset ring-border-base",
    text: "text-[var(--tone-resting)]",
    rail: "bg-[var(--tone-resting)]",
    dot: "bg-[var(--tone-resting)]",
  },
  active: {
    glyph: "▸",
    meaning: "Under way and on track. Nobody needs to do anything.",
    pill: "bg-[var(--tone-active-soft)] text-[var(--tone-active)] ring-1 ring-inset ring-navy-border",
    text: "text-[var(--tone-active)]",
    rail: "bg-[var(--tone-active)]",
    dot: "bg-[var(--tone-active)]",
  },
  attention: {
    glyph: "▲",
    meaning: "Stuck until a person does something about it.",
    pill: "bg-[var(--tone-attention-soft)] text-[var(--tone-attention)] ring-1 ring-inset ring-accent-border",
    text: "text-[var(--tone-attention)]",
    rail: "bg-[var(--tone-attention)]",
    dot: "bg-[var(--tone-attention)]",
  },
  complete: {
    glyph: "✔",
    meaning: "Finished, and finished properly.",
    pill: "bg-[var(--tone-complete-soft)] text-[var(--tone-complete)] ring-1 ring-inset ring-success/30",
    text: "text-[var(--tone-complete)]",
    rail: "bg-[var(--tone-complete)]",
    dot: "bg-[var(--tone-complete)]",
  },
  stopped: {
    glyph: "✕",
    meaning: "Stopped, refused, or past the date it should have happened.",
    pill: "bg-[var(--tone-stopped-soft)] text-[var(--tone-stopped)] ring-1 ring-inset ring-danger/30",
    text: "text-[var(--tone-stopped)]",
    rail: "bg-[var(--tone-stopped)]",
    dot: "bg-[var(--tone-stopped)]",
  },
};

/* ------------------------------------------------------------------ *
 * The three axes
 * ------------------------------------------------------------------ */

/**
 * The three questions an order carries, plus everything that is not an order.
 *
 * `record` is not a fourth question — it is the catch-all for products,
 * suppliers, quotes and jobs, kept here so they use the same five tones rather
 * than growing their own.
 */
export type Axis = "fulfilment" | "delivery" | "payment" | "record";

export type StatusMeaning = {
  tone: Tone;
  /** The word as a person reads it — "Partially paid", not "PartiallyPaid". */
  label: string;
  /** One sentence, for a legend or the title attribute on a pill. */
  meaning: string;
  /**
   * A glyph of this status's own, or "" for none. Left out, the tone's glyph
   * is used, which is the right default and what nearly everything wants.
   *
   * It exists because the payment axis stopped needing it. The glyph is the
   * signal that survives a mono printer and a reader who cannot separate red
   * from green — but it earns that keep only where colour is doing the work
   * alone. On the payment pills the WORD is always there beside it, and once
   * that axis had four distinct colours the tick on "Paid" and the cross on
   * "Unpaid" were saying, twice, what the label already said. The client asked
   * for them off on 24 Aug 2026.
   *
   * Overdue keeps its cross deliberately. It is the one payment state where
   * somebody must act, and it is the one worth being legible on a printed
   * statement that has been through a mono laser.
   */
  glyph?: string;
};

type Table = Record<string, StatusMeaning>;

/**
 * Fulfilment: where the goods are.
 *
 * Covers all three levels that answer that question — the order, the
 * individual line, and the purchase order we raise on a supplier — because
 * they are the same question asked at different distances, and a word like
 * "Cancelled" must not change colour depending on which screen shows it.
 */
const FULFILMENT: Table = {
  // The order as a whole
  Pending: {
    tone: "active",
    label: "Pending",
    meaning: "Received and waiting for the day's buying run at 5pm.",
  },
  Processing: {
    tone: "active",
    label: "Processing",
    meaning: "Being brought in and made up at the sorting facility.",
  },
  Dispatched: {
    tone: "active",
    label: "Dispatched",
    meaning: "Left us and is with the courier.",
  },
  Delivered: {
    tone: "complete",
    label: "Delivered",
    meaning: "Arrived with the customer. Nothing further is owed on the goods.",
  },
  Cancelled: {
    tone: "stopped",
    label: "Cancelled",
    meaning: "Stopped. Nothing will be delivered against it.",
  },

  // A single line. An order is rarely one thing: half of it can ship while one
  // line waits on a supplier, which is the whole reason lines carry their own.
  Allocated: {
    tone: "active",
    label: "Allocated",
    meaning: "Stock is set aside for this line.",
  },
  Picked: {
    tone: "active",
    label: "Picked",
    meaning: "Off the shelf and on the bench.",
  },
  Packed: {
    tone: "active",
    label: "Packed",
    meaning: "Boxed and waiting for the courier.",
  },
  Shipped: {
    tone: "complete",
    label: "Shipped",
    meaning: "This line has gone, whatever the rest of the order is doing.",
  },
  Backordered: {
    tone: "attention",
    label: "Backordered",
    meaning: "No supplier can currently fill this. Somebody must chase it.",
  },

  // The purchase order we place on a supplier
  Draft: {
    tone: "resting",
    label: "Draft",
    meaning: "Written but not sent. The supplier knows nothing about it yet.",
  },
  Sent: {
    tone: "active",
    label: "Sent",
    meaning: "With the supplier, not yet acknowledged.",
  },
  Acknowledged: {
    tone: "active",
    label: "Acknowledged",
    meaning: "The supplier has confirmed they are filling it.",
  },
  PartiallyReceived: {
    tone: "attention",
    label: "Partially received",
    meaning: "Some of it arrived. The shortfall needs chasing.",
  },
  Received: {
    tone: "complete",
    label: "Received",
    meaning: "Everything ordered has arrived at the sorting facility.",
  },
};

/**
 * Delivery: where the parcel is.
 *
 * Deliberately not read from a column — there is no delivery-status field, and
 * inventing one would create a second thing to keep in step with the order
 * status. It is derived instead, by `deliveryStatusOf`, so it cannot disagree
 * with the order it came from.
 */
const DELIVERY: Table = {
  Preparing: {
    tone: "resting",
    label: "Not yet sent",
    meaning: "Still being made up. Nothing has left the building.",
  },
  AwaitingCourier: {
    tone: "active",
    label: "Awaiting courier",
    meaning: "Packed and booked, waiting for collection.",
  },
  InTransit: {
    tone: "active",
    label: "In transit",
    meaning: "With the courier and moving.",
  },
  InTransitUntracked: {
    tone: "attention",
    label: "In transit, untracked",
    meaning:
      "Marked dispatched but carries no courier or tracking number, so " +
      "nobody can tell the customer where it is.",
  },
  ReadyForPickUp: {
    tone: "active",
    label: "Ready for pick-up",
    meaning: "Waiting at the counter for the customer to collect.",
  },
  Delivered: {
    tone: "complete",
    label: "Delivered",
    meaning: "Handed over.",
  },
  Cancelled: {
    tone: "stopped",
    label: "Cancelled",
    meaning: "No delivery will happen.",
  },
};

/**
 * Payment: whether we have the money.
 *
 * Kept wholly apart from the goods, because on credit terms the two are
 * genuinely independent — a Net 30 order ships today and is paid a month
 * later. An order can sit green on delivery and red on payment at the same
 * time, and that pairing is exactly the one somebody needs to see.
 */
/*
 * The colours here were set by the client on 24 Aug 2026, and they settle
 * AC-18. The axis now reads as a temperature rather than a binary: orange
 * while the money is owed, red once it is late, green when it is in, blue
 * when it went back.
 *
 * That is an improvement on the arrangement it replaces. For one day Unpaid
 * was red and Due soon amber, which had the more urgent of the two looking
 * the calmer — and Unpaid shared its red with Overdue, so the state that
 * needs chasing was indistinguishable from the state that does not.
 */
const PAYMENT: Table = {
  Unpaid: {
    // Orange: owed, not late. The distinction Overdue's red now carries alone.
    tone: "attention",
    label: "Unpaid",
    meaning: "The money is not in yet.",
    glyph: "",
  },
  DueSoon: {
    tone: "attention",
    label: "Due soon",
    meaning: "Falls due within the week. Worth a reminder.",
  },
  PartiallyPaid: {
    tone: "attention",
    label: "Part paid",
    meaning: "Some of it has come in. The balance still needs collecting.",
  },
  Paid: {
    tone: "complete",
    label: "Paid",
    meaning: "Settled in full.",
    glyph: "",
  },
  Overdue: {
    // Keeps its cross: the one payment state where somebody must act, and the
    // one that has to stay legible on a mono printout.
    tone: "stopped",
    label: "Overdue",
    meaning: "Past its due date and still owing. Chase it.",
  },
  Refunded: {
    /*
     * Blue. It was grey, which put it with "nothing is happening" when what
     * actually happened is money moving the other way — a thing worth seeing
     * on a statement.
     *
     * No glyph rather than the tone's: blue is the "under way and on track"
     * tone and its arrow would read as a refund still in progress, which is
     * the opposite of what this word means.
     */
    tone: "active",
    label: "Refunded",
    meaning: "The money went back. Nothing is owed either way.",
    glyph: "",
  },
};

/**
 * Everything that is not an order.
 *
 * The three axes above are the system proper — they are the three questions an
 * order carries. But products, suppliers, quotes, enquiries and sent email all
 * have statuses too, and they appear on the same screens in the same pills. If
 * they were left out they would all fall to grey, and the colours would stop
 * meaning anything precisely because most of the pills on a page had none.
 *
 * So the same five tones extend to them, under the same rule: green finished,
 * amber wants a person, red stopped. A supplier is not an order, but
 * "Suspended" is still red for the reason "Cancelled" is.
 */
const RECORD: Table = {
  // Products
  Draft: {
    tone: "resting",
    label: "Draft",
    meaning: "Being written. No buyer can see it.",
  },
  PendingApproval: {
    tone: "attention",
    label: "Pending approval",
    meaning: "Finished and waiting for somebody to approve it.",
  },
  Active: {
    tone: "complete",
    label: "Active",
    meaning: "Live and available.",
  },
  Inactive: {
    tone: "resting",
    label: "Inactive",
    meaning: "Deliberately withdrawn. Not an error.",
  },

  // Suppliers and people
  Suspended: {
    tone: "stopped",
    label: "Suspended",
    meaning: "Trading with them is stopped.",
  },
  Disabled: {
    tone: "stopped",
    label: "Disabled",
    meaning: "This account cannot sign in.",
  },

  // Quotes and enquiries
  New: {
    tone: "attention",
    label: "New",
    meaning: "Nobody has replied to this yet.",
  },
  Quoted: {
    tone: "active",
    label: "Quoted",
    meaning: "A price has gone back. Waiting on the customer.",
  },
  Accepted: {
    tone: "complete",
    label: "Accepted",
    meaning: "The customer took the quote.",
  },
  Declined: {
    tone: "stopped",
    label: "Declined",
    meaning: "The customer said no.",
  },
  Expired: {
    tone: "resting",
    label: "Expired",
    meaning: "It ran out of time. Nothing went wrong.",
  },
  Answered: {
    tone: "complete",
    label: "Answered",
    meaning: "Replied to.",
  },
  Closed: {
    tone: "resting",
    label: "Closed",
    meaning: "Finished with.",
  },

  // Account changes a customer has requested
  Applied: {
    tone: "complete",
    label: "Applied",
    meaning: "The change has been made.",
  },
  Approved: {
    tone: "complete",
    label: "Approved",
    meaning: "Agreed to.",
  },
  Rejected: {
    tone: "stopped",
    label: "Rejected",
    meaning: "Refused. The account is unchanged.",
  },

  // Background jobs and sent email
  Pending: {
    tone: "active",
    label: "Pending",
    meaning: "Queued and waiting its turn.",
  },
  Processing: {
    tone: "active",
    label: "Processing",
    meaning: "Running now.",
  },
  Completed: {
    tone: "complete",
    label: "Completed",
    meaning: "Finished without error.",
  },
  Failed: {
    tone: "stopped",
    label: "Failed",
    meaning: "It did not work. Somebody has to look.",
  },
  Queued: {
    tone: "active",
    label: "Queued",
    meaning: "Accepted for sending, not gone yet.",
  },
  Sent: {
    tone: "complete",
    label: "Sent",
    meaning: "Handed to the mail server.",
  },
  Suppressed: {
    tone: "stopped",
    label: "Suppressed",
    meaning:
      "Deliberately not sent — the address is unusable or sending is off.",
  },
};

const AXES: Record<Axis, Table> = {
  fulfilment: FULFILMENT,
  delivery: DELIVERY,
  payment: PAYMENT,
  record: RECORD,
};

/* ------------------------------------------------------------------ *
 * Reading a status
 * ------------------------------------------------------------------ */

/**
 * A word this module has not been taught about.
 *
 * Grey and shrugging, on purpose. The temptation is to guess a tone from the
 * shape of the word, and a guess is worse than an admission: a new status
 * called "Failed" quietly coloured green is a lie, where an obviously
 * unstyled pill is a prompt to come and map it. The test suite is what stops
 * this ever being reached for a status that really exists.
 */
const UNKNOWN: StatusMeaning = {
  tone: "resting",
  label: "Unknown",
  meaning: "This status has no entry in the colour system yet.",
};

/** "PendingApproval" reads as two words to everyone except a database. */
export function spaceOut(status: string): string {
  return status.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function statusMeaning(axis: Axis, status: string): StatusMeaning {
  const found = AXES[axis][status];
  if (found) return found;
  // Keep the word itself even when the meaning is unknown — a pill reading
  // "Unknown" tells the reader nothing, where one reading "Escheated" at least
  // says what the database holds.
  return { ...UNKNOWN, label: spaceOut(status) || UNKNOWN.label };
}

export function statusTone(axis: Axis, status: string): Tone {
  return statusMeaning(axis, status).tone;
}

/** Whether a status is one this module actually knows. Used by the tests. */
export function isKnownStatus(axis: Axis, status: string): boolean {
  return Object.hasOwn(AXES[axis], status);
}

/** Every status on an axis, in the order a legend should list them. */
export function legend(axis: Axis): (StatusMeaning & { key: string })[] {
  const rank: Record<Tone, number> = {
    resting: 0,
    active: 1,
    attention: 2,
    complete: 3,
    stopped: 4,
  };
  return Object.entries(AXES[axis])
    .map(([key, meaning]) => ({ key, ...meaning }))
    .sort((a, b) => rank[a.tone] - rank[b.tone] || a.label.localeCompare(b.label));
}

/* ------------------------------------------------------------------ *
 * Working out where the parcel is
 * ------------------------------------------------------------------ */

export type DeliveryFacts = {
  /** The order's own status. */
  status: string;
  /** "Delivery" or "PickUp". */
  deliveryType?: string | null;
  courier?: string | null;
  trackingNumber?: string | null;
};

/**
 * The delivery axis, derived rather than stored.
 *
 * The one case worth naming is `InTransitUntracked`: an order marked
 * dispatched with no courier and no tracking number. On the goods it is
 * progress, which is why fulfilment shows it blue — but a customer ringing to
 * ask where their gloves are cannot be told, and that is a person's problem to
 * fix, so delivery shows it amber. The two axes disagreeing there is the
 * system working, not a bug in it.
 */
export function deliveryStatusOf(order: DeliveryFacts): string {
  if (order.status === "Cancelled") return "Cancelled";
  if (order.status === "Delivered") return "Delivered";

  const collecting = order.deliveryType === "PickUp";

  if (order.status === "Dispatched") {
    if (collecting) return "ReadyForPickUp";
    const tracked =
      (order.courier ?? "").trim() !== "" ||
      (order.trackingNumber ?? "").trim() !== "";
    return tracked ? "InTransit" : "InTransitUntracked";
  }

  // Processing means it is being made up. For a pick-up that is still the
  // counter, not the road.
  if (order.status === "Processing") {
    return collecting ? "Preparing" : "AwaitingCourier";
  }

  return "Preparing";
}

/* ------------------------------------------------------------------ *
 * Working out whether the money is late
 * ------------------------------------------------------------------ */

export type PaymentFacts = {
  paymentStatus: string;
  paymentDueOn?: Date | null;
};

/** A week's warning is enough to send a reminder and not so much it is noise. */
export const DUE_SOON_DAYS = 7;

const DAY_MS = 86_400_000;

/**
 * The payment axis, with the passage of time folded in.
 *
 * `paymentStatus` is a stored word and nothing rewrites it at midnight, so an
 * invoice that fell due yesterday still reads "Unpaid" in the database. Left
 * alone it shows resting grey — calm, and wrong. The date decides here instead,
 * which means the screen is right the moment it is looked at without a nightly
 * job existing to be forgotten.
 *
 * A stored "Overdue" is always honoured: if a person has marked it, that
 * judgement outranks the arithmetic.
 */
export function paymentStatusOf(order: PaymentFacts, now: Date): string {
  const stored = order.paymentStatus;
  if (stored === "Paid" || stored === "Refunded" || stored === "Overdue") {
    return stored;
  }

  const due = order.paymentDueOn;
  if (!due) return stored;

  const remaining = due.getTime() - now.getTime();
  if (remaining < 0) return "Overdue";
  if (remaining <= DUE_SOON_DAYS * DAY_MS) {
    // A part-paid invoice already wants a person, and "Due soon" would be a
    // downgrade from that rather than a warning.
    return stored === "PartiallyPaid" ? stored : "DueSoon";
  }
  return stored;
}

/* ------------------------------------------------------------------ *
 * The three at once
 * ------------------------------------------------------------------ */

export type OrderFacts = DeliveryFacts & PaymentFacts;

export type OrderTones = {
  fulfilment: StatusMeaning & { key: string };
  delivery: StatusMeaning & { key: string };
  payment: StatusMeaning & { key: string };
};

/**
 * All three axes for one order, which is how they are nearly always shown:
 * together, so the pairing is visible. Delivered-and-overdue is the row
 * somebody needs to act on, and it only stands out if both are on screen.
 */
export function orderTones(order: OrderFacts, now: Date): OrderTones {
  const delivery = deliveryStatusOf(order);
  const payment = paymentStatusOf(order, now);
  return {
    fulfilment: { key: order.status, ...statusMeaning("fulfilment", order.status) },
    delivery: { key: delivery, ...statusMeaning("delivery", delivery) },
    payment: { key: payment, ...statusMeaning("payment", payment) },
  };
}

/**
 * Whether an order should be pulled out of a list for someone to look at, and
 * why. Amber and red are the two tones that mean a person is needed, so this
 * is the definition of "needs attention" rather than a second opinion about it.
 *
 * WITH ONE EXCEPTION, AND IT IS AN EXCEPTION ON PURPOSE. "Unpaid" is coloured
 * — red on 23 Aug 2026, orange since the 24th — because a customer should see
 * at a glance where their invoice stands. It is not a statement that an
 * invoice with thirty days left to run needs chasing, and the exception has
 * survived both colours precisely because it was never about the colour.
 *
 * Left to the tone alone, this list would have named every open invoice in the
 * business the moment the colour changed, and an action queue that contains
 * everything is one nobody reads. The axis already distinguishes the case that
 * DOES need a person: DueSoon is amber and Overdue is red, and both still come
 * through here. Only the plain not-yet-due Unpaid is let past.
 *
 * The lesson is worth keeping: this queue answers "does somebody have to do
 * something", and that question is not the same as "what colour is the pill",
 * however convenient it was while the two agreed.
 */
export function needsAttention(order: OrderFacts, now: Date): string[] {
  const tones = orderTones(order, now);
  return [tones.fulfilment, tones.delivery, tones.payment]
    .filter((t) => t.tone === "attention" || t.tone === "stopped")
    .filter((t) => t.key !== "Unpaid")
    .map((t) => t.meaning);
}

/**
 * The same payment rules, shaped as a database filter.
 *
 * WHY THIS EXISTS. paymentStatusOf turns a stored word plus a due date into
 * what a person actually sees — Overdue, Due soon — and every screen that
 * shows a pill uses it. The admin orders list could not: it pages and sorts in
 * the database, so filtering in memory afterwards would hand back short pages
 * and wrong counts. It filtered on the stored column instead, and the result
 * was a screen where "Overdue" matched nothing at all while ten invoices sat
 * overdue in front of it, and "Unpaid" quietly included every one of them.
 *
 * So the rules are expressed twice: once as a function, once as a query. That
 * is a real risk — two statements of one rule are two things to keep in step —
 * and the mitigation is that they live side by side and a test drives every
 * combination through both, asserting they agree. If you change one, that test
 * fails until you change the other.
 *
 * Returns a plain object, not a Prisma type: this module stays pure and
 * importable by tests. Prisma reads it as a where clause because a where
 * clause IS a plain object.
 *
 * An empty list means no payment filter, and returns null so the caller can
 * leave the clause out rather than sending a condition matching everything.
 */
/** A where clause, shaped for Prisma without importing it. */
export type PaymentWhere = { OR?: PaymentWhere[] } & Record<string, unknown>;

export function paymentFilterWhere(
  statuses: readonly string[],
  now: Date
  // Deliberately loose: a stricter shape here (unknown[]) collapsed Prisma's
  // inference at the call site and the query result lost every relation it
  // includes. This module must not import Prisma, so the type stays open and
  // the query keeps its own.
): PaymentWhere | null {
  if (statuses.length === 0) return null;

  const soon = new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS);

  // A stored word that is never reinterpreted: Paid stays Paid whatever the
  // date says.
  const asStored = (value: string) => ({ paymentStatus: value });

  const clauses: PaymentWhere[] = [];

  for (const status of statuses) {
    switch (status) {
      case "Paid":
      case "Refunded":
        clauses.push(asStored(status));
        break;

      /* Past its date, or marked overdue by a person. Both Unpaid and
         PartiallyPaid fall in here once the date passes — a part payment does
         not stop the balance being late. */
      case "Overdue":
        clauses.push({
          OR: [
            asStored("Overdue"),
            {
              paymentStatus: { in: ["Unpaid", "PartiallyPaid"] },
              paymentDueOn: { not: null, lt: now },
            },
          ],
        });
        break;

      /* Within the week and not yet past. PartiallyPaid is deliberately absent:
         paymentStatusOf keeps it as Part paid, because "Due soon" would be a
         downgrade from a state that already wants a person. */
      case "DueSoon":
        clauses.push({
          paymentStatus: "Unpaid",
          paymentDueOn: { not: null, gte: now, lte: soon },
        });
        break;

      /* Nothing due yet, or due far enough out to be nobody's problem. */
      case "Unpaid":
        clauses.push({
          paymentStatus: "Unpaid",
          OR: [{ paymentDueOn: null }, { paymentDueOn: { gt: soon } }],
        });
        break;

      case "PartiallyPaid":
        clauses.push({
          paymentStatus: "PartiallyPaid",
          OR: [{ paymentDueOn: null }, { paymentDueOn: { gte: now } }],
        });
        break;

      default:
        // An unknown word matches nothing rather than everything. A filter
        // that silently widens is worse than one that returns nothing.
        clauses.push({ id: "__no_such_order__" });
    }
  }

  return { OR: clauses };
}
