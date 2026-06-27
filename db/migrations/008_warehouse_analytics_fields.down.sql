-- =============================================================
-- Migration 008: Warehouse Analytics Fields
-- =============================================================

-- Note: ALTER TABLE DROP COLUMN is supported in SQLite 3.35.0+
ALTER TABLE product DROP COLUMN storage_condition;
ALTER TABLE product DROP COLUMN unit_cost;

ALTER TABLE location DROP COLUMN max_capacity;
