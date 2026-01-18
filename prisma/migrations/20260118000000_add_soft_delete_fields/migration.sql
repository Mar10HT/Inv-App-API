-- Add soft delete fields to users table
ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Add soft delete fields to inventory_items table
ALTER TABLE "inventory_items" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Create index on users.deletedAt
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- Create index on inventory_items.deletedAt
CREATE INDEX "inventory_items_deletedAt_idx" ON "inventory_items"("deletedAt");
