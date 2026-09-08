-- The answer a customer is allowed to read, kept where they can find it again.
-- internalNotes stays ours; this is the reply itself.
ALTER TABLE "Enquiry" ADD COLUMN "replyToCustomer" TEXT;
ALTER TABLE "Enquiry" ADD COLUMN "answeredByName" TEXT;
