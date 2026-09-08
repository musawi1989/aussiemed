/**
 * Turning an audit entry into something a person can read.
 *
 * Pure, and its own module, because the trail is the one screen whose whole
 * worth is being understood in a hurry — usually by somebody trying to find out
 * what went wrong. It was showing raw material: an action of `supply.assign`, an
 * entity of `ProductMaster`, and a change rendered as `tiers: [object Object] →
 * [object Object]`. All of that is technically the truth and none of it answers
 * "what did somebody do to this price".
 *
 * Nothing here reaches the database, so every awkward shape a `before`/`after`
 * blob can take — a bare array, a null, a date, a string of JSON that is really
 * a number — can be written down as a test.
 */

/* ------------------------------------------------------------------ *
 * What kind of thing was changed
 * ------------------------------------------------------------------ */

export const ENTITY_LABELS: Record<string, string> = {
  ProductMaster: "Product",
  ProductSku: "Pack",
  ProductSupply: "Supply arrangement",
  ProductOption: "Product option",
  Supplier: "Supplier",
  Category: "Category",
  Order: "Order",
  OrderItem: "Order line",
  PurchaseOrder: "Purchase order",
  Organisation: "Account",
  AccountChange: "Account change",
  Setting: "Setting",
  Courier: "Courier",
  SavedEmailTemplate: "Email template",
  BulkUploadJob: "Catalogue upload",
  Enquiry: "Enquiry",
  QuoteRequest: "Quote request",
  User: "User",
  Composed: "Email",
};

export function entityLabel(entity: string): string {
  return ENTITY_LABELS[entity] ?? entity;
}

/* ------------------------------------------------------------------ *
 * What was done
 * ------------------------------------------------------------------ */

/**
 * The action strings are dotted keys written by whoever added the feature —
 * `sku.tiers`, `supply.demote.outOfStock`, `order.shipment.create`. They are
 * good keys and bad sentences.
 *
 * A LOOKUP FIRST, A DERIVED SENTENCE SECOND. New actions appear every time
 * somebody adds a screen, and a trail that showed nothing for an unknown key
 * would quietly hide the newest changes — the ones most worth watching. So an
 * unrecognised key is turned into readable words rather than dropped.
 */
