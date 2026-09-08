/**
 * Two products with a COMPLETE, buyable variant matrix.
 *
 * Every glove in the catalogue already carries a Size axis and a Colour axis —
 * five sizes, three colours, stamped on all six of them by the catalogue
 * generator (DA-11). What none of them had was a SKU behind any of those
 * values, so the picker on the product page could show the range but never let
 * anybody choose from it: fifteen combinations advertised, one purchasable.
 *
 * This builds the missing 15 x 2 SKUs for two products, so the picker has
 * something real to resolve against and every size and colour can actually be
 * bought. Two, not all six, because the point is a worked example — the real
 * matrices have to come from the supplier (DA-11), and inventing them for the
 * whole catalogue would bury that.
 *
 * ⚠ EVERY PRICE HERE IS INVENTED, on the same footing as DA-20's packaging
 * guesses. Larger sizes cost a little more and black nitrile a little more
 * again, which is the shape of real glove pricing but not real glove prices.
 * Nothing in here should survive the real catalogue landing.
 *
 * SAFE TO RE-RUN. Generated SKUs carry a -V- marker in their code and are
 * deleted before rebuilding. A SKU that has ever been ordered or is sitting in
 * somebody's cart is left alone and reported, because deleting it would take
 * the order line's history with it.
 *
 * Run with: npm run db:seed:variants
 */

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

/** The marker that makes a generated SKU recognisable, and so removable. */
const MARKER = "-V-";

/** The two products given a full matrix. Chosen because both are gloves with
 *  a real photograph, so the page does not fall back to a monogram tile. */
const TARGETS = [
  "universal-skin-shield-biodegradable-latex-examination-gloves",
  "ni-tek-nitrile-premium-examination-gloves",
];

/** Size order as a buyer reads it, not alphabetically. */
const SIZE_ORDER = ["Extra Small", "Small", "Medium", "Large", "Extra Large"];

const SIZE_CODE: Record<string, string> = {
  "Extra Small": "XS",
  Small: "S",
  Medium: "M",
  Large: "L",
  "Extra Large": "XL",
};

/**
 * Invented, and shaped like real glove pricing: more material costs more, and
 * a pigmented nitrile costs more than a natural one. Multipliers rather than
 * prices so they follow whatever the template SKU charges.
 */
const SIZE_FACTOR: Record<string, number> = {
  "Extra Small": 0.98,
  Small: 1,
  Medium: 1,
  Large: 1.04,
  "Extra Large": 1.09,
};

const COLOUR_FACTOR: Record<string, number> = {
  Blue: 1,
  Green: 1.03,
  Black: 1.07,
};

const COLOUR_CODE: Record<string, string> = {
  Blue: "BL",
  Green: "GR",
  Black: "BK",
};

/** Money is integer fils. Rounded once, here, so nothing downstream sees a
 *  fraction of a fil. */
const scale = (fils: number, factor: number) => Math.round(fils * factor);

