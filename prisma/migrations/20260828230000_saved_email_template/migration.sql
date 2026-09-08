-- Templates written here rather than in code, for the compose form.
CREATE TABLE "SavedEmailTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "needsOrder" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedByName" TEXT NOT NULL
);
CREATE UNIQUE INDEX "SavedEmailTemplate_audience_name_key" ON "SavedEmailTemplate"("audience", "name");
