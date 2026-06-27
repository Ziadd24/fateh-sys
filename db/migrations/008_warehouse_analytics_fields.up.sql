-- =============================================================
-- Migration 008: Warehouse Analytics Fields
-- =============================================================

-- Product enhancements
ALTER TABLE product ADD COLUMN unit_cost REAL NOT NULL DEFAULT 0.0;
ALTER TABLE product ADD COLUMN storage_condition TEXT NOT NULL DEFAULT 'Room Temperature';

-- Location enhancements
ALTER TABLE location ADD COLUMN max_capacity INTEGER NOT NULL DEFAULT 50000;
