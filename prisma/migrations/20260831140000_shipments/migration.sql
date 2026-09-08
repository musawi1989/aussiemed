-- Splitting an order into the batches it physically leaves in.
--
-- Order.trackingNumber holds exactly one consignment, so the second despatch
-- against an order either overwrote the first or was never recorded. Those
-- columns are deliberately left in place: every order placed before today has
-- its courier and tracking there and nowhere else.
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "courier" TEXT,
    "trackingNumber" TEXT,
    "dispatchedAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByName" TEXT NOT NULL,
    CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- The numbering guarantee. Two people despatching the same order at once must
-- not both write shipment 2 and print it on two different boxes.
CREATE UNIQUE INDEX "Shipment_orderId_sequence_key" ON "Shipment"("orderId", "sequence");
CREATE INDEX "Shipment_orderId_idx" ON "Shipment"("orderId");

-- Quantity per line, not a whole-line flag: sixty ordered, forty in, forty go.
CREATE TABLE "ShipmentLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    CONSTRAINT "ShipmentLine_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShipmentLine_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ShipmentLine_shipmentId_orderItemId_key" ON "ShipmentLine"("shipmentId", "orderItemId");
CREATE INDEX "ShipmentLine_orderItemId_idx" ON "ShipmentLine"("orderItemId");
