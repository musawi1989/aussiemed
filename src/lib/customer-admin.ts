import "server-only";

import { db } from "./db";
import { audit, requireAdmin, type Result } from "./admin";
import { summarise } from "./account-change-plan";
import { isPaymentTerms } from "./payment-options";
import { checkDiscount, checkAgreedPrice } from "./customer-terms";

/**
 * What an admin can change about a customer account beyond its own details.
 *
 * Four things, all requested by the client on 24 Aug 2026: an account-wide
 * discount, prices agreed for particular items, the branches they order to,
 * and the people who order.
 *
 * ⚠ AN ADMIN ACTS DIRECTLY; A CUSTOMER ASKS. account.ts has the customer's own
 * versions of the branch and staff changes, and those go through submitChange
 * into an approval queue — because somebody has to agree to them. An admin IS
 * that somebody, so putting their own edits in a queue for themselves would be
 * a queue nobody works. Everything here applies immediately.
 *
 * IT STILL LANDS ON THE CUSTOMER'S OWN CHANGE LOG, as Applied. Their log
 * answers "what has changed on this account and who did it", and a branch that
 * appears with no entry makes that log a half-truth — the same reasoning as
 * the rename in updateOrganisation. Recorded under the admin's name so it
 * never reads as something the customer did.
 */

const fail = (error: string): Result<never> => ({ ok: false, error });
const done = (): Result => ({ ok: true, value: undefined });

/** Confirms the account exists, and gives back what the log entries need. */
async function accountOrFail(organisationId: string) {
  return db.organisation.findUnique({
    where: { id: organisationId },
    select: {
      id: true,
      name: true,
      discountBasisPoints: true,
      paymentTerms: true,
    },
  });
}

/**
 * One log entry on the customer's timeline, plus the audit row.
 *
 * Both, always. The audit trail is ours and records every field; the change
 * log is theirs and records what they would notice. Writing one without the
 * other is how the two stop agreeing.
 */
async function record(
  actor: Awaited<ReturnType<typeof requireAdmin>>,
  organisationId: string,
  kind: Parameters<typeof summarise>[0],
  subject: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  await db.accountChange.create({
    data: {
      organisationId,
      kind,
      summary: summarise(kind, subject),
      // Not a reason and deliberately does not read like one — nobody typed
      // one. See the note on updateOrganisation.
      reason: `Changed by ${actor.name ?? "an administrator"} at AussieMed.`,
      status: "Applied",
      targetId: organisationId,
      requestedByUserId: actor.id,
      requestedByName: actor.name ?? "AussieMed",
    },
  });

  await audit(actor, action, "Organisation", organisationId, before, after);
}

/* ------------------------------------------------------------------ *
 * Commercial terms — discount and payment terms
 * ------------------------------------------------------------------ */

/**
 * The account-wide discount, and the payment terms it trades on.
 *
 * Together in one call because they are one conversation: an account is
 * offered a discount and terms at the same meeting, and saving half of it is
 * how the two end up disagreeing with what was agreed.
 *
 * ⚠ CREDIT LIMIT IS STILL DELIBERATELY ABSENT — AC-09. The client asked for
 * terms, not for a limit, and a limit entered before the policy exists is a
 * figure that gets believed. Do not add one without asking.
 */
export async function setAccountTerms(
  organisationId: string,
  input: { discountPercent: string; paymentTerms: string },
): Promise<Result> {
  const actor = await requireAdmin("customers");

  const account = await accountOrFail(organisationId);
  if (!account) return fail("That account no longer exists.");

  const discount = checkDiscount(input.discountPercent);
  if (!discount.ok) return fail(discount.error);

  if (!isPaymentTerms(input.paymentTerms)) {
    return fail("That is not a payment term we recognise.");
  }

  const before = {
    discountBasisPoints: account.discountBasisPoints,
    paymentTerms: account.paymentTerms,
  };
  const after = {
    discountBasisPoints: discount.basisPoints,
    paymentTerms: input.paymentTerms,
  };

  if (
    before.discountBasisPoints === after.discountBasisPoints &&
    before.paymentTerms === after.paymentTerms
  ) {
    return fail("Nothing was changed.");
  }

  await db.organisation.update({ where: { id: organisationId }, data: after });

  /*
   * Audited, but NOT on the customer's change log.
   *
   * Their log is a list of things they asked for or would recognise happening
   * — a branch, a person, the account name. Terms are a commercial
   * arrangement, and the place a customer learns theirs is the order they
   * place, not a timeline entry. The audit trail carries it either way.
   */
  await audit(
    actor,
    "organisation.terms",
    "Organisation",
    organisationId,
    before,
    after,
  );

  return done();
}

