-- =============================================================
-- Migration 003: Rename Exporter to Supplier
-- =============================================================

PRAGMA foreign_keys=off;

-- 1. Create new location table with updated CHECK constraint
CREATE TABLE new_location (
    location_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    type         TEXT NOT NULL CHECK(type IN ('Pharmacy', 'Warehouse', 'Supplier')),
    created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Copy data, renaming Exporter to Supplier
INSERT INTO new_location (location_id, name, type, created_at)
SELECT location_id, name, 
       CASE WHEN type = 'Exporter' THEN 'Supplier' ELSE type END, 
       created_at
FROM location;

-- 3. Drop Views that depend on location
DROP VIEW IF EXISTS vw_low_stock;
DROP VIEW IF EXISTS vw_exporter_inventory;
DROP VIEW IF EXISTS vw_supplier_inventory;
DROP VIEW IF EXISTS vw_near_expiry;

-- 4. Drop old, rename new
DROP TABLE location;
ALTER TABLE new_location RENAME TO location;

-- 5. Recreate Views
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

CREATE VIEW vw_supplier_inventory AS
SELECT
    l.name   AS supplier_name,
    p.sku,
    p.name   AS product_name,
    b.batch_no,
    b.expiry_date,
    sl.quantity
FROM stock_level sl
JOIN batch    b ON b.batch_no    = sl.batch_no
JOIN product  p ON p.product_id  = b.product_id
JOIN location l ON l.location_id = sl.location_id
WHERE l.type = 'Supplier';

CREATE VIEW vw_near_expiry AS
SELECT
    b.batch_no,
    p.sku,
    p.name       AS product_name,
    b.expiry_date,
    CAST(julianday(b.expiry_date) - julianday('now') AS INTEGER) AS days_until_expiry,
    sl.location_id,
    l.name       AS location_name,
    sl.quantity
FROM batch b
JOIN product     p  ON p.product_id  = b.product_id
JOIN stock_level sl ON sl.batch_no   = b.batch_no
JOIN location    l  ON l.location_id = sl.location_id
WHERE b.expiry_date <= date('now', '+4 months')
  AND b.expiry_date >  date('now')
  AND sl.quantity > 0
ORDER BY b.expiry_date ASC;

PRAGMA foreign_keys=on;
