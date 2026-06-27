-- =============================================================
-- Migration 009: Importer Analytics
-- =============================================================

DROP TRIGGER IF EXISTS trg_log_price_history_update;
DROP TRIGGER IF EXISTS trg_log_price_history_insert;

DROP TABLE IF EXISTS supplier_price_history;

-- Note: ALTER TABLE DROP COLUMN is supported in SQLite 3.35.0+
ALTER TABLE order_request DROP COLUMN total_cost;
ALTER TABLE order_request DROP COLUMN accuracy_score;
ALTER TABLE order_request DROP COLUMN fulfilled_at;
ALTER TABLE order_request DROP COLUMN expected_delivery_date;
