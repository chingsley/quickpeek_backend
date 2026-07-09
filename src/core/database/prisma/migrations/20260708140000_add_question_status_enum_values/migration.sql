-- Add ASSIGNED and EXPIRED to QuestionStatus enum.
-- These must run outside a transaction block (no BEGIN/COMMIT wrapping).
-- Prisma runs each migration in its own transaction by default; for this
-- migration we document that it must be applied first so later migrations
-- can reference the new values.
ALTER TYPE "QuestionStatus" ADD VALUE IF NOT EXISTS 'ASSIGNED';
ALTER TYPE "QuestionStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