/* ------------------------------------------------------------------ *
 * Agreed prices
 * ------------------------------------------------------------------ */

export type AgreedPriceRow = {
  id: string;
  skuId: string;
  skuCode: string;
  productName: string;
  unitLabel: string;
  /** What everyone else pays, so the two figures can be read together. */
  listPriceFils: number;
  priceFils: number;
  note: string | null;
};

/** What this account has agreed, dearest saving first — see the sort note. */
export async function agreedPrices(
  organisationId: string,
): Promise<AgreedPriceRow[]> {
  await requireAdmin("customers", "view");

  const rows = await db.customerPrice.findMany({
    where: { organisationId },
    include: {
      sku: {
        select: {
          id: true,
          skuCode: true,
          unitLabel: true,
          priceFils: true,
          product: { select: { name: true } },
        },
      },
    },
  });

  return (
    rows
      .map((row) => ({
        id: row.id,
        skuId: row.skuId,
        skuCode: row.sku.skuCode,
        productName: row.sku.product.name,
        unitLabel: row.sku.unitLabel,
        listPriceFils: row.sku.priceFils,
        priceFils: row.priceFils,
        note: row.note,
      }))
      // By product name: this is a list somebody reads down looking for an item,
      // not a report. Sorting by size of saving would put the same item in a
      // different place every time list moved.
      .sort((a, b) => a.productName.localeCompare(b.productName))
  );
}

/**
 * Agree a price for one SKU, or change one already agreed.
 *
 * An upsert rather than separate add and edit: the unique constraint makes
 * "already agreed" the normal case, and a form that refused it would send
 * somebody hunting for a row to delete first.
 */
export async function setAgreedPrice(
  organisationId: string,
  input: { skuCode: string; price: string; note: string },
): Promise<Result> {
  const actor = await requireAdmin("customers");

  const account = await accountOrFail(organisationId);
  if (!account) return fail("That account no longer exists.");

  const skuCode = input.skuCode.trim();
  if (!skuCode) return fail("Which item is this price for?");

  const sku = await db.productSku.findUnique({
    where: { skuCode },
    select: { id: true, priceFils: true, product: { select: { name: true } } },
  });
  if (!sku) return fail(`No item has the code "${skuCode}".`);

  const price = checkAgreedPrice(input.price);
  if (!price.ok) return fail(price.error);

  const existing = await db.customerPrice.findFirst({
    where: { organisationId, skuId: sku.id },
    select: { id: true, priceFils: true },
  });

  const note = input.note.trim() || null;

  await db.customerPrice.upsert({
    where: { organisationId_skuId: { organisationId, skuId: sku.id } },
    update: { priceFils: price.fils, note },
    create: {
      organisation: { connect: { id: organisationId } },
      sku: { connect: { id: sku.id } },
      priceFils: price.fils,
      note,
    },
  });

  await audit(
    actor,
    existing ? "customerPrice.update" : "customerPrice.create",
    "Organisation",
    organisationId,
    existing ? { skuCode, priceFils: existing.priceFils } : null,
    {
      skuCode,
      product: sku.product.name,
      priceFils: price.fils,
      listPriceFils: sku.priceFils,
      note,
    },
  );

  return done();
}

/** Drop an agreed price. The account goes back to list, and to its discount. */
export async function removeAgreedPrice(
  organisationId: string,
  priceId: string,
): Promise<Result> {
  const actor = await requireAdmin("customers");

  // Scoped to this account rather than looked up by id alone: an id posted
  // from elsewhere must not delete another account's arrangement.
  const row = await db.customerPrice.findFirst({
    where: { id: priceId, organisationId },
    select: { id: true, priceFils: true, sku: { select: { skuCode: true } } },
  });
  if (!row) return fail("That agreed price is no longer there.");

  await db.customerPrice.delete({ where: { id: row.id } });

  await audit(
    actor,
    "customerPrice.remove",
    "Organisation",
    organisationId,
    { skuCode: row.sku.skuCode, priceFils: row.priceFils },
    null,
  );

  return done();
}

