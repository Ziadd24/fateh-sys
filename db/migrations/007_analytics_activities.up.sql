-- =============================================================
-- Migration 007: Analytics Activities
-- =============================================================

-- 1. Supervisor Notes
CREATE TABLE supervisor_note (
    note_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id  INTEGER NOT NULL REFERENCES location(location_id) ON DELETE CASCADE,
    author       TEXT NOT NULL,
    content      TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Order Requests
CREATE TABLE order_request (
    request_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    pharmacy_id    INTEGER NOT NULL REFERENCES location(location_id) ON DELETE CASCADE,
    supplier_id    INTEGER REFERENCES location(location_id),
    status         TEXT NOT NULL CHECK(status IN ('PENDING', 'APPROVED', 'FULFILLED', 'CANCELLED')),
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Inventory Discrepancies
CREATE TABLE inventory_discrepancy (
    discrepancy_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id       INTEGER NOT NULL REFERENCES location(location_id) ON DELETE CASCADE,
    batch_no          TEXT REFERENCES batch(batch_no),
    expected_quantity INTEGER NOT NULL,
    actual_quantity   INTEGER NOT NULL,
    reason            TEXT,
    is_resolved       INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_request_pharmacy ON order_request(pharmacy_id);
CREATE INDEX idx_order_request_status ON order_request(status);
