-- =============================================================
-- Migration 010: Fix Foreign Key Constraints for Cascading Deletes
-- =============================================================

-- 1. Recreate stock_movement with proper constraints
CREATE TABLE stock_movement_new (
    movement_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_no        TEXT NOT NULL REFERENCES batch(batch_no) ON DELETE RESTRICT,
    from_location   INTEGER REFERENCES location(location_id) ON DELETE SET NULL,
    to_location     INTEGER REFERENCES location(location_id) ON DELETE SET NULL,
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    movement        TEXT NOT NULL CHECK(movement IN ('IN', 'OUT', 'TRANSFER', 'ADJUSTMENT')),
    reference_note  TEXT,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (movement = 'IN'         AND from_location IS NULL AND to_location IS NOT NULL) OR
        (movement = 'OUT'        AND from_location IS NOT NULL AND to_location IS NULL) OR
        (movement = 'TRANSFER'   AND from_location IS NOT NULL AND to_location IS NOT NULL) OR
        (movement = 'ADJUSTMENT' AND (from_location IS NOT NULL OR to_location IS NOT NULL))
    )
);

INSERT INTO stock_movement_new SELECT * FROM stock_movement;
DROP TABLE stock_movement;
ALTER TABLE stock_movement_new RENAME TO stock_movement;

-- 2. Recreate supplier_offer with cascade
CREATE TABLE supplier_offer_new (
    offer_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES location(location_id) ON DELETE CASCADE,
    product_id  INTEGER NOT NULL REFERENCES product(product_id) ON DELETE CASCADE,
    price       REAL NOT NULL,
    condition   TEXT,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(supplier_id, product_id)
);

INSERT INTO supplier_offer_new SELECT * FROM supplier_offer;
DROP TABLE supplier_offer;
ALTER TABLE supplier_offer_new RENAME TO supplier_offer;

-- 3. Recreate supplier_price_history with cascade
CREATE TABLE supplier_price_history_new (
    history_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES location(location_id) ON DELETE CASCADE,
    product_id  INTEGER NOT NULL REFERENCES product(product_id) ON DELETE CASCADE,
    price       REAL NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO supplier_price_history_new SELECT * FROM supplier_price_history;
DROP TABLE supplier_price_history;
ALTER TABLE supplier_price_history_new RENAME TO supplier_price_history;
