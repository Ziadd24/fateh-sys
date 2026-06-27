-- =============================================================
-- Migration 007: Analytics Activities
-- =============================================================

DROP INDEX IF EXISTS idx_order_request_status;
DROP INDEX IF EXISTS idx_order_request_pharmacy;

DROP TABLE IF EXISTS inventory_discrepancy;
DROP TABLE IF EXISTS order_request;
DROP TABLE IF EXISTS supervisor_note;
