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

/**
 * A shelf, or a shelf with shelves of its own.
 *
 * Dental is three deep — Dental > Endodontics > Hand Files — because Henry
 * Schein's dental taxonomy genuinely is, and the client asked for it under one
 * department (DA-41). Everything else is a plain name two levels down.
 */
type Shelf = string | { name: string; children: string[] };

type Group = {
  /** The department these belong under, by the name OUR tree uses. */
  department: string;
  children: Shelf[];
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
    /*
     * Livingstone's twenty dental shelves are NOT listed here any more, and this
     * comment is standing in for them so nobody restores them by accident.
     *
     * They were absorbed on 19 Aug (DA-39) when Henry Schein's dental taxonomy
     * arrived: every one of them was a name the new tree already carries, and
     * Dental > Endodontics beside an Endodontics shelf is the duplication merged
     * out of Beauty the day before. Their one real product, a Myerson Dura-Post,
     * moved to Dental > Restorative & Cosmetic > Pins & Posts.
     *
     * Leaving the list in place would have made this script undo that work the
     * next time anybody ran it — which is exactly the fault DA-37 fixed in the
     * catalogue seed, arriving by a different door.
     */
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

/* ------------------------------------------------------------------ *
 * Source 3 — henryschein.com.au, read 19 Aug 2026
 *
 * The client asked for their whole taxonomy with the dental listings made
 * comprehensive. Henry Schein is dental-first and their tree is THREE levels
 * deep — Instruments > Surgical > Bone Files — while ours is two, asserted by
 * db:check and assumed by the breadcrumb, the Browse menu and the filter
 * sidebar.
 *
 * The client's decision (19 Aug) was to promote their top level to
 * departments, so their second level lands as our sub-categories and the detail
 * survives. Their third level is not carried: "Hand Files" is one shelf rather
 * than seven, which is where a buyer stops narrowing anyway.
 *
 * FIVE DEPARTMENTS ARE RENAMED, because their names are only unambiguous inside
 * a dental-only catalogue and this one also sells laboratory science, office and
 * kitchen goods: Laboratory -> Dental Laboratory (we already have a Laboratory
 * department full of glassware and chemicals), Instruments -> Dental
 * Instruments, Equipment -> Dental Equipment, X-Ray -> Dental X-Ray. Burs is
 * split into Dental Burs and Laboratory Burs, which are their own second level,
 * because their third level is the useful part and the two groups repeat names
 * — Polishers and Steel Burs appear under both.
 *
 * NOT COPIED. Clearance, New Products and Price Drop are merchandising, not a
 * way of describing goods. Nor are the brand shelves, for the reason Heine
 * Products was left out of Livingstone's tree: Zany Jackets, Carriere Motion,
 * Mini-Molds, Nitanium Molar Rotator, Nitanium Palatal Expander, TransForce and
 * Twin Force Bite Corrector are products, and a category named after one stops
 * making sense the day the supplier changes. AussieMed has a Brand field.
 * ------------------------------------------------------------------ */

const HENRY_SCHEIN: Source = {
  label: "henryschein.com.au",
  note: "read 19 Aug 2026; one Dental department, three levels deep (DA-41)",
  groups: [
    {
      /**
       * ONE department, not twenty-four.
       *
       * Promoting their top level to departments put twenty-four dental tiles on
       * the front page beside Kitchen and Pet Care, and the client asked for
       * them grouped. Flattening instead was measured and rejected: twelve names
       * collide as siblings — "Accessories" belongs to five disciplines at once —
       * so the tree carries a third level for dental and each shelf keeps its
       * own name.
       */
      department: "Dental",
      children: [
    {
      name: "Anaesthetic",
      children: [
        "Delivery Systems", "Dental Needles", "Hypodermic Needles", "Local Anaesthetic", "Pharmaceuticals", "Sharps Disposal & Protection", "Syringes", "Topical Anaesthetic",
      ],
    },
    {
      name: "Articulating",
      children: [
        "Articulators & Facebows", "Foil", "Forceps", "Occlusal Indicators", "Paper", "Silk", "Sprays",
      ],
    },
    {
      name: "Dental Burs",
      children: [
        "Accessories", "Bur Kits", "Carbide Highspeed Burs", "Carbide Slowspeed Burs", "Caries Excavation", "Ceramic Highspeed Burs", "Ceramic Slowspeed Burs", "Crown Cutters", "Diamond Highspeed Burs", "Diamond Slowspeed Burs", "Endodontics", "Filling Remover", "Finishing & Polishing", "Implantology", "Oral Surgery Burs", "Orthodontics", "Polishers", "Preparation", "Root Planing", "Single Use Sterile Burs", "Sonic Tips", "Speciality Endodontics", "Speciality Surgical", "Steel Burs",
      ],
    },
    {
      name: "Laboratory Burs",
      children: [
        "Carbide Burs", "Cutters", "Diamond Burs", "Discs", "Grinding, Finishing & Polishing", "Lab Bur Kits", "Milling Burs", "Polishers", "Separating & Contouring", "Steel Burs", "Twist Drills & Mandrels",
      ],
    },
    {
      name: "CAD/CAM",
      children: [
        "Blocks", "Discs", "Finishing & Polishing", "Ingots", "Milling Unit Accessories", "Sprays, Etchants & Primers", "Stain, Glaze & Firing Accessories",
      ],
    },
    {
      name: "3D Printing",
      children: [
        "3D Printers", "3D Printing Accessories"
      ],
    },
    {
      name: "Crown & Bridge",
      children: [
        "Accessories", "Cements", "Cleaners", "Core Material", "Crown Forms", "Liners & Base", "Temporary Crown & Bridge", "Varnish, Sealants & Conditioners",
      ],
    },
    {
      name: "Disposables",
      children: [
        "Bags & Bin Liners", "Barrier Products", "Bibs", "Cotton", "Cups", "Dispensers, Towels & Tissues", "Dry Tips", "Evacuation", "Gauze", "Gloves", "Gowns & Caps", "Masks", "Tissues", "Towels",
      ],
    },
    {
      name: "Education & Toys",
      children: [
        "Books", "Patient Education", "Toys & Stickers"
      ],
    },
    {
      name: "Endodontics",
      children: [
        "Access", "Apex Locators", "Calcium Hydroxide", "Endo Motors", "Finger Pluggers & Spreaders", "GP Points", "Hand Files", "Irrigation Syringes & Needles", "Medicaments & Solutions", "Obturation Material", "Obturation Units", "Organisers & Accessories", "Paper Points", "Paste Carriers", "Primers, Sealers & Cements", "Pulp Tester", "Rotary Files", "Sterile Rotary Files", "Ultrasonic Tips",
      ],
    },
    {
      name: "Dental Equipment",
      children: [
        "Dental Chairs", "Digital Dentistry", "Imaging", "Plant", "Sterilisation", "Suction System Accessories", "Treatment Unit Accessories",
      ],
    },
    {
      name: "Finishing & Polishing",
      children: [
        "Direct", "Indirect"
      ],
    },
    {
      name: "Handpieces",
      children: [
        "Air Motors", "Cleaners, Lubricants & Accessories", "Electric Micromotors", "Endo Handpieces & Accessories", "High Speed", "Lab Handpieces", "Low Speed", "Motor Adaptors & Couplings", "Perio Handpieces & Tips", "Surgical Handpieces",
      ],
    },
    {
      name: "Impression",
      children: [
        "Accessories", "Alginate", "Bite Registration", "Compound", "Impression Disinfectant", "Laboratory Putty", "Mixers & Mixing Bowls", "Mixing Tips", "Polyether", "Polyvinylsiloxane", "Silicone", "Syringes & Dispensers", "Trays",
      ],
    },
    {
      name: "Infection Control",
      children: [
        "Air Purification", "Barrier", "Disinfectants & Detergents", "Gloves", "Hand Hygiene", "Masks", "Protective Apparel", "Steri Room", "Ultrasonic Cleaning", "Waste Management", "Wipes",
      ],
    },
    {
      name: "Dental Instruments",
      children: [
        "Accessories", "Bundles", "Calipers & Gauges", "Diagnostic", "Endodontics", "Instrument Maintenance", "Laboratory", "Orthodontics", "Periodontics", "Restorative", "Surgical", "Trays & Cassettes",
      ],
    },
    {
      name: "Dental Laboratory",
      children: [
        "Abrasives", "Acrylics", "Alloy", "Articulation", "Brushes & Buffs", "Burners & Torches", "Casting", "Ceramics & Porcelain", "Denture Accessories", "Duplicating Material", "Furniture", "Instruments", "Investment", "Lab Equipment", "Model Preparation", "Polishing", "Shade Taking", "Stone & Plaster", "Storage, Packing & Delivery", "Teeth", "Thermo & Pressure Forming", "Waxes",
      ],
    },
    {
      name: "Oral Surgery",
      children: [
        "Electrosurgery", "Grafting Materials", "Implant Dentistry", "Implant Stability Testing", "Interproximal Reduction", "Lasers", "Oral Cancer Detection", "Piezo Surgery", "Post Operative Care", "Sterile Gloves", "Surgical Accessories", "Surgical Drapes", "Surgical Instruments", "Surgical Irrigation", "Sutures", "Wound Management",
      ],
    },
    {
      name: "Orthodontics",
      children: [
        "Adhesives & Cements", "Archwires & Straight Lengths", "Bands", "Brackets", "Buccal Tubes", "Elastomerics", "Fixed Appliance Accessories", "Interproximal Reduction", "Laboratory", "Lingual Arches & Palatal Bars", "Lingual Attachments & Wires", "Mouthguard Cases & Retainers", "Orthodontic Instruments", "Photographic Mirrors", "Springs", "Stops & Hooks", "Storage & Dispensers",
      ],
    },
    {
      name: "Preventive",
      children: [
        "Appliance Care", "Caries & Crack Detection", "Disclosing", "Flossing", "Fluoride Treatments", "Interdental Brushes", "Pit & Fissure", "Prophy", "Rinses", "Speciality", "Tongue Cleaners & Toothpicks", "Toothbrushes", "Toothpaste", "Ultrasonic Prophylaxis",
      ],
    },
    {
      name: "Restorative & Cosmetic",
      children: [
        "Accessories", "Amalgam & Alloys", "Bonds & Etch", "Brushes & Applicators", "Compomer", "Composite", "Curing Lights", "Dentin Conditioners", "Glass Ionomers", "Jewellery", "Matrix Bands & Retainers", "Pins & Posts", "Shade Taking", "Staining & Reinforcement", "Teeth Whitening",
      ],
    },
    {
      name: "Retraction",
      children: [
        "Cords, Twists & Braids", "Hemostatic Gels & Solutions", "Pellets & Cotton", "Retraction Systems",
      ],
    },
    {
      name: "Rubber Dam",
      children: [
        "Clamps", "Frames", "Latex Dam", "Napkins", "Non-Latex Dam", "Punches & Forceps", "Stabilising Cord", "Stamps & Templates",
      ],
    },
    {
      name: "Dental X-Ray",
      children: [
        "Aprons", "Bite Blocks", "Bite Wings, Tabs & Hangers", "Film (Intra-oral)", "Film Position Holders", "Film Storage", "Fixers & Developers", "Intra-Oral X-ray", "Sensors & Plates",
      ],
    },
      ],
    },
  ],
};

const SOURCES: Source[] = [LIVINGSTONE, CLINICAL, HENRY_SCHEIN];

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

    /**
     * Only ever matched among one parent's own children: "Dispensers" under
     * Cleaning and "Dispensers" under Medical Consumables are two different
     * shelves, and matching on name across the whole tree would silently merge
     * them. That is also what makes three levels safe — twelve dental names
     * repeat across disciplines, and each keeps its own shelf.
     */
    const ensure = async (
      name: string,
      parentId: string,
      position: number,
      path: string
    ): Promise<string> => {
      const found = existing.find(
        (c) => c.parentId === parentId && sameName(c.name, name)
      );
      if (found) return found.id;

      const created = await prisma.category.create({
        data: {
          name,
          slug: await uniqueSlug(slugify(name)),
          parentId,
          sortOrder: position,
        },
      });
      existing.push({ id: created.id, name: created.name, parentId });
      addedChildren += 1;
      console.log(`  + ${path} / ${name}`);
      return created.id;
    };

    let position = existing.filter((c) => c.parentId === parent.id).length;
    for (const shelf of group.children) {
      const name = typeof shelf === "string" ? shelf : shelf.name;
      const childId = await ensure(name, parent.id, position, group.department);
      position += 1;

      if (typeof shelf === "string") continue;

      let deep = existing.filter((c) => c.parentId === childId).length;
      for (const grandchild of shelf.children) {
        await ensure(grandchild, childId, deep, `${group.department} / ${name}`);
        deep += 1;
      }
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
