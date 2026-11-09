-- What the player last saw of their ticket (a difference is an unread change in "My reports").
ALTER TABLE "Ticket" ADD COLUMN "seenStatus" TEXT NOT NULL DEFAULT 'new';
ALTER TABLE "Ticket" ADD COLUMN "seenType" TEXT NOT NULL DEFAULT 'bug';
-- existing tickets: nothing is unread
UPDATE "Ticket" SET "seenStatus" = "status", "seenType" = "type";
CREATE INDEX "Ticket_userId_idx" ON "Ticket"("userId");
