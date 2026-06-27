-- =============================================================
-- Migration 005 Down
-- =============================================================

DROP TABLE IF EXISTS supplier_offer;

-- SQLite doesn't support DROP COLUMN easily before 3.35, but since this is just a down migration
-- we can use the newer ALTER TABLE DROP COLUMN if the version supports it, 
-- or leave the column since it's just an integer default 3.
-- We will just attempt to drop it, which works in SQLite 3.35+
ALTER TABLE location DROP COLUMN importance_level;
