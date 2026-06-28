-- =============================================================
-- Migration 005: Trigger to reset is_ignored on quantity update
-- =============================================================

CREATE TRIGGER trg_stock_level_qty_update
AFTER UPDATE OF quantity ON stock_level
FOR EACH ROW
WHEN NEW.quantity != OLD.quantity AND OLD.is_ignored = 1
BEGIN
    UPDATE stock_level SET is_ignored = 0 WHERE location_id = NEW.location_id AND batch_no = NEW.batch_no;
END;