const ACTION_LABELS: Record<string, string> = {
  "sku.create": "Added a pack",
  "sku.update": "Edited a pack",
  "sku.delete": "Removed a pack",
  "sku.tiers": "Changed the price breaks",
  "sku.options": "Changed which options a pack has",
  "product.create": "Created a product",
  "product.update": "Edited a product",
  "product.image.add": "Added an image",
  "product.image.remove": "Removed an image",
  "product.image.primary": "Changed the main image",
  "product.document.add": "Attached a document",
  "product.document.remove": "Removed a document",
  "productOption.add": "Added an option",
  "productOptionValue.add": "Added an option value",
  "productOptionValue.remove": "Removed an option value",
  "supply.assign": "Assigned a supplier to a pack",
  "supply.swap": "Swapped which supplier covers a pack",
  "supply.update": "Changed a supply arrangement",
  "supply.adminAdd": "Added a pack to a supplier's list",
  "supply.remove": "Took a pack off a supplier's list",
  "supply.demote.outOfStock": "Demoted a supplier who said they were out of stock",
  "supplier.update": "Edited a supplier",
  "supplier.availability": "Changed what a supplier can supply",
  "supplierPrice.propose": "A supplier asked for a new cost",
  "supplierPrice.approve": "Agreed a supplier's new cost",
  "supplierPrice.reject": "Refused a supplier's new cost",
  "customerPrice.create": "Agreed a price with an account",
  "customerPrice.remove": "Removed an agreed price",
  "order.status": "Moved the order on",
  "order.payment": "Recorded a payment",
  "order.delivery": "Changed the delivery details",
  "order.notes": "Wrote an internal note",
  "order.shipment.create": "Made a packing list",
  "order.shipment.tracking": "Set the tracking on a shipment",
  "order.shipment.delete": "Removed a packing list",
  "orderLine.status": "Changed a line's fulfilment",
  "orderLine.batch": "Recorded a batch and expiry",
  "purchaseOrder.build": "Built the day's buying run",
  "purchaseOrder.send": "Sent a purchase order",
  "purchaseOrder.acknowledge": "A supplier acknowledged an order",
  "purchaseOrder.dispatch": "A supplier despatched an order",
  "purchaseOrder.receive": "Booked goods in",
  "purchaseOrder.payment": "Recorded what we paid a supplier",
  "purchaseOrder.cancel": "Cancelled a draft purchase order",
  "purchasing.autoSend": "Changed whether buying runs send themselves",
  "purchasing.cutoffHour": "Moved the daily cutoff",
  "category.create": "Created a category",
  "category.update": "Edited a category",
  "category.delete": "Removed a category",
  "courier.create": "Added a courier",
  "courier.archive": "Retired a courier",
  "deliveryReceipt.add": "Uploaded a signed delivery receipt",
  "deliveryReceipt.remove": "Removed a delivery receipt",
  "trnDocument.upload": "Uploaded a TRN certificate",
  "organisation.create": "Created an account",
  "organisation.update": "Edited an account",
  "enquiry.reply": "Answered a bulk-buy enquiry",
  "enquiry.reply.edit": "Edited an answer to an enquiry",
  "quote.reply": "Answered a quote request",
  "quote.reply.edit": "Edited a quote answer",
  "template.create": "Wrote an email template",
  "template.update": "Edited an email template",
  "template.delete": "Deleted an email template",
  "permissions.set": "Changed what a role can do",
  "permissions.reset": "Put permissions back to their defaults",
  AccountChangeApproved: "Approved an account change",
  AccountChangeRejected: "Refused an account change",
};

/** Splits camelCase and dotted keys into words, e.g. "orderLine.status". */
function humanise(action: string): string {
  const words = action
    .split(".")
    .flatMap((part) => part.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(" "))
    .filter(Boolean)
    .map((w) => w.toLowerCase());

  if (words.length === 0) return action;
  return words[0][0].toUpperCase() + words[0].slice(1) + " " + words.slice(1).join(" ");
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? humanise(action).trim();
}

/**
 * The broad area an action belongs to, for the filter.
 *
 * Taken from the part of the key before the first dot, because that is how the
 * keys were already written — the grouping exists in the data and only needed
 * naming. Anything without a dot is its own area rather than being swept into
 * an "other" bucket nobody would think to open.
 */
export const AREA_LABELS: Record<string, string> = {
  sku: "Packs",
  product: "Products",
  // Two prefixes, two labels. They were both "Product options", which put the
  // same words on two entries of a dropdown — the reader has to pick one and
  // has no way to tell which. Adding an option (Size) and adding a value to it
  // (Large) are genuinely different acts, so they are named differently.
  productOption: "Product options",
  productOptionValue: "Option values",
  supply: "Supply cover",
  supplier: "Suppliers",
  supplierPrice: "Supplier prices",
  customerPrice: "Agreed prices",
  order: "Orders",
  orderLine: "Order lines",
  purchaseOrder: "Purchase orders",
  purchasing: "Buying runs",
  category: "Categories",
  courier: "Couriers",
  deliveryReceipt: "Delivery receipts",
  trnDocument: "TRN certificates",
  organisation: "Accounts",
  enquiry: "Enquiries",
  quote: "Quote requests",
  template: "Email templates",
  permissions: "Permissions",
};

export function areaOf(action: string): string {
  return action.includes(".") ? action.slice(0, action.indexOf(".")) : action;
}

export function areaLabel(action: string): string {
  const area = areaOf(action);
  return AREA_LABELS[area] ?? humanise(area).trim();
}

/* ------------------------------------------------------------------ *
 * What actually changed
 * ------------------------------------------------------------------ */

export type FieldChange = {
  field: string;
  from: string;
  to: string;
  /** Nothing was there before — an addition rather than an edit. */
  added: boolean;
  /** Nothing is there now. */
  removed: boolean;
};

