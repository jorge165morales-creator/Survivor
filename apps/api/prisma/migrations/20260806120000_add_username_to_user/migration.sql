-- Add nullable first so existing rows can be backfilled before the
-- NOT NULL + UNIQUE constraints are applied below.
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Backfill from the email local-part, deduping collisions by appending a
-- numeric suffix (only matters if two existing users share an email
-- local-part, e.g. jorge@gmail.com and jorge@yahoo.com).
WITH base AS (
  SELECT id, LOWER(REGEXP_REPLACE(SPLIT_PART(email, '@', 1), '[^a-zA-Z0-9_]', '', 'g')) AS base_username
  FROM "User"
),
numbered AS (
  SELECT id, base_username, ROW_NUMBER() OVER (PARTITION BY base_username ORDER BY id) AS rn
  FROM base
)
UPDATE "User" u
SET "username" = CASE WHEN n.rn = 1 THEN n.base_username ELSE n.base_username || n.rn::text END
FROM numbered n
WHERE u.id = n.id;

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
