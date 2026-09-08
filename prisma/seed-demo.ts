/**
 * A populated platform to test against: suppliers, a catalogue with real
 * variant families, cover, and trade accounts that can place an order.
 *
 * WHY THIS EXISTS SEPARATELY FROM seed.ts. That one loads the catalogue that
 * came out of the extraction — 2,000 products of somebody else's data, most of
 * it invented filler. This is a small hand-written set built to exercise the
 * features rather than to look like a real range: every product is in a variant
 * family so the size dropdown has something to show, every pack has a supplier
 * so the buying run works, and two suppliers cover some of the same packs so
 * re-sourcing a back order has somewhere to go.
 *
 * IDEMPOTENT. Run it as often as you like — everything upserts on a natural
 * key, so re-running updates rather than duplicating. Safe to run after
 * scripts/reset-data.py.
 *
 * ⚠ TEST DATA. Every account shares one password and every address is
 * invented. It
 * must not survive to production; see the sign-in screens, which read these
 * accounts back and say so.
 *
 * Run: npm run db:seed:demo
 */

import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const scrypt = promisify(scryptCb);
const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const PASSWORD = "AussieMed2026!";

/** Matches src/lib/auth.ts exactly — scrypt$salt$hash. */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const fils = (aed: number) => Math.round(aed * 100);

/**
 * The storefront holds the catalogue in memory and only reloads it when this
 * stamp moves. Inline rather than imported, exactly as the other seeds do:
 * src/lib/catalog is server-only and cannot load outside Next.
 *
 * Forgetting it is a silent failure that looks like the seed not working — 27
 * products land in the database and the site goes on showing three.
 */
async function bumpCatalogVersion(): Promise<string> {
  const current = await prisma.setting.findUnique({
    where: { key: "catalogVersion" },
  });
  const next = String(Number(current?.value ?? "0") + 1);
  await prisma.setting.upsert({
    where: { key: "catalogVersion" },
    update: { value: next },
    create: { key: "catalogVersion", value: next },
  });
  return next;
}

/* ------------------------------------------------------------------ *
 * Suppliers
 * ------------------------------------------------------------------ */

const SUPPLIERS = [
  {
    username: "gulfmed",
    companyName: "Gulf Medical Trading",
    emirate: "Dubai",
    leadTimeDays: 2,
    phone: "+971 4 555 0101",
  },
  {
    username: "levantlab",
    companyName: "Levant Laboratory Supply",
    emirate: "Sharjah",
    leadTimeDays: 4,
    phone: "+971 6 555 0202",
  },
  {
    username: "northgulf",
    companyName: "North Gulf Disposables",
    emirate: "Abu Dhabi",
    leadTimeDays: 7,
    phone: "+971 2 555 0303",
  },
];

/* ------------------------------------------------------------------ *
 * The catalogue
 * ------------------------------------------------------------------ *
 *
 * Ten families. Each becomes one product per variant, all sharing a
 * variantGroup, which is what puts the size dropdown on the card — a family of
 * one renders nothing, which is why the old data looked as though the feature
 * was missing.
 *
 * Images are the seed photographs already in public/products/seed. They are
 * third-party product shots kept for local testing only.
 */

type Family = {
  group: string;
  base: string;
  description: string;
  category: string;
  taxClass?: "Standard" | "ZeroRated";
  unitLabel: string;
  eachesPerPack: number;
  /** label, item-code suffix, price, image */
  variants: { label: string; code: string; price: number; image?: string }[];
  /** Which suppliers can supply it, in cover order. */
  cover: string[];
  /** What we pay, as a fraction of the sell price. */
  margin: number;
};

