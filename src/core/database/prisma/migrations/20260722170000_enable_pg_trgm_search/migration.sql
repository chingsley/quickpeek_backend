-- Enable the pg_trgm extension for fuzzy trigram matching (ILIKE acceleration + similarity() / <-> operator).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Lower the similarity threshold so mild typos still qualify when using the % operator.
-- (We primarily use similarity() / <-> for ranking, but this keeps ILIKE/% usable too.)
-- NOTE: set_limit() affects the current transaction only; use a GUC via SET for session-wide effect.
SET pg_trgm.similarity_threshold = 0.1;

-- GIN trigram indexes accelerate ILIKE/% and similarity-based lookups on text columns.
-- Use gin_trgm_ops so both LIKE and trigram-distance queries can use the index.
CREATE INDEX IF NOT EXISTS "questions_title_trgm_idx"        ON "questions" USING gin ("title"               gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "questions_detail_trgm_idx"       ON "questions" USING gin ("detail"              gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "questions_acceptance_trgm_idx"   ON "questions" USING gin ("acceptanceCriteria"  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "users_name_trgm_idx"             ON "users"     USING gin ("name"                gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "users_username_trgm_idx"         ON "users"     USING gin ("username"            gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "users_email_trgm_idx"            ON "users"     USING gin ("email"               gin_trgm_ops);
