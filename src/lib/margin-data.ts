import "server-only";

import { db } from "./db";
import { requireAdmin } from "./admin";
import {
  lineMargin,
  marginOf,
  totalMargin,
  type Margin,
  type MarginTotal,
} from "./margin";

/**
 * Reading margin out of the database.
 *
 * Every function here calls requireAdmin first, and none of them is imported
 * by anything under (shop) or business-portal. That is the whole guard: cost
 * is not filtered out of a shared query, it is never fetched by one. A
 * supplier who can see the markup on their own goods is a commercial problem,
 * and the reliable way to prevent it is to have no code path that could.
 */

/* ------------------------------------------------------------------ *
 * What a product makes
 * ------------------------------------------------------------------ */

export type SupplyCost = {
  rank: string;
  supplierName: string;
  costFils: number | null;
  isAvailable: boolean;
  supplierPartNumber: string | null;
};

export type SkuMargin = {
  skuId: string;
  skuCode: string;
  unitLabel: string;
  isActive: boolean;
  sellFils: number;
  supplies: SupplyCost[];
  /**
   * Against the supplier we would actually buy from today — the primary
   * unless it cannot supply, in which case the backup. Quoting margin against
   * a supplier we are not using would describe a trade that is not happening.
   */
  margin: Margin;
  /** Which supplier that figure is against, so it is never ambiguous. */
  basis: string | null;
};

export async function productMargins(productId: string): Promise<SkuMargin[]> {
  await requireAdmin();

  const skus = await db.productSku.findMany({
    where: { productMasterId: productId },
    orderBy: [{ isActive: "desc" }, { eachesPerPack: "asc" }],
    select: {
      id: true,
      skuCode: true,
      unitLabel: true,
      isActive: true,
      priceFils: true,
      supplies: {
        /*
         * COVER ONLY, like the buying run. A null rank is a supplier offering
         * an item, not supplying it: they have no agreed cost with us on it
         * and including them would put a stranger's figure on a margin report.
         */
        where: { rank: { not: null } },
        orderBy: { rank: "asc" },
        select: {
          rank: true,
          costFils: true,
          isAvailable: true,
          supplierPartNumber: true,
          supplier: { select: { companyName: true, isAvailable: true } },
        },
      },
    },
  });

  return skus.map((sku) => {
    const supplies: SupplyCost[] = sku.supplies.map((supply) => ({
      // Non-null by the where above; the report has no row for an offer.
      rank: supply.rank ?? "",
      supplierName: supply.supplier.companyName,
      costFils: supply.costFils,
      // Both switches matter: the company can be off, or just this item.
      isAvailable: supply.isAvailable && supply.supplier.isAvailable,
      supplierPartNumber: supply.supplierPartNumber,
    }));

    // The same order of preference the purchasing run uses, so the margin
    // shown is the margin on the next order rather than on a hypothetical one.
    const buyingFrom =
      supplies.find((s) => s.rank === "Primary" && s.isAvailable) ??
      supplies.find((s) => s.isAvailable) ??
      supplies.find((s) => s.rank === "Primary") ??
      supplies[0] ??
      null;

    return {
      skuId: sku.id,
      skuCode: sku.skuCode,
      unitLabel: sku.unitLabel,
      isActive: sku.isActive,
      sellFils: sku.priceFils,
      supplies,
      margin: marginOf(sku.priceFils, buyingFrom?.costFils ?? null),
      basis: buyingFrom
        ? `${buyingFrom.rank.toLowerCase()} · ${buyingFrom.supplierName}`
        : null,
    };
  });
}

/* ------------------------------------------------------------------ *
 * What an order made
 * ------------------------------------------------------------------ */

export type OrderLineMargin = {
  orderItemId: string;
  name: string;
  skuCode: string;
  qty: number;
  lineTotalFils: number;
  costFils: number | null;
  marginFils: number | null;
  marginPercent: number | null;
  losing: boolean;
  complete: boolean;
  qtyOutstanding: number;
};

export type OrderMargin = {
  lines: OrderLineMargin[];
  total: MarginTotal;
};

/**
 * Realised margin on one order.
 *
 * Costs come from the purchase order lines the units were actually allocated
 * from, not from the catalogue: what a product is listed at costing and what
 * this particular order cost can differ, and only the second is a real figure.
 * Lines still waiting on goods report no margin at all rather than one derived
 * from the part that has arrived.
 */
export async function orderMargin(reference: string): Promise<OrderMargin | null> {
  await requireAdmin();

  const order = await db.order.findUnique({
    where: { reference },
    select: {
      items: {
        select: {
          id: true,
          nameSnapshot: true,
          skuCodeSnapshot: true,
          qty: true,
          lineTotalFils: true,
          allocations: {
            select: {
              qty: true,
              purchaseOrderLine: { select: { unitCostFilsSnapshot: true } },
            },
          },
        },
      },
    },
  });

  if (!order) return null;

  const lines: OrderLineMargin[] = order.items.map((item) => {
    const margin = lineMargin(
      item.lineTotalFils,
      item.qty,
      item.allocations.map((a) => ({
        qty: a.qty,
        unitCostFilsSnapshot: a.purchaseOrderLine.unitCostFilsSnapshot,
      }))
    );

    return {
      orderItemId: item.id,
      name: item.nameSnapshot,
      skuCode: item.skuCodeSnapshot,
      qty: item.qty,
      lineTotalFils: item.lineTotalFils,
      costFils: margin.costFils,
      marginFils: margin.marginFils,
      marginPercent: margin.marginPercent,
      losing: margin.losing,
      complete: margin.complete,
      qtyOutstanding: margin.qtyOutstanding,
    };
  });

  return {
    lines,
    total: totalMargin(
      lines.map((line) => ({
        sellFils: line.lineTotalFils,
        costFils: line.costFils,
      }))
    ),
  };
}
