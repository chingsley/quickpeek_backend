-- Accelerate fuzzy/substring search on question addresses.
CREATE INDEX IF NOT EXISTS "questions_address_trgm_idx" ON "questions" USING gin ("address" gin_trgm_ops);
