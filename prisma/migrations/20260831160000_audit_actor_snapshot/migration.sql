-- Who made the change, kept on the entry rather than only pointed at.
--
-- A disabled or deleted admin left actorUserId pointing at nothing, so the
-- trail answered "who changed this price" with "unknown" — for exactly the
-- person somebody is most likely to be going back through. The role is
-- snapshotted for the same reason: a person promoted last month did not have
-- those powers when they made a change in June.
ALTER TABLE "AuditLog" ADD COLUMN "actorName" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "actorRole" TEXT;

-- Existing rows keep what can still be recovered from the relation. Anything
-- whose actor has already gone stays null and reads as "no longer on record",
-- which is the truth rather than a guess.
UPDATE "AuditLog"
   SET "actorName" = (SELECT u."name" FROM "User" u WHERE u."id" = "AuditLog"."actorUserId"),
       "actorRole" = (SELECT u."role" FROM "User" u WHERE u."id" = "AuditLog"."actorUserId")
 WHERE "actorUserId" IS NOT NULL;

-- Filtering the trail by who did it, and by what kind of change.
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