/* ------------------------------------------------------------------ *
 * Branches
 * ------------------------------------------------------------------ */

export type BranchInput = {
  label: string;
  contact: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  emirate: string;
  countryCode: string;
  country: string;
};

/** Everything a delivery needs. A half-filled address is a failed delivery. */
function validateBranch(input: BranchInput): string | null {
  if (!input.contact.trim()) return "Who should the driver ask for?";
  if (!input.phone.trim()) return "A phone number is needed for the delivery.";
  if (!input.line1.trim()) return "The first line of the address is needed.";
  if (!input.city.trim()) return "Which city is this branch in?";
  if (!input.emirate.trim())
    return "Which emirate or region is this branch in?";
  return null;
}

const branchData = (input: BranchInput) => ({
  label: input.label.trim() || null,
  contact: input.contact.trim(),
  phone: input.phone.trim(),
  line1: input.line1.trim(),
  line2: input.line2.trim() || null,
  city: input.city.trim(),
  emirate: input.emirate.trim(),
  countryCode: input.countryCode.trim() || "AE",
  country: input.country.trim() || "United Arab Emirates",
});

export async function addBranch(
  organisationId: string,
  input: BranchInput,
): Promise<Result> {
  const actor = await requireAdmin("customers");

  const account = await accountOrFail(organisationId);
  if (!account) return fail("That account no longer exists.");

  const problem = validateBranch(input);
  if (problem) return fail(problem);

  const data = branchData(input);

  // The first branch on an account becomes its default, because an account
  // with addresses and no default makes every checkout ask a question that
  // has only one possible answer.
  const count = await db.address.count({
    where: { organisationId, isArchived: false },
  });

  const created = await db.address.create({
    data: {
      ...data,
      organisation: { connect: { id: organisationId } },
      isDefault: count === 0,
    },
    select: { id: true },
  });

  await record(
    actor,
    organisationId,
    "BranchAdded",
    data.label ?? data.city,
    "address.create",
    null,
    { id: created.id, ...data },
  );

  return done();
}

export async function editBranch(
  organisationId: string,
  branchId: string,
  input: BranchInput,
): Promise<Result> {
  const actor = await requireAdmin("customers");

  const existing = await db.address.findFirst({
    where: { id: branchId, organisationId },
  });
  if (!existing) return fail("That branch is no longer there.");

  const problem = validateBranch(input);
  if (problem) return fail(problem);

  const data = branchData(input);
  await db.address.update({ where: { id: existing.id }, data });

  await record(
    actor,
    organisationId,
    "BranchEdited",
    data.label ?? data.city,
    "address.update",
    {
      label: existing.label,
      contact: existing.contact,
      phone: existing.phone,
      line1: existing.line1,
      line2: existing.line2,
      city: existing.city,
      emirate: existing.emirate,
    },
    data,
  );

  return done();
}

/**
 * Take a branch off the list.
 *
 * ARCHIVED, NEVER DELETED. Orders already delivered there still name it, and
 * a branch that closes must not blank its own history — the same rule the
 * customer's own removal follows, and the reason Address carries isArchived.
 *
 * The people who order for it come off the list too. Leaving them pointing at
 * a branch nobody can pick would leave a person who cannot be assigned an
 * order, which reads as a fault rather than a closed site.
 */
