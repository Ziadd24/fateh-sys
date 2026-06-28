-- =============================================================
-- Migration 004: Add is_ignored to stock_level (DOWN)
-- =============================================================

DROP VIEW IF EXISTS vw_low_stock;

-- Restore previous view
CREATE VIEW vw_low_stock AS
SELECT
    sl.location_id,
    l.name   AS location_name,
    l.type   AS location_type,
    sl.batch_no,
    p.sku,
    p.name   AS product_name,
    sl.quantity,
    sl.reorder_point,
    b.expiry_date
FROM stock_level sl
JOIN batch    b ON b.batch_no   = sl.batch_no
JOIN product  p ON p.product_id = b.product_id
JOIN location l ON l.location_id = sl.location_id
WHERE sl.quantity <= sl.reorder_point AND (sl.quantity > 0 OR sl.reorder_point > 0);

-- SQLite does not support dropping columns easily, but since 3.35.0 it supports DROP COLUMN.
ALTER TABLE stock_level DROP COLUMN is_ignored;
