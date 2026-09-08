import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { audit, requireAdmin, slugify, toFils, type Result } from "./admin";
import { invalidateCatalog } from "./catalog";
import { parseRows, type ParsedRow, type RowError } from "./catalogue-template";
import { readCatalogueWorkbook } from "./catalogue-workbook";

/**
 * Loading a catalogue spreadsheet — BE-04.
 *
 * Matching is on Item code, so re-uploading a corrected file updates the same
 * products instead of creating a second copy of the catalogue. That is what
 * makes the tool usable more than once, which is the whole reason it exists
 * rather than a one-off import script.
 *
 * Nothing is loaded partly. A row either lands complete — product, pack, price,
 * breaks, both supply relationships — or it is reported and left out, because
 * a half-loaded product is a product that looks fine in a list and breaks at
 * checkout.
 *
 * Products arrive as Draft. Making something buyable is a decision with a
 * person behind it, and DEC-18 already refuses to make a product Active
 * without a SKU and a category; a bulk upload must not become a way around it.
 */

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

export type ImportOutcome = {
  filename: string;
  rowsTotal: number;
  productsCreated: number;
  productsUpdated: number;
  skusCreated: number;
  skusUpdated: number;
  errors: RowError[];
};

/** Resolves "Medical Consumables > Gloves" to a category, creating as needed. */
async function resolveCategory(
  tx: Prisma.TransactionClient,
  path: string[]
): Promise<string | null> {
  let parentId: string | null = null;
  let categoryId: string | null = null;

  for (const [depth, name] of path.entries()) {
    const slug = slugify(name);
    // Slugs are unique across the whole tree — a rule the register records
    // under the old platform's failures, where one category could shadow
    // another. Reuse by slug rather than creating a second with the same one.
    const existing = await tx.category.findFirst({ where: { slug } });

    if (existing) {
      categoryId = existing.id;
      parentId = existing.id;
      continue;
    }

    // Both annotated on purpose. Without them TypeScript tries to infer the
    // created row's type from a variable this same loop assigns out of it, and
    // gives up with an implicit-any circularity.
    const parent: string | null = parentId;
    const created: { id: string } = await tx.category.create({
      data: { name, slug, parentId: parent, sortOrder: depth },
      select: { id: true },
    });
    categoryId = created.id;
    parentId = created.id;
  }

  return categoryId;
}