export async function removeBranch(
  organisationId: string,
  branchId: string,
): Promise<Result> {
  const actor = await requireAdmin("customers");

  const branch = await db.address.findFirst({
    where: { id: branchId, organisationId, isArchived: false },
    select: { id: true, label: true, city: true, isDefault: true },
  });
  if (!branch) return fail("That branch is no longer there.");

  const remaining = await db.address.count({
    where: { organisationId, isArchived: false, NOT: { id: branch.id } },
  });
  if (remaining === 0) {
    return fail(
      "This is the only branch on the account. Add another before removing this one, or the account has nowhere to deliver to.",
    );
  }

  await db.$transaction(async (tx) => {
    await tx.address.update({
      where: { id: branch.id },
      data: { isArchived: true, isDefault: false },
    });

    await tx.organisationStaff.updateMany({
      where: { organisationId, addressId: branch.id },
      data: { isActive: false },
    });

    // The default has to land somewhere, or checkout has no answer.
    if (branch.isDefault) {
      const next = await tx.address.findFirst({
        where: { organisationId, isArchived: false },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (next) {
        await tx.address.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
  });

  await record(
    actor,
    organisationId,
    "BranchRemoved",
    branch.label ?? branch.city,
    "address.archive",
    { id: branch.id, label: branch.label, city: branch.city },
    null,
  );

  return done();
}

/* ------------------------------------------------------------------ *
 * People who order
 * ------------------------------------------------------------------ */

export async function addPerson(
  organisationId: string,
  input: { name: string; addressId: string },
): Promise<Result> {
  const actor = await requireAdmin("customers");

  const name = input.name.trim();
  if (!name) return fail("A name is needed.");

  // Checked against this account's own branches rather than trusted, the same
  // rule the customer's own form follows: an id posted from elsewhere would
  // otherwise attach one account's person to another's site.
  const branch = await db.address.findFirst({
    where: { id: input.addressId, organisationId, isArchived: false },
    select: { id: true, label: true, city: true },
  });
  if (!branch) return fail("Choose which branch they order for.");

  const existing = await db.organisationStaff.findFirst({
    where: { organisationId, name },
    select: { id: true, isActive: true },
  });
  if (existing?.isActive) return fail(`${name} is already on the list.`);

  if (existing) {
    // Re-adding somebody who was removed brings them back, rather than
    // failing on a unique constraint the person on screen cannot see.
    await db.organisationStaff.update({
      where: { id: existing.id },
      data: { isActive: true, addressId: branch.id },
    });
  } else {
    await db.organisationStaff.create({
      data: {
        organisation: { connect: { id: organisationId } },
        name,
        address: { connect: { id: branch.id } },
      },
    });
  }

  await record(
    actor,
    organisationId,
    "StaffAdded",
    `${name} (${branch.label ?? branch.city})`,
    "staff.add",
    null,
    { name, branch: branch.label ?? branch.city },
  );

  return done();
}

/** Move somebody to another branch, or correct their name. */
export async function editPerson(
  organisationId: string,
  personId: string,
  input: { name: string; addressId: string },
): Promise<Result> {
  const actor = await requireAdmin("customers");

  const person = await db.organisationStaff.findFirst({
    where: { id: personId, organisationId },
    select: { id: true, name: true, addressId: true },
  });
  if (!person) return fail("That person is no longer on the list.");

  const name = input.name.trim();
  if (!name) return fail("A name is needed.");

  const branch = await db.address.findFirst({
    where: { id: input.addressId, organisationId, isArchived: false },
    select: { id: true, label: true, city: true },
  });
  if (!branch) return fail("Choose which branch they order for.");

  const clash = await db.organisationStaff.findFirst({
    where: { organisationId, name, NOT: { id: person.id } },
    select: { id: true },
  });
  if (clash) return fail(`Somebody called ${name} is already on the list.`);

  await db.organisationStaff.update({
    where: { id: person.id },
    data: { name, addressId: branch.id },
  });

  /*
   * Their name is NOT rewritten on orders they have already placed.
   *
   * Every order snapshots the name of whoever placed it, exactly so that a
   * correction here cannot rewrite history. An order placed by "Dr Moe" still
   * says so after the spelling is fixed, which is the same rule every other
   * snapshot on an order follows.
   */
  await record(
    actor,
    organisationId,
    "StaffAdded",
    `${name} (${branch.label ?? branch.city})`,
    "staff.update",
    { name: person.name, addressId: person.addressId },
    { name, addressId: branch.id },
  );

  return done();
}

/**
 * Take somebody off the list.
 *
 * Deactivated, not deleted, for the same reason a branch is archived: the
 * orders they placed name them, and somebody leaving must not blank their own
 * work. They stop appearing in the picker.
 */
export async function removePerson(
  organisationId: string,
  personId: string,
): Promise<Result> {
  const actor = await requireAdmin("customers");

  const person = await db.organisationStaff.findFirst({
    where: { id: personId, organisationId, isActive: true },
    select: { id: true, name: true },
  });
  if (!person) return fail("That person is no longer on the list.");

  await db.organisationStaff.update({
    where: { id: person.id },
    data: { isActive: false },
  });

  await record(
    actor,
    organisationId,
    "StaffRemoved",
    person.name,
    "staff.remove",
    { name: person.name },
    null,
  );

  return done();
}
