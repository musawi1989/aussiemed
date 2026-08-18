-- CreateTable
CREATE TABLE "SignInAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "address" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "SignInAttempt_key_at_idx" ON "SignInAttempt"("key", "at");

-- CreateIndex
CREATE INDEX "SignInAttempt_address_at_idx" ON "SignInAttempt"("address", "at");

-- CreateIndex
CREATE INDEX "SignInAttempt_at_idx" ON "SignInAttempt"("at");