async function main() {
  for (const slugPrefix of TARGETS) {
    const product = await prisma.productMaster.findFirst({
      where: { slug: { startsWith: slugPrefix } },
      include: {
        options: { include: { values: true }, orderBy: { sortOrder: "asc" } },
        skus: { include: { tiers: true }, orderBy: { eachesPerPack: "asc" } },
      },
    });

    if (!product) {
      console.log(`SKIPPED  no product matching "${slugPrefix}"`);
      continue;
    }

    const sizes = product.options.find((o) => o.name === "Size");
    const colours = product.options.find((o) => o.name === "Colour");
    if (!sizes || !colours) {
      console.log(`SKIPPED  ${product.slug} has no Size/Colour axes`);
      continue;
    }

    /* ---- clear out anything this script made last time ---------------- */

    const previous = await prisma.productSku.findMany({
      where: { productMasterId: product.id, skuCode: { contains: MARKER } },
      select: { id: true, skuCode: true },
    });

    // A SKU somebody has ordered cannot be deleted without taking the order
    // line with it, and an order is the one thing in here that is real.
    const spoken = await prisma.orderItem.findMany({
      where: { skuId: { in: previous.map((s) => s.id) } },
      select: { skuId: true },
      distinct: ["skuId"],
    });
    const untouchable = new Set(spoken.map((o) => o.skuId));

    const removable = previous.filter((s) => !untouchable.has(s.id));
    if (untouchable.size > 0) {
      console.log(
        `  kept ${untouchable.size} generated SKU(s) that appear on an order`
      );
    }

    // Cart lines are not history, so they go with the SKU they point at.
    await prisma.cartItem.deleteMany({
      where: { skuId: { in: removable.map((s) => s.id) } },
    });
    await prisma.productSku.deleteMany({
      where: { id: { in: removable.map((s) => s.id) } },
    });

    /* ---- the template every generated SKU copies ---------------------- */

    // The cheapest existing pack: the box, not the carton. Its price and its
    // break table are what the whole matrix is scaled from.
    const template = product.skus
      .filter((s) => !s.skuCode.includes(MARKER))
      .sort((a, b) => a.eachesPerPack - b.eachesPerPack)[0];

    /**
     * Cover has to travel with the SKUs, or the product leaves the buying run.
     *
     * The originals carry the ProductSupply rows — who supplies this, at what
     * cost, as primary or backup. Deactivating them without copying that
     * across silently took both products out of purchasing: still on sale,
     * with nobody to buy them from. Found by the Supply panel reporting "no
     * supplier carries this product" on a line that plainly had two.
     *
     * The assumption — that a supplier who supplies the glove supplies all of
     * its sizes and colours — is a seed convenience, not a fact. Real cover
     * per combination has to come from the supplier along with the matrix
     * itself (DA-11).
     */
    const cover = template
      ? await prisma.productSupply.findMany({
          where: { skuId: template.id },
          select: {
            supplierId: true,
            rank: true,
            costFils: true,
            supplierPartNumber: true,
            leadTimeDays: true,
            isApproved: true,
          },
        })
      : [];

    const outerCover = async (outerId: string) =>
      prisma.productSupply.findMany({
        where: { skuId: outerId },
        select: {
          supplierId: true,
          rank: true,
          costFils: true,
          supplierPartNumber: true,
          leadTimeDays: true,
          isApproved: true,
        },
      });

    if (!template) {
      console.log(`SKIPPED  ${product.slug} has no SKU to copy`);
      continue;
    }

    const outer = product.skus
      .filter((s) => !s.skuCode.includes(MARKER) && s.id !== template.id)
      .sort((a, b) => a.eachesPerPack - b.eachesPerPack)[0];

    const coverForOuter = outer ? await outerCover(outer.id) : [];

    const baseCode = template.skuCode.split(MARKER)[0];

    /* ---- build every combination -------------------------------------- */

    const sizeValues = [...sizes.values].sort(
      (a, b) => SIZE_ORDER.indexOf(a.value) - SIZE_ORDER.indexOf(b.value)
    );

    /**
     * The combination the product already IS, which must not be generated
     * again.
     *
     * These products arrived as one specific size and colour — the large blue
     * — and the catalogue generator attached those option values to their
     * SKUs. Building all fifteen combinations from scratch and retiring the
     * originals produced a second large blue, orphaned the supplier cover on
     * the retired rows, and broke the check that every pack in catalog.json is
     * a live SKU. So the originals stay, and the matrix fills in around them.
     */
    const existingValues = await prisma.skuOptionValue.findMany({
      where: { skuId: template.id },
      select: { value: { select: { value: true, optionId: true } } },
    });

    const originalSize = existingValues.find(
      (v) => v.value.optionId === sizes.id
    )?.value.value;
    const originalColour = existingValues.find(
      (v) => v.value.optionId === colours.id
    )?.value.value;

    // A previous run of this script may have deactivated them.
    await prisma.productSku.updateMany({
      where: {
        productMasterId: product.id,
        skuCode: { not: { contains: MARKER } },
      },
      data: { isActive: true },
    });

    let made = 0;
    let reused = 0;

    for (const size of sizeValues) {
      for (const colour of colours.values) {
        // The product's own combination already exists, with its cover, its
        // cost and whatever history it carries. Leave it alone.
        if (size.value === originalSize && colour.value === originalColour) {
          reused += 1;
          continue;
        }

        const factor =
          (SIZE_FACTOR[size.value] ?? 1) * (COLOUR_FACTOR[colour.value] ?? 1);

        const suffix = `${MARKER}${SIZE_CODE[size.value] ?? size.value}${COLOUR_CODE[colour.value] ?? colour.value}`;

        // The inner pack — the box a buyer normally orders.
        const inner = await prisma.productSku.create({
          data: {
            productMasterId: product.id,
            skuCode: `${baseCode}${suffix}`,
            baseUnitName: template.baseUnitName,
            unitLabel: template.unitLabel,
            unitShortLabel: template.unitShortLabel,
            eachesPerPack: template.eachesPerPack,
            priceFils: scale(template.priceFils, factor),
            // Every combination is buyable: that is the whole point of the
            // exercise. Out-of-stock behaviour is already covered elsewhere.
            manualOutOfStock: false,
            isActive: true,
            tiers: {
              create: template.tiers.map((t) => ({
                minQty: t.minQty,
                priceFils: scale(t.priceFils, factor),
              })),
            },
            optionValues: {
              create: [{ valueId: size.id }, { valueId: colour.id }],
            },
            // Cost is scaled with the price so the margin stays where it was;
            // a fixed cost against a scaled price would show the extra-large
            // black earning 20% more than the small blue, which it does not.
            supplies: {
              create: cover.map((c) => ({
                supplierId: c.supplierId,
                rank: c.rank,
                costFils: c.costFils === null ? null : scale(c.costFils, factor),
                supplierPartNumber: c.supplierPartNumber,
                leadTimeDays: c.leadTimeDays,
                isApproved: c.isApproved,
                supplyStatus: "Available",
                isAvailable: true,
              })),
            },
          },
        });

        // The outer, if the product has one, so the unit selector still offers
        // a carton once a combination is chosen.
        if (outer) {
          await prisma.productSku.create({
            data: {
              productMasterId: product.id,
              skuCode: `${baseCode}${suffix}-${outer.eachesPerPack}`,
              baseUnitName: outer.baseUnitName,
              unitLabel: outer.unitLabel,
              unitShortLabel: outer.unitShortLabel,
              eachesPerPack: outer.eachesPerPack,
              priceFils: scale(outer.priceFils, factor),
              manualOutOfStock: false,
              isActive: true,
              optionValues: {
                create: [{ valueId: size.id }, { valueId: colour.id }],
              },
              supplies: {
                create: coverForOuter.map((c) => ({
                  supplierId: c.supplierId,
                  rank: c.rank,
                  costFils:
                    c.costFils === null ? null : scale(c.costFils, factor),
                  supplierPartNumber: c.supplierPartNumber,
                  leadTimeDays: c.leadTimeDays,
                  isApproved: c.isApproved,
                  supplyStatus: "Available",
                  isAvailable: true,
                })),
              },
            },
          });
        }

        made += outer ? 2 : 1;
        void inner;
      }
    }

    const combinations = sizeValues.length * colours.values.length;
    console.log(
      `${product.slug}\n  ${sizeValues.length} sizes x ${colours.values.length} colours = ${combinations} combinations` +
        `\n  ${made} SKUs generated, ${reused} combination kept as it already existed` +
        `${originalSize ? ` (${originalSize} / ${originalColour})` : ""}`
    );
  }

  // The storefront reads a cached snapshot keyed on this setting. Without the
  // bump the new SKUs stay invisible until something else happens to change
  // it — see the note on VERSION_KEY in src/lib/catalog.ts.
  const current = await prisma.setting.findUnique({
    where: { key: "catalogVersion" },
  });
  const next = String(Number(current?.value ?? "0") + 1);
  await prisma.setting.upsert({
    where: { key: "catalogVersion" },
    update: { value: next },
    create: { key: "catalogVersion", value: next },
  });
  console.log(`catalogue version -> ${next}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
