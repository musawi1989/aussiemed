-- Remove the admin Inbox.
--
-- It recorded that an order had arrived, which the orders list already says
-- better, and the three events that would have justified a separate feed —
-- an enquiry, a quote request, a failed send — were declared but never fired.
-- Eighteen rows, all of them duplicates of records that live elsewhere:
-- the orders, the account changes and the purchase orders themselves are
-- untouched, as is AuditLog.
DROP TABLE "Notification";
