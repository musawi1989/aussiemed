/**
 * Filling the gaps in the category tree.
 *
 * The tree already in the database is the Livingstone taxonomy — the
 * extraction mirror it was built from is a scrape of their catalogue, which is
 * why 125 of the 146 categories hold nothing. So the client's request to copy
 * their categories is mostly already satisfied, and what is actually needed is
 * the handful their site carries that ours does not.
 *
 * Read off livingstone.com.au on 17 Aug 2026 and diffed against the database
 * rather than added wholesale, so nothing is duplicated and the count only
 * moves by what was genuinely missing.
 *
 * THREE KINDS OF THING WERE DELIBERATELY LEFT OUT.
 *
 * Brand shelves — "Heine Products", "Welch Allyn Products" — are Livingstone's
 * own merchandising, not a way of describing goods. AussieMed has a Brand
 * field for that, and a category called after one supplier's brand is a
 * category that stops making sense the day the brand changes.
 *
 * "First Nation Office Supplies" is an Australian procurement classification
 * with no meaning for a UAE trade buyer.
 *
 * "New Waxing Range" is a promotion with a date on it. It will read as wrong
 * within a year, and Hair Removal already covers the goods.
 *
 * SAFE TO RE-RUN. Nothing is created that already exists by name under the
 * same parent, and nothing is ever removed.
 *
 * Run with: npm run db:seed:categories
 */

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

/**
 * Livingstone's departments, mapped to ours where the names differ.
 *
 * Ours were shortened when the catalogue was first imported — "Dental" for
 * "Dental Supplies", "Laboratory" for "Laboratory Science" — and renaming them
 * now would change URLs that already work for the sake of matching somebody
 * else's wording. The mapping keeps the diff honest without touching them.
 */
const DEPARTMENTS: { theirs: string; ours: string; children: string[] }[] = [
  {
    theirs: "Medical Consumables",
    ours: "Medical Consumables",
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
    theirs: "Wound Care, First Aid & Safety",
    ours: "Wound Care, First Aid & Safety",
    children: [
      "Respiratory Management", "Medicine", "Clips & Fasteners",
      "Burn Treatment", "Emergency & Rescue", "Wound Care", "Antiseptics",
      "First Aid", "Workplace Safety", "Skin Protection",
      "First Aid Kits & Accessories",
    ],
  },
  {
    theirs: "Kitchen",
    ours: "Kitchen",
    children: [
      "Food Supplies", "Cups & Accessories", "Beverages & Accessories", "Bags",
      "Food Containers", "Cutlery & Plates",
    ],
  },
  {
    theirs: "Laboratory Science",
    ours: "Laboratory",
    children: [
      "Charts and Models", "Glassware", "Lab Safety", "Laboratory Chemicals",
      "Laboratory Consumables", "Laboratory Equipment and Apparatus",
      "Heating mantle", "Labware", "Plasticware",
    ],
  },
  {
    theirs: "Protective Wear",
    ours: "Protective Wear PPE",
    children: [
      "Face Protection", "Foot Protection", "Body Protection",
      "Hand Protection", "Head Protection", "PPE Dispensers",
    ],
  },
  {
    theirs: "Beauty, Skin & Personal Care",
    ours: "Beauty, Skin & Personal Care",
    children: [
      "Podiatry", "Nail Care", "Undergarments", "Makeup Supplies",
      "Barber Supplies", "Sexual Health", "Amenities", "Beauty", "Baby Care",
      "Tanning", "Hair Care", "Cotton Products", "Oral Care", "Hair Removal",
      "Skin Care", "Barber/Hairdressing Supplies", "Eye Care", "Body Care",
      "Personal Hygiene", "Feminine Hygiene", "Grooming",
    ],
  },
  {
    theirs: "Instruments & Diagnostics",
    ours: "Instruments & Diagnostics",
    children: [
      "Scissors", "Blades & Accessories", "Blood Collection", "Pessary Rings",
      "Biopsy Punches", "Podiatry", "Medical Equipment", "Clamps",
      "Diagnostics & Accessories", "Aerosol Masks", "Hollow Ware",
      "Monitoring & Testing", "Medical Instruments", "Forceps", "Sutures",
      "I.V Administration", "Environment Control",
    ],
  },
  {
    // Not in our tree at all. Piercing Supplies had been sitting under Beauty,
    // where a buyer would never look for it; the empty original was removed
    // once this department existed to hold it.
    theirs: "Tattoo & Piercing",
    ours: "Tattoo & Piercing",
    children: ["Tattoo Supplies", "Piercing Supplies"],
  },
  {
    theirs: "Dental Supplies",
    ours: "Dental",
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
    theirs: "Cleaning & Hygiene",
    ours: "Cleaning & Hygiene",
    children: [
      "Hand Hygiene", "Cleaning Supplies", "Cleaning Towels", "Tissues",
      "Wipers & Cleaners", "Swabs & Wipes", "Waste Disposal", "Bottle Brushes",
      "Scrubs, Sponges & Brushes", "Dispensers", "Mops, Brooms & Buckets",
      "Accessories", "Cleaning Chemicals", "Toilet Essentials", "Bags",
      "Skin Care", "Tapes & Adhesives",
    ],
  },
  {
    theirs: "Office & Stationery Supplies",
    ours: "Office & Stationery Supplies",
    children: [
      "Arts & Crafts", "Binding & Laminating", "Books & Notepads",
      "Desk Supplies", "Envelopes & Labels", "Filing & Storage",
      "Ink & Accessories", "Office Accessories", "Packaging Supplies",
      "Paper Supplies", "Pen, Pencils & Markers", "Stamps & Accessories",
      "Teaching Aid & Charts", "Whiteboard, Corkboards & Accessories",
    ],
  },
  {
    theirs: "Pet Care",
    ours: "Pet Care",
    // Their tree has a "Pet Care" shelf inside the Pet Care department. A
    // category named after the department it sits in tells a buyer nothing, so
    // it is not copied.
    children: [
      "Grooming", "Pet Toys", "Medicine & Antiseptics",
      "Pet Accessories", "Pet Food & Accessories",
    ],
  },
];

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

console.log("\nFilling category gaps against livingstone.com.au\n");

const existing = await prisma.category.findMany({
  select: { id: true, name: true, parentId: true },
});

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

let addedDepartments = 0;
let addedChildren = 0;

for (const department of DEPARTMENTS) {
  let parent = existing.find(
    (c) => c.parentId === null && sameName(c.name, department.ours)
  );

  if (!parent) {
    const last = await prisma.category.findFirst({
      where: { parentId: null },
      orderBy: { sortOrder: "desc" },
    });
    const created = await prisma.category.create({
      data: {
        name: department.ours,
        slug: await uniqueSlug(slugify(department.ours)),
        parentId: null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    parent = { id: created.id, name: created.name, parentId: null };
    existing.push(parent);
    addedDepartments += 1;
    console.log(`  + department  ${department.ours}`);
  }

  // Only among this department's own children: "Dispensers" under Cleaning and
  // "Dispensers" under Medical Consumables are two different shelves, and
  // matching on name alone across the whole tree would silently merge them.
  const siblings = existing.filter((c) => c.parentId === parent!.id);

  let position = siblings.length;
  for (const child of department.children) {
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
    console.log(`  + ${department.ours} / ${child}`);
  }
}

const total = await prisma.category.count();
console.log(
  `\n  ${addedDepartments} department(s) and ${addedChildren} categor${addedChildren === 1 ? "y" : "ies"} added.`
);
console.log(`  ${total} categories in the tree.\n`);

await prisma.$disconnect();