const FAMILIES: Family[] = [
  {
    group: "nitrile-examination-gloves",
    base: "Nitrile Examination Gloves, Powder Free, Blue",
    description:
      "Single-use blue nitrile examination gloves. Powder free, ambidextrous, beaded cuff. Latex free, textured fingertips for wet and dry grip.",
    category: "gloves",
    unitLabel: "100 Pieces/Box",
    eachesPerPack: 100,
    variants: [
      { label: "Small", code: "S", price: 24.5, image: "GLVN100LB.png" },
      { label: "Medium", code: "M", price: 24.5, image: "GLVNRLB100L.png" },
      { label: "Large", code: "L", price: 25.9, image: "GLVNTRPF100L.png" },
      { label: "Extra Large", code: "XL", price: 27.4, image: "GLVNTRPF100L-M.png" },
    ],
    cover: ["gulfmed", "northgulf"],
    margin: 0.62,
  },
  {
    group: "vinyl-examination-gloves",
    base: "Vinyl Examination Gloves, Powder Free, Clear",
    description:
      "Powder-free clear vinyl examination gloves for routine clinical and laboratory handling. A latex-free alternative where the barrier requirement is routine rather than high risk.",
    category: "gloves",
    unitLabel: "100 Pieces/Box",
    eachesPerPack: 100,
    variants: [
      { label: "Medium", code: "M", price: 20.4, image: "GLVNRLPFL.png" },
      { label: "Large", code: "L", price: 21.5, image: "GLPF100ZL.png" },
    ],
    cover: ["northgulf", "gulfmed"],
    margin: 0.66,
  },
  {
    group: "gauze-swabs-non-sterile",
    base: "Gauze Swabs, Non-Sterile, 8 Ply",
    description:
      "Absorbent cotton gauze swabs for cleaning and dressing. Non-sterile, eight ply, cut edges folded in to reduce loose fibres.",
    category: "wound-care",
    unitLabel: "100 Pieces/Pack",
    eachesPerPack: 100,
    variants: [
      { label: "5 x 5 cm", code: "55", price: 8.9, image: "GS050H.png" },
      { label: "7.5 x 7.5 cm", code: "7575", price: 11.4, image: "GSS075X1P.png" },
      { label: "10 x 10 cm", code: "1010", price: 15.2, image: "HCP150X300N.png" },
    ],
    cover: ["levantlab", "gulfmed"],
    margin: 0.58,
  },
  {
    group: "hypodermic-needles",
    base: "Hypodermic Needles, Sterile, Single Use",
    description:
      "Sterile single-use hypodermic needles with a colour-coded hub and a triple-bevelled, siliconised cannula. Individually blister packed.",
    category: "needles-and-accessories",
    unitLabel: "100 Pieces/Box",
    eachesPerPack: 100,
    variants: [
      { label: "21G x 1.5\"", code: "21", price: 18.6, image: "DN14GX15LV.png" },
      { label: "23G x 1\"", code: "23", price: 18.6, image: "DSL0003ML29G.png" },
      { label: "25G x 5/8\"", code: "25", price: 19.8, image: "DS003MLLTL.png" },
    ],
    cover: ["gulfmed", "levantlab"],
    margin: 0.6,
  },
  {
    group: "alcohol-prep-pads",
    base: "Alcohol Prep Pads, 70% Isopropyl",
    description:
      "Gamma-sterilised 70% isopropyl alcohol prep pads for skin antisepsis before injection or venepuncture. Individually foil wrapped.",
    category: "antiseptics",
    unitLabel: "200 Pieces/Box",
    eachesPerPack: 200,
    variants: [
      { label: "Standard", code: "STD", price: 12.75, image: "ASF7318025.png" },
      { label: "Large", code: "LGE", price: 16.9, image: "MULTISTX10LIV.png" },
    ],
    cover: ["northgulf", "levantlab"],
    margin: 0.55,
  },
  {
    group: "microscope-slides",
    base: "Microscope Slides, Ground Edges",
    description:
      "Pre-cleaned soda-lime glass microscope slides with ground edges and clipped corners. Supplied in a hinged plastic storage box.",
    category: "laboratory-consumables",
    unitLabel: "50 Pieces/Box",
    eachesPerPack: 50,
    variants: [
      { label: "Plain", code: "PLN", price: 14.3, image: "7101-1C.png" },
      { label: "Frosted One End", code: "FR1", price: 16.85, image: "1101-0050.png" },
    ],
    cover: ["levantlab"],
    margin: 0.64,
  },
  {
    group: "specimen-containers",
    base: "Specimen Containers, Sterile, Screw Cap",
    description:
      "Leak-resistant sterile specimen containers with a screw cap and an integral writing panel. Individually wrapped, suitable for urine and general sampling.",
    category: "laboratory-consumables",
    unitLabel: "100 Pieces/Carton",
    eachesPerPack: 100,
    variants: [
      { label: "60 ml", code: "60", price: 31.2, image: "SCP10.png" },
      { label: "70 ml", code: "70", price: 34.8, image: "EMESISBGN-50.png" },
      { label: "120 ml", code: "120", price: 42.5, image: "PTP01-01P.png" },
    ],
    cover: ["levantlab", "northgulf"],
    margin: 0.61,
  },
  {
    group: "underpads-disposable",
    base: "Disposable Underpads, Fluff Core",
    description:
      "Disposable underpads with a fluff core and a leak-proof polyethylene backing, for beds and examination couches.",
    category: "incontinence-care",
    unitLabel: "25 Pieces/Pack",
    eachesPerPack: 25,
    variants: [
      { label: "60 x 60 cm", code: "6060", price: 27.9, image: "UPAD55640.png" },
      { label: "60 x 90 cm", code: "6090", price: 36.4, image: "MYEPD30SLLG.png" },
    ],
    cover: ["northgulf", "gulfmed"],
    margin: 0.59,
  },
  {
    group: "face-masks-3ply",
    base: "Face Masks, 3 Ply, Earloop",
    description:
      "Three-ply pleated face masks with an adjustable nose clip and soft earloops. Fluid resistant, for general clinical and dental use.",
    category: "face-protection",
    unitLabel: "50 Pieces/Box",
    eachesPerPack: 50,
    variants: [
      { label: "Blue", code: "BLU", price: 13.6, image: "KIM4440N.png" },
      { label: "White", code: "WHT", price: 13.6, image: "LWMS-1.png" },
      { label: "Black", code: "BLK", price: 15.9, image: "LWMS6.png" },
    ],
    cover: ["gulfmed", "northgulf"],
    margin: 0.57,
  },
  {
    group: "hand-sanitiser-gel",
    base: "Hand Sanitiser Gel, 70% Alcohol",
    description:
      "Alcohol-based hand sanitiser gel with added emollient. Rapid action, non-sticky finish, for use where soap and water are not to hand.",
    category: "skin-protection",
    unitLabel: "Each",
    eachesPerPack: 1,
    variants: [
      { label: "60 ml", code: "60", price: 8.45, image: "cw-82736.jpg" },
      { label: "375 ml", code: "375", price: 19.34, image: "cw-82735.jpg" },
      { label: "1 Litre", code: "1L", price: 38.9, image: "cw-99839.jpg" },
    ],
    cover: ["gulfmed", "levantlab", "northgulf"],
    margin: 0.63,
  },
];

