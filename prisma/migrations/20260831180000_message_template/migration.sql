-- An admin's own wording for one of the automatic emails.
--
-- The built-in text stays the default. A row here replaces the subject and
-- body of one message outright, rendered from the same context the typed
-- builder was given, so the placeholders resolve to the values the built-in
-- would have used. Deleting the row puts the tested original back.
--
-- Deliberately unvalidated, at the client's instruction — see DEC-40.
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedByName" TEXT NOT NULL
);
-- One wording per message at a time.
CREATE UNIQUE INDEX "MessageTemplate_kind_key" ON "MessageTemplate"("kind");
