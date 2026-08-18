/**
 * Adding categories the tree does not have, from a named source.
 *
 * This replaces seed-category-gaps.ts, which did the same job for one source.
 * Two scripts doing this would be two copies of the same upsert logic, and the
 * second one to be written is always the one that quietly stops matching how
 * the first behaves.
 *
 * SAFE TO RE-RUN. Nothing is created that already exists by name under the same
 * parent, and nothing is ever removed. Since 18 Aug the database owns the
 * taxonomy (DA-37) — the catalogue seed no longer recreates or renames
 * categories — so this script and the admin screens are the only ways the tree
 * changes.
 *
 * Run with: npm run db:seed:categories
 */

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

type Group = {
  /** The department these belong under, by the name OUR tree uses. */
  department: string;
  children: string[];
};

type Source = {
  label: string;
  note: string;
  groups: Group[];
};

/* ------------------------------------------------------------------ *
 * Source 1 — livingstone.com.au, read 17 Aug 2026
 *
 * Diffed against the database rather than added wholesale, so the count only
 * moved by what was genuinely missing. Our department names were shortened at
 * import — "Dental" for "Dental Supplies", "Laboratory" for "Laboratory
 * Science" — and renaming them now would change URLs that already work for the
 * sake of matching somebody else's wording.
 *
 * THREE KINDS OF THING WERE DELIBERATELY LEFT OUT. Brand shelves ("Heine
 * Products", "Welch Allyn Products") are merchandising, not a way of describing
 * goods, and AussieMed has a Brand field. "First Nation Office Supplies" is an
 * Australian procurement classification with no meaning to a UAE buyer. "New
 * Waxing Range" is a promotion with a date on it, and Hair Removal covers the
 * goods.
 * ------------------------------------------------------------------ */

