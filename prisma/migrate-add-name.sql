-- Add optional name column to loans and transfer_requests
ALTER TABLE "loans" ADD COLUMN "name" TEXT;
ALTER TABLE "transfer_requests" ADD COLUMN "name" TEXT;
