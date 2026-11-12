-- =============================================
-- Create first admin (Manager) — SUPERSEDED, intentionally empty.
-- =============================================
-- This file used to insert a manager with a bcrypt hash and a documented
-- clear-text password, and its ON CONFLICT clause reset that account's
-- password on every run. Both are still in git history: treat that
-- credential as leaked and rotate it on every database where the account
-- exists.
--
-- Create the first manager of an instance instead with the signed
-- provisioning endpoint (no password ever travels in clear; the manager
-- receives a one-time reset link):
--
--   POST /api/instance/bootstrap   {"email": "...", "name": "..."}
--
-- See docs/WHITE_LABEL.md and prisma/README.md.
-- =============================================

SELECT 'seed-admin.sql is superseded: use POST /api/instance/bootstrap (docs/WHITE_LABEL.md)' AS notice;