/* ------------------------------------------------------------------ *
 * Customers
 * ------------------------------------------------------------------ */

const CUSTOMERS = [
  {
    email: "layla@albarshaclinic.test",
    name: "Layla Haddad",
    organisation: "Al Barsha Family Clinic",
    trn: "100399499100003",
    emirate: "Dubai",
    terms: "Net14",
    discountBasisPoints: 0,
    address: {
      label: "Al Barsha clinic",
      line1: "Unit 4, Al Barsha 1",
      city: "Dubai",
      emirate: "Dubai",
      phone: "+971 4 555 0999",
    },
    staff: ["Layla Haddad", "Reception desk"],
  },
  {
    email: "omar@deiradental.test",
    name: "Omar Nasser",
    organisation: "Deira Dental Centre",
    trn: "100488277600003",
    emirate: "Dubai",
    terms: "Net30",
    // A negotiated account, so the account-discount path has something to
    // exercise: 5% off everything priced from the list.
    discountBasisPoints: 500,
    address: {
      label: "Deira surgery",
      line1: "Level 2, Al Rigga Road",
      city: "Dubai",
      emirate: "Dubai",
      phone: "+971 4 555 0777",
    },
    staff: ["Omar Nasser", "Practice manager"],
  },
];

/* ------------------------------------------------------------------ *
 * Seeding
 * ------------------------------------------------------------------ */

