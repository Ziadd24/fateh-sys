-- =============================================================
-- Migration 005: Supplier Offers and Importance Level
-- =============================================================

ALTER TABLE location ADD COLUMN importance_level INTEGER DEFAULT 3;

CREATE TABLE supplier_offer (
    offer_id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES location(location_id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES product(product_id) ON DELETE CASCADE,
    price REAL NOT NULL,
    discount_percentage REAL NOT NULL DEFAULT 0,
    condition TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(supplier_id, product_id)
);

CREATE INDEX idx_supplier_offer_supplier ON supplier_offer (supplier_id);
CREATE INDEX idx_supplier_offer_product ON supplier_offer (product_id);