const LIVINGSTONE: Source = {
  label: "livingstone.com.au",
  note: "read 17 Aug 2026",
  groups: [
    {
      department: "Medical Consumables",
      children: [
        "Sterilisation", "Monitoring & Testing", "Kits",
        "Gels, Lubrication & Creams", "Respiratory Management", "Rehabilitation",
        "Nutrition", "Bed & Accessories", "Needles & Accessories",
        "Applicators & Swabs", "Medicine & Accessories", "Bags & Accessories",
        "Syringes & Accessories", "Furniture", "Incontinence Care",
        "Catheters & Accessories", "Dispensers", "Tubes", "Trolleys",
        "Intravenous & Infusion Therapy",
      ],
    },
    {
      department: "Wound Care, First Aid & Safety",
      children: [
        "Respiratory Management", "Medicine", "Clips & Fasteners",
        "Burn Treatment", "Emergency & Rescue", "Wound Care", "Antiseptics",
        "First Aid", "Workplace Safety", "Skin Protection",
        "First Aid Kits & Accessories",
      ],
    },
    {
      department: "Kitchen",
      children: [
        "Food Supplies", "Cups & Accessories", "Beverages & Accessories", "Bags",
        "Food Containers", "Cutlery & Plates",
      ],
    },
    {
      department: "Laboratory",
      children: [
        "Charts and Models", "Glassware", "Lab Safety", "Laboratory Chemicals",
        "Laboratory Consumables", "Laboratory Equipment and Apparatus",
        "Heating mantle", "Labware", "Plasticware",
      ],
    },
    {
      department: "Protective Wear PPE",
      children: [
        "Face Protection", "Foot Protection", "Body Protection",
        "Hand Protection", "Head Protection", "PPE Dispensers",
      ],
    },
    {
      department: "Beauty, Skin & Personal Care",
      children: [
        "Podiatry", "Nail Care", "Undergarments", "Makeup Supplies",
        "Barber Supplies", "Sexual Health", "Amenities", "Beauty", "Baby Care",
        "Tanning", "Hair Care", "Cotton Products", "Oral Care", "Hair Removal",
        "Skin Care", "Barber/Hairdressing Supplies", "Eye Care", "Body Care",
        "Personal Hygiene", "Feminine Hygiene", "Grooming",
      ],
    },
    {
      department: "Instruments & Diagnostics",
      children: [
        "Scissors", "Blades & Accessories", "Blood Collection", "Pessary Rings",
        "Biopsy Punches", "Podiatry", "Medical Equipment", "Clamps",
        "Diagnostics & Accessories", "Aerosol Masks", "Hollow Ware",
        "Monitoring & Testing", "Medical Instruments", "Forceps", "Sutures",
        "I.V Administration", "Environment Control",
      ],
    },
    {
      // Piercing Supplies had been filed under Beauty, where a buyer would
      // never look for it.
      department: "Tattoo & Piercing",
      children: ["Tattoo Supplies", "Piercing Supplies"],
    },
    {
      department: "Dental",
      children: [
        "Dental Bibs & Chains", "Finishing & Polishing", "Waxes", "Evacuation",
        "Storage", "Rubber Dams & Accessories", "Stone & Plaster", "Articulating",
        "Acrylic & Reline", "Teeth", "Impression Materials",
        "Mouthguards & Splints", "Restorative & Cosmetic", "Autoclave", "Prophy",
        "Burs & Accessories", "Endodontics", "Preventive Oral Care",
        "Instruments & Equipment", "Crown & Bridge",
      ],
    },
    {
      department: "Cleaning & Hygiene",
      children: [
        "Hand Hygiene", "Cleaning Supplies", "Cleaning Towels", "Tissues",
        "Wipers & Cleaners", "Swabs & Wipes", "Waste Disposal", "Bottle Brushes",
        "Scrubs, Sponges & Brushes", "Dispensers", "Mops, Brooms & Buckets",
        "Accessories", "Cleaning Chemicals", "Toilet Essentials", "Bags",
        "Skin Care", "Tapes & Adhesives",
      ],
    },
    {
      department: "Office & Stationery Supplies",
      children: [
        "Arts & Crafts", "Binding & Laminating", "Books & Notepads",
        "Desk Supplies", "Envelopes & Labels", "Filing & Storage",
        "Ink & Accessories", "Office Accessories", "Packaging Supplies",
        "Paper Supplies", "Pen, Pencils & Markers", "Stamps & Accessories",
        "Teaching Aid & Charts", "Whiteboard, Corkboards & Accessories",
      ],
    },
    {
      // Their tree has a "Pet Care" shelf inside the Pet Care department. A
      // category named after the department it sits in tells a buyer nothing.
      department: "Pet Care",
      children: [
        "Grooming", "Pet Toys", "Medicine & Antiseptics",
        "Pet Accessories", "Pet Food & Accessories",
      ],
    },
  ],
};

/* ------------------------------------------------------------------ *
 * Source 2 — the client's clinical list, 18 Aug 2026
 *
 * A surgical and ward-supply taxonomy: theatre textiles, procedure packs,
 * vascular access, nursing supplies. Nothing in the existing twelve departments
 * covered surgery at all, so two departments are added rather than forcing
 * eleven new shelves into Medical Consumables, which already holds twenty-one.
 *
 * SEVEN OF THE NAMES ASKED FOR ARE NOT HERE, because the tree already carries
 * them under wording it chose earlier, and a second shelf meaning the same
 * thing is the defect we merged out of Beauty on 18 Aug (DA-35):
 *
 *   Incontinence          -> Incontinence Care, under Medical Consumables
 *   Respiratory           -> Respiratory Management, under two departments
 *   Skin Care             -> under Beauty and under Cleaning & Hygiene
 *   Wound Care            -> its own shelf in the Wound Care department
 *   Personal Protection   -> the Protective Wear PPE department itself
 *   OR & Surgery Supplies -> the same goods as Operating Theatre Consumables,
 *                            which is the term a UAE buyer uses
 *   Namic Fluid Management-> "Namic" is a BD product brand. Added as Fluid
 *                            Management, for the same reason Heine Products
 *                            was not copied: a shelf named after one brand
 *                            stops making sense the day the brand changes.
 * ------------------------------------------------------------------ */