export async function importCatalogue(
  filename: string,
  bytes: Buffer
): Promise<Result<ImportOutcome>> {
  const actor = await requireAdmin("products");

  const sheet = await readCatalogueWorkbook(bytes);
  if (!sheet.ok) return fail(sheet.error);
  if (sheet.rows.length === 0) {
    return fail("That sheet has a header but no rows under it.");
  }

  const { rows, errors } = parseRows(sheet.rows);

  /* Suppliers must already exist. Creating them from a spreadsheet would mean
     inventing an order email and a lead time nobody agreed. */
  const suppliers = await db.supplier.findMany({
    select: { id: true, companyName: true },
  });
  const supplierByName = new Map(
    suppliers.map((s) => [s.companyName.toLowerCase(), s.id])
  );

  const usable: ParsedRow[] = [];
  for (const row of rows) {
    const primaryId = supplierByName.get(row.primarySupplier.toLowerCase());
    if (!primaryId) {
      errors.push({
        rowNumber: row.rowNumber,
        column: "Primary supplier",
        message: `"${row.primarySupplier}" is not a supplier on the site. Add them in the admin first.`,
      });
      continue;
    }
    if (row.backupSupplier && !supplierByName.get(row.backupSupplier.toLowerCase())) {
      errors.push({
        rowNumber: row.rowNumber,
        column: "Backup supplier",
        message: `"${row.backupSupplier}" is not a supplier on the site. Add them in the admin first.`,
      });
      continue;
    }
    usable.push(row);
  }

  const outcome: ImportOutcome = {
    filename,
    rowsTotal: sheet.rows.length,
    productsCreated: 0,
    productsUpdated: 0,
    skusCreated: 0,
    skusUpdated: 0,
    errors,
  };

  const job = await db.bulkUploadJob.create({
    data: {
      uploadedBy: actor.id,
      filename,
      status: "Processing",
      rowsTotal: sheet.rows.length,
    },
  });

  for (const row of usable) {
    await db.$transaction(async (tx) => {
      const categoryId = await resolveCategory(tx, row.categoryPath);

      const brandId = row.brand
        ? (
            await tx.brand.upsert({
              where: { slug: slugify(row.brand) },
              update: { name: row.brand },
              create: { name: row.brand, slug: slugify(row.brand) },
            })
          ).id
        : null;

      const primarySupplierId = supplierByName.get(row.primarySupplier.toLowerCase())!;
      const backupSupplierId = row.backupSupplier
        ? supplierByName.get(row.backupSupplier.toLowerCase())!
        : null;

      /* The SKU is the identity: find its product through it, so a renamed
         product still updates in place rather than forking. */
      const existingSku = await tx.productSku.findUnique({
        where: { skuCode: row.skuCode },
        select: { id: true, productMasterId: true },
      });

      let productId: string;

      if (existingSku) {
        productId = existingSku.productMasterId;
        await tx.productMaster.update({
          where: { id: productId },
          data: {
            name: row.name,
            description: row.description,
            brandId,
            taxClass: row.taxClass,
            supplierId: primarySupplierId,
          },
        });
        outcome.productsUpdated++;
      } else {
        const bySlug = await tx.productMaster.findFirst({
          where: { slug: slugify(`${row.name}`) },
          select: { id: true },
        });

        if (bySlug) {
          productId = bySlug.id;
          // Update it too. The row describes this product, and leaving the
          // fields alone here but updating them on the branch above would mean
          // the same sheet behaved differently depending on whether the pack
          // happened to exist already.
          await tx.productMaster.update({
            where: { id: productId },
            data: {
              name: row.name,
              description: row.description,
              brandId,
              taxClass: row.taxClass,
              supplierId: primarySupplierId,
            },
          });
          outcome.productsUpdated++;
        } else {
          const created = await tx.productMaster.create({
            data: {
              name: row.name,
              // Never renamed later: the slug is the address, and a product
              // that has been linked to keeps working — DEC-17.
              slug: slugify(row.name),
              description: row.description,
              brandId,
              taxClass: row.taxClass,
              supplierId: primarySupplierId,
              status: "Draft",
              createdBy: actor.id,
            },
          });
          productId = created.id;
          outcome.productsCreated++;
        }
      }

      if (categoryId) {
        const linked = await tx.productCategory.findFirst({
          where: { productMasterId: productId, categoryId },
        });
        if (!linked) {
          await tx.productCategory.create({
            data: { productMasterId: productId, categoryId },
          });
        }
      }

      const skuData = {
        productMasterId: productId,
        skuCode: row.skuCode,
        unitLabel: row.unitLabel,
        unitShortLabel: row.unitShortLabel,
        eachesPerPack: row.eachesPerPack,
        priceFils: toFils(row.priceAED),
        isActive: true,
      };

      const sku = existingSku
        ? await tx.productSku.update({ where: { id: existingSku.id }, data: skuData })
        : await tx.productSku.create({ data: skuData });

      if (existingSku) outcome.skusUpdated++;
      else outcome.skusCreated++;

      /* Breaks are replaced as a set — they only make sense together, and
         merging old rows with new would leave a ladder that never existed. */
      await tx.priceTier.deleteMany({ where: { skuId: sku.id } });
      for (const level of row.breaks) {
        await tx.priceTier.create({
          data: { skuId: sku.id, minQty: level.minQty, priceFils: toFils(level.priceAED) },
        });
      }

      /* Supply. Written by rank, so changing who is primary moves the row
         rather than leaving two primaries behind. */
      await tx.productSupply.deleteMany({ where: { skuId: sku.id } });
      await tx.productSupply.create({
        data: {
          skuId: sku.id,
          supplierId: primarySupplierId,
          rank: "Primary",
          costFils: row.costAED === null ? null : toFils(row.costAED),
          supplierPartNumber: row.primaryPartNumber,
        },
      });
      if (backupSupplierId) {
        await tx.productSupply.create({
          data: {
            skuId: sku.id,
            supplierId: backupSupplierId,
            rank: "Backup",
            costFils: row.backupCostAED === null ? null : toFils(row.backupCostAED),
            supplierPartNumber: row.backupPartNumber,
          },
        });
      }

      await tx.bulkUploadRow.create({
        data: {
          jobId: job.id,
          rowNumber: row.rowNumber,
          outcome: existingSku ? "Updated" : "Created",
          productMasterId: productId,
        },
      });
    });
  }

  for (const error of outcome.errors) {
    await db.bulkUploadRow.create({
      data: {
        jobId: job.id,
        rowNumber: error.rowNumber,
        outcome: "Error",
        message: `${error.column}: ${error.message}`,
      },
    });
  }

  await db.bulkUploadJob.update({
    where: { id: job.id },
    data: {
      status: "Completed",
      rowsCreated: outcome.skusCreated,
      rowsSkipped: 0,
      rowsErrored: outcome.errors.length,
      completedAt: new Date(),
    },
  });

  await audit(actor, "catalogue.import", "BulkUploadJob", job.id, null, {
    filename,
    rowsTotal: outcome.rowsTotal,
    created: outcome.skusCreated,
    updated: outcome.skusUpdated,
    errors: outcome.errors.length,
  });

  await invalidateCatalog();
  return ok(outcome);
}
