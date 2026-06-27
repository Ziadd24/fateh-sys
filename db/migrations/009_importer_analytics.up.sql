-- =============================================================
-- Migration 009: Importer Analytics
-- =============================================================

-- 1. Order Request Tracking Enhancements
ALTER TABLE order_request ADD COLUMN expected_delivery_date TEXT;
ALTER TABLE order_request ADD COLUMN fulfilled_at TEXT;
ALTER TABLE order_request ADD COLUMN accuracy_score INTEGER CHECK(accuracy_score BETWEEN 0 AND 100);
ALTER TABLE order_request ADD COLUMN total_cost REAL DEFAULT 0.0;

-- 2. Price History Tracking
CREATE TABLE supplier_price_history (
    history_id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES location(location_id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES product(product_id) ON DELETE CASCADE,
    price REAL NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Trigger to automatically log price changes when supplier_offer is inserted
CREATE TRIGGER trg_log_price_history_insert
AFTER INSERT ON supplier_offer
BEGIN
    INSERT INTO supplier_price_history (supplier_id, product_id, price)
    VALUES (NEW.supplier_id, NEW.product_id, NEW.price);
END;

-- Trigger to automatically log price changes when supplier_offer is updated
CREATE TRIGGER trg_log_price_history_update
AFTER UPDATE OF price ON supplier_offer
WHEN OLD.price <> NEW.price
BEGIN
    INSERT INTO supplier_price_history (supplier_id, product_id, price)
    VALUES (NEW.supplier_id, NEW.product_id, NEW.price);
END;

-- 3. Seed some mock historical prices for existing offers to power the chart
INSERT INTO supplier_price_history (supplier_id, product_id, price, recorded_at)
SELECT supplier_id, product_id, price * 1.1, date('now', '-30 days') FROM supplier_offer;

INSERT INTO supplier_price_history (supplier_id, product_id, price, recorded_at)
SELECT supplier_id, product_id, price * 1.05, date('now', '-15 days') FROM supplier_offer;

INSERT INTO supplier_price_history (supplier_id, product_id, price, recorded_at)
SELECT supplier_id, product_id, price, date('now') FROM supplier_offer;

-- 4. Seed some mock fulfilled orders for importers to power the leaderboard
UPDATE order_request 
SET 
    fulfilled_at = date(created_at, '+5 days'), 
    accuracy_score = ABS(RANDOM() % 21) + 80, -- random 80-100
    total_cost = ABS(RANDOM() % 10000) + 1000
WHERE status = 'FULFILLED' AND supplier_id IS NOT NULL;