const CLINICAL: Source = {
  label: "the client's clinical list",
  note: "18 Aug 2026",
  groups: [
    {
      department: "Surgical & Theatre",
      children: [
        "Apparel",
        "Drapes",
        "Gowns",
        "Operating Theatre Consumables",
        "Sterile Procedure Packs",
        "Surgical Instruments & Sterilization",
      ],
    },
    {
      // The client's label was "Nursing Supplies & Patient Care". Split: the
      // department carries the patient-care half, so repeating it in a child
      // would say it twice.
      department: "Nursing & Patient Care",
      children: [
        "Nursing Supplies",
        "Personal Care",
        "Vascular Access",
        "Fluid Management",
      ],
    },
    {
      // Hand Protection stays as the PPE umbrella — it also covers barrier
      // creams and sleeves — but Gloves is the word a buyer searches for, and
      // it is the single biggest line in this catalogue.
      department: "Protective Wear PPE",
      children: ["Gloves"],
    },
    {
      department: "Instruments & Diagnostics",
      children: ["Exam & Diagnostic Supplies"],
    },
  ],
};

const SOURCES: Source[] = [LIVINGSTONE, CLINICAL];

/* ------------------------------------------------------------------ */

/** Mirrors slugify in src/lib/admin.ts — the URL must match what that makes. */
const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  for (let n = 2; await prisma.category.findUnique({ where: { slug } }); n += 1) {
    slug = `${base}-${n}`;
  }
  return slug;
}

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

const existing = await prisma.category.findMany({
  select: { id: true, name: true, parentId: true },
});

let addedDepartments = 0;
let addedChildren = 0;

for (const source of SOURCES) {
  console.log(`\nAgainst ${source.label} (${source.note})\n`);

  for (const group of source.groups) {
    let parent = existing.find(
      (c) => c.parentId === null && sameName(c.name, group.department)
    );

    if (!parent) {
      const last = await prisma.category.findFirst({
        where: { parentId: null },
        orderBy: { sortOrder: "desc" },
      });
      const created = await prisma.category.create({
        data: {
          name: group.department,
          slug: await uniqueSlug(slugify(group.department)),
          parentId: null,
          sortOrder: (last?.sortOrder ?? -1) + 1,
        },
      });
      parent = { id: created.id, name: created.name, parentId: null };
      existing.push(parent);
      addedDepartments += 1;
      console.log(`  + department  ${group.department}`);
    }

    // Only among this department's own children: "Dispensers" under Cleaning
    // and "Dispensers" under Medical Consumables are two different shelves, and
    // matching on name across the whole tree would silently merge them.
    const siblings = existing.filter((c) => c.parentId === parent!.id);

    let position = siblings.length;
    for (const child of group.children) {
      if (siblings.some((s) => sameName(s.name, child))) continue;

      const created = await prisma.category.create({
        data: {
          name: child,
          slug: await uniqueSlug(slugify(child)),
          parentId: parent.id,
          sortOrder: position,
        },
      });
      existing.push({ id: created.id, name: created.name, parentId: parent.id });
      siblings.push({ id: created.id, name: created.name, parentId: parent.id });
      position += 1;
      addedChildren += 1;
      console.log(`  + ${group.department} / ${child}`);
    }
  }
}

/**
 * The storefront caches the catalogue against this stamp and re-checks it once
 * a second, so a script that writes categories without moving it leaves a
 * running server serving the tree it read at boot.
 */
if (addedDepartments + addedChildren > 0) {
  const current = await prisma.setting.findUnique({ where: { key: "catalogVersion" } });
  const next = String(Number(current?.value ?? "0") + 1);
  await prisma.setting.upsert({
    where: { key: "catalogVersion" },
    update: { value: next },
    create: { key: "catalogVersion", value: next },
  });
  console.log(`\n  catalog version ${next}`);
}

const total = await prisma.category.count();
console.log(
  `\n  ${addedDepartments} department(s) and ${addedChildren} categor${addedChildren === 1 ? "y" : "ies"} added.`
);
console.log(`  ${total} categories in the tree.`);
if (addedChildren > 0) {
  console.log("  New shelves hold nothing — run npm run db:seed:samples to fill them.\n");
} else {
  console.log("");
}

await prisma.$disconnect();
