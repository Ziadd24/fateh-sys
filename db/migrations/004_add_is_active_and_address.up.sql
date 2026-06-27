-- =============================================================
-- Migration 004: Add missing columns to location
-- =============================================================
ALTER TABLE location ADD COLUMN address TEXT;
ALTER TABLE location ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
