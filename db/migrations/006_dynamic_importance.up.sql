-- =============================================================
-- Migration 006: Dynamic Importance & Remove Discount
-- =============================================================

PRAGMA foreign_keys=off;

-- Recreate supplier_offer without discount_percentage
CREATE TABLE supplier_offer_new (
    offer_id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES location(location_id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES product(product_id) ON DELETE CASCADE,
    price REAL NOT NULL,
    condition TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(supplier_id, product_id)
);

INSERT INTO supplier_offer_new (offer_id, supplier_id, product_id, price, condition, created_at)
SELECT offer_id, supplier_id, product_id, price, condition, created_at FROM supplier_offer;

DROP TABLE supplier_offer;
ALTER TABLE supplier_offer_new RENAME TO supplier_offer;

CREATE INDEX idx_supplier_offer_supplier ON supplier_offer (supplier_id);
CREATE INDEX idx_supplier_offer_product ON supplier_offer (product_id);

PRAGMA foreign_keys=on;
