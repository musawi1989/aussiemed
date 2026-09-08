-- Bulk buy requests: what the quote request became.
--
-- Two states instead of four. New | Quoted described what we had done and left
-- nobody able to say a request was finished; Pending | Completed says whether
-- it is still open, which is what both the buyer and the operator want to know.

ALTER TABLE "QuoteRequest" ADD COLUMN "organisationId" TEXT REFERENCES "Organisation"("id");
ALTER TABLE "QuoteRequest" ADD COLUMN "completedAt" DATETIME;
ALTER TABLE "QuoteRequest" ADD COLUMN "completedByName" TEXT;

-- Existing rows, mapped rather than reset. A request already answered and
-- closed stays closed; anything still in play becomes Pending, which is the
-- safe direction: a finished request wrongly shown as open costs a glance,
-- an open one wrongly shown as finished is a customer nobody answers.
UPDATE "QuoteRequest" SET "status" = 'Completed' WHERE "status" IN ('Closed', 'Answered');
UPDATE "QuoteRequest" SET "status" = 'Pending' WHERE "status" NOT IN ('Completed');

-- Backfill the account from the person who raised it, so existing requests
-- appear on the right buyer panel instead of nobody's.
UPDATE "QuoteRequest"
   SET "organisationId" = (
     SELECT "organisationId" FROM "User" WHERE "User"."id" = "QuoteRequest"."userId"
   )
 WHERE "userId" IS NOT NULL;

CREATE INDEX "QuoteRequest_organisationId_idx" ON "QuoteRequest"("organisationId");
CREATE INDEX "QuoteRequest_status_idx" ON "QuoteRequest"("status");
