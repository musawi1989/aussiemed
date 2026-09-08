-- Delivery dockets on a purchase order.
--
-- A supplier who can send eight of ten today and the last two next week makes
-- two consignments. Until now the order carried one dispatchedAt, one courier
-- and one trackingNumber, so recording the second departure overwrote the
-- first — replacing the tracking number of a box already in transit with one
-- for a box that had not left.
--
-- Shaped exactly like Shipment/ShipmentLine on the customer side. Same problem
-- from the other end, so the same solution rather than a second vocabulary.

CREATE TABLE "PurchaseOrderDocket" (
    "id"              TEXT NOT NULL PRIMARY KEY,
    "purchaseOrderId" TEXT NOT NULL,
    "sequence"        INTEGER NOT NULL,
    "courier"         TEXT,
    "trackingNumber"  TEXT,
    "dispatchedAt"    DATETIME,
    "note"            TEXT,
    "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByName"   TEXT NOT NULL,
    "createdByRole"   TEXT NOT NULL,
    CONSTRAINT "PurchaseOrderDocket_purchaseOrderId_fkey"
        FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- Two consignments raised at the same moment fail rather than both becoming
-- docket 2. The sequence is read inside the transaction that writes the row.
CREATE UNIQUE INDEX "PurchaseOrderDocket_purchaseOrderId_sequence_key"
    ON "PurchaseOrderDocket" ("purchaseOrderId", "sequence");
CREATE INDEX "PurchaseOrderDocket_purchaseOrderId_idx"
    ON "PurchaseOrderDocket" ("purchaseOrderId");

CREATE TABLE "PurchaseOrderDocketLine" (
    "id"                  TEXT NOT NULL PRIMARY KEY,
    "docketId"            TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "qty"                 INTEGER NOT NULL,
    CONSTRAINT "PurchaseOrderDocketLine_docketId_fkey"
        FOREIGN KEY ("docketId") REFERENCES "PurchaseOrderDocket" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrderDocketLine_purchaseOrderLineId_fkey"
        FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- The same item twice in one consignment is a mistake in the form, not a
-- second delivery.
CREATE UNIQUE INDEX "PurchaseOrderDocketLine_docketId_purchaseOrderLineId_key"
    ON "PurchaseOrderDocketLine" ("docketId", "purchaseOrderLineId");
CREATE INDEX "PurchaseOrderDocketLine_purchaseOrderLineId_idx"
    ON "PurchaseOrderDocketLine" ("purchaseOrderLineId");

-- Orders already marked Dispatched under the old single-flag model keep that
-- status. They have no dockets, which reads correctly as "dispatched before
-- dockets existed" rather than being back-filled with an invented consignment
-- whose contents nobody recorded.