const FIELD_LABELS: Record<string, string> = {
  priceFils: "Price",
  costFils: "Cost",
  proposedCostFils: "Cost asked for",
  unitPriceFils: "Unit price",
  lineCostFils: "Line cost",
  totalCostFils: "Total cost",
  totalFils: "Total",
  paidFils: "Paid",
  qty: "Quantity",
  qtyOrdered: "Ordered",
  qtyConfirmed: "Confirmed",
  qtyReceived: "Received",
  minQty: "From quantity",
  skuCode: "Item code",
  unitLabel: "Unit",
  manualOutOfStock: "Marked out of stock",
  isActive: "Active",
  status: "Status",
  paymentStatus: "Payment",
  trackingNumber: "Tracking number",
  replyToCustomer: "Reply to the customer",
  internalNotes: "Internal note",
  leadTimeDays: "Lead time (days)",
  rank: "Cover slot",
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? humanise(field).trim();
}

/**
 * Money is stored in fils and shown in fils by a naive renderer, so a price
 * change read "priceFils: 1857 → 1640" — right, and two mental steps away from
 * the number anybody actually thinks in.
 *
 * Applied by field name rather than by guessing at the value, because 1857 is
 * a perfectly ordinary quantity as well as a perfectly ordinary price.
 */
const MONEY_FIELDS = new Set([
  "priceFils",
  "costFils",
  "proposedCostFils",
  "unitPriceFils",
  "lineCostFils",
  "totalCostFils",
  "totalFils",
  "paidFils",
  "subtotalFils",
  "vatFils",
  "lineTotalFils",
  "deliveryPriceFils",
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** One value, as a person would read it. */
export function showValue(field: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";

  if (typeof value === "number" && MONEY_FIELDS.has(field)) {
    return `AED ${(value / 100).toFixed(2)}`;
  }

  if (typeof value === "string") {
    // Dates arrive as ISO strings because the blob went through JSON. Only the
    // day is shown: a timestamp to the millisecond in a diff is noise, and the
    // entry already carries its own time.
    if (ISO_DATE.test(value)) return value.slice(0, 10);
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "none";
    // A list of rows — price breaks, shipment lines — summarised rather than
    // dumped. The old renderer produced a wall of JSON that people scrolled
    // past, which is the same as recording nothing.
    return value
      .map((row) =>
        row !== null && typeof row === "object"
          ? Object.entries(row as Record<string, unknown>)
              .map(([k, v]) => `${fieldLabel(k).toLowerCase()} ${showValue(k, v)}`)
              .join(", ")
          : String(row)
      )
      .map((line) => `• ${line}`)
      .join("\n");
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${fieldLabel(k).toLowerCase()} ${showValue(k, v)}`)
      .join(", ");
  }

  return String(value);
}

function parseBlob(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null) return {};
    // A bare array or scalar was recorded — some callers pass the whole thing
    // rather than a field map. Given one name so it can still be rendered.
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { value: parsed };
  } catch {
    return { value: raw };
  }
}

/**
 * The fields that actually differ, before and after.
 *
 * ONLY WHAT MOVED. An entry that recorded twelve fields and changed one used to
 * print all twelve, eleven of them reading "x → x", and the eye slid off the
 * only line that mattered. Where a caller recorded just one side — a creation
 * has no before, a deletion has no after — everything present is shown, because
 * then all of it is the change.
 */
export function describeChange(
  before: string | null,
  after: string | null
): FieldChange[] {
  const b = parseBlob(before);
  const a = parseBlob(after);

  const fields = [...new Set([...Object.keys(b), ...Object.keys(a)])];

  return fields
    .map((field) => {
      const from = showValue(field, b[field]);
      const to = showValue(field, a[field]);
      return {
        field: fieldLabel(field),
        from,
        to,
        added: from === "—" && to !== "—",
        removed: to === "—" && from !== "—",
      };
    })
    .filter((change) => change.from !== change.to);
}
