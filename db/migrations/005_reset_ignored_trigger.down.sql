-- =============================================================
-- Migration 005: Trigger to reset is_ignored on quantity update (DOWN)
-- =============================================================

DROP TRIGGER IF EXISTS trg_stock_level_qty_update;
