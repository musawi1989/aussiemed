-- The answer to a quote request, and the fact that it was sent.
--
-- The bulk-buy enquiry's replyToCustomer is a note about a conversation held
-- somewhere else. This one IS the conversation: these words are emailed to
-- contactEmail as written, so they are kept in order to say what was quoted
-- and to be able to send the same thing again.
ALTER TABLE "QuoteRequest" ADD COLUMN "replyToCustomer" TEXT;
ALTER TABLE "QuoteRequest" ADD COLUMN "answeredByName" TEXT;
ALTER TABLE "QuoteRequest" ADD COLUMN "answeredAt" DATETIME;
