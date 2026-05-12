-- Fix: Remove UNIQUE constraint from email to support soft delete re-creation
-- Application-level uniqueness check in users.service.ts enforces email uniqueness
-- among active users (deletedAt IS NULL) only.

-- Drop the old unique index on email
DROP INDEX IF EXISTS "users_email_key";

-- Create a regular index on email for query performance
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users"("email");