async function main() {
  const passwordHash = await hashPassword(PASSWORD);

  console.log("\nSuppliers");
  const supplierIds = new Map<string, string>();

  for (const s of SUPPLIERS) {
    const email = `${s.username}@aussiemed.local`;

    const user = await prisma.user.upsert({
      where: { email },
      update: { username: s.username, passwordHash, role: "Supplier", isVerified: true },
      create: {
        email,
        username: s.username,
        name: s.companyName,
        role: "Supplier",
        isVerified: true,
        passwordHash,
      },
    });

    const existing = await prisma.supplier.findFirst({
      where: { companyName: s.companyName },
    });

    const supplier = existing
      ? await prisma.supplier.update({
          where: { id: existing.id },
          data: { userId: user.id, status: "Active" },
        })
      : await prisma.supplier.create({
          data: {
            userId: user.id,
            companyName: s.companyName,
            // Invented addresses. Nothing reaches a real inbox.
            primaryEmail: `orders@${s.username}.test`,
            secondaryEmail: `accounts@${s.username}.test`,
            phone: s.phone,
            emirate: s.emirate,
            countryCode: "AE",
            promisedLeadTimeDays: s.leadTimeDays,
            status: "Active",
          },
        });

    supplierIds.set(s.username, supplier.id);
    console.log(`  ${s.username.padEnd(12)} ${s.companyName} · ${s.emirate} · ${s.leadTimeDays}d lead`);
  }

  console.log("\nCatalogue");
  let products = 0;
  let images = 0;
  let supplies = 0;

  for (const family of FAMILIES) {
    const category = await prisma.category.findUnique({
      where: { slug: family.category },
    });
    if (!category) {
      console.log(`  SKIP ${family.base} — no category "${family.category}"`);
      continue;
    }

    for (const variant of family.variants) {
      const name = `${family.base}, ${variant.label}`;
      const slug = slugify(name);
      const skuCode = `${family.group.toUpperCase().replace(/-/g, "").slice(0, 8)}-${variant.code}`;

      const product = await prisma.productMaster.upsert({
        where: { slug },
        update: {
          name,
          description: family.description,
          status: "Active",
          taxClass: family.taxClass ?? "Standard",
          variantGroup: family.group,
          variantLabel: variant.label,
        },
        create: {
          name,
          slug,
          description: family.description,
          status: "Active",
          taxClass: family.taxClass ?? "Standard",
          variantGroup: family.group,
          variantLabel: variant.label,
        },
      });
      products++;

      await prisma.productCategory.upsert({
        where: {
          productMasterId_categoryId: {
            productMasterId: product.id,
            categoryId: category.id,
          },
        },
        update: {},
        create: { productMasterId: product.id, categoryId: category.id },
      });

      const sku = await prisma.productSku.upsert({
        where: { skuCode },
        update: {
          productMasterId: product.id,
          unitLabel: family.unitLabel,
          priceFils: fils(variant.price),
          isActive: true,
        },
        create: {
          productMasterId: product.id,
          skuCode,
          baseUnitName: "Each",
          unitLabel: family.unitLabel,
          unitShortLabel: family.unitLabel.split("/").pop() ?? "Box",
          eachesPerPack: family.eachesPerPack,
          priceFils: fils(variant.price),
          isActive: true,
        },
      });

      /* A break is a packaging level, not an arbitrary discount: a carton
         holds ten, a pallet holds four cartons. */
      await prisma.priceTier.deleteMany({ where: { skuId: sku.id } });
      await prisma.priceTier.createMany({
        data: [
          {
            skuId: sku.id,
            minQty: 10,
            priceFils: fils(Number((variant.price * 0.96).toFixed(2))),
            unitName: "Carton",
            unitsPerLevel: 10,
          },
          {
            skuId: sku.id,
            minQty: 40,
            priceFils: fils(Number((variant.price * 0.92).toFixed(2))),
            unitName: "Pallet",
            unitsPerLevel: 4,
          },
        ],
      });

      if (variant.image) {
        const path = `/products/seed/${variant.image}`;
        const has = await prisma.productImage.findFirst({
          where: { productMasterId: product.id, path },
        });
        if (!has) {
          await prisma.productImage.create({
            data: { productMasterId: product.id, path, altText: name, sortOrder: 0 },
          });
          images++;
        }
      }

      /* Cover. The first named supplier is Primary, the second Backup, the
         third Third — so a back order has somewhere to be re-sourced to. */
      const ranks = ["Primary", "Backup", "Third"] as const;
      for (const [index, username] of family.cover.entries()) {
        const supplierId = supplierIds.get(username);
        if (!supplierId || index >= ranks.length) continue;

        // Each supplier a little dearer than the one before it, so the cheapest
        // is genuinely the primary and the margin report has a spread to show.
        const cost = fils(
          Number((variant.price * family.margin * (1 + index * 0.06)).toFixed(2))
        );

        await prisma.productSupply.upsert({
          where: { skuId_supplierId: { skuId: sku.id, supplierId } },
          update: { rank: ranks[index], costFils: cost, isApproved: true },
          create: {
            skuId: sku.id,
            supplierId,
            rank: ranks[index],
            costFils: cost,
            isApproved: true,
            supplierPartNumber: `${username.slice(0, 3).toUpperCase()}-${skuCode}`,
            leadTimeDays: SUPPLIERS.find((s) => s.username === username)?.leadTimeDays,
            isAvailable: true,
            supplyStatus: "Available",
          },
        });
        supplies++;
      }
    }

    console.log(
      `  ${family.base.slice(0, 46).padEnd(48)} ${family.variants.length} variants`
    );
  }

  console.log("\nCustomers");
  for (const c of CUSTOMERS) {
    const existing = await prisma.organisation.findFirst({
      where: { name: c.organisation },
    });

    const org = existing
      ? await prisma.organisation.update({
          where: { id: existing.id },
          data: {
            trn: c.trn,
            emirate: c.emirate,
            paymentTerms: c.terms,
            discountBasisPoints: c.discountBasisPoints,
          },
        })
      : await prisma.organisation.create({
          data: {
            name: c.organisation,
            trn: c.trn,
            emirate: c.emirate,
            countryCode: "AE",
            paymentTerms: c.terms,
            discountBasisPoints: c.discountBasisPoints,
          },
        });

    await prisma.user.upsert({
      where: { email: c.email },
      update: {
        passwordHash,
        role: "Customer",
        isVerified: true,
        approvalStatus: "Approved",
        organisationId: org.id,
      },
      create: {
        email: c.email,
        name: c.name,
        role: "Customer",
        isVerified: true,
        approvalStatus: "Approved",
        approvedAt: new Date(),
        passwordHash,
        organisationId: org.id,
      },
    });

    const address = await prisma.address.findFirst({
      where: { organisationId: org.id, label: c.address.label },
    });
    const branch =
      address ??
      (await prisma.address.create({
        data: {
          organisationId: org.id,
          label: c.address.label,
          contact: c.name,
          phone: c.address.phone,
          line1: c.address.line1,
          city: c.address.city,
          emirate: c.address.emirate,
          isDefault: true,
        },
      }));

    for (const name of c.staff) {
      await prisma.organisationStaff.upsert({
        where: { organisationId_name: { organisationId: org.id, name } },
        update: { addressId: branch.id, isActive: true },
        create: { organisationId: org.id, name, addressId: branch.id },
      });
    }

    const discount = c.discountBasisPoints
      ? ` · ${c.discountBasisPoints / 100}% off list`
      : "";
    console.log(`  ${c.email.padEnd(30)} ${c.organisation} · ${c.terms}${discount}`);
  }

  const version = await bumpCatalogVersion();

  console.log(
    `\n  ${products} products · ${images} images · ${supplies} supply rows` +
      `\n  catalogue version bumped to ${version}` +
      `\n  password for every account: ${PASSWORD}` +
      `\n  TEST DATA — must not survive to production.\n`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
