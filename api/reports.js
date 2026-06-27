/**
 * Routes: /api/reports
 *
 * Implements GET /api/reports/pharmacy-dashboard
 */
const { Router } = require('express');
const db = require('../db/connection');
const { asyncHandler } = require('./middleware');

const router = Router();

router.get('/pharmacy-dashboard', asyncHandler((req, res) => {
  // Query 1: Total monthly sales quantity sold from Pharmacy locations in current calendar month
  const totalMonthlySalesRow = db.prepare(`
    SELECT COALESCE(SUM(sm.quantity), 0) AS total_sales
    FROM stock_movement sm
    JOIN location l ON sm.from_location = l.location_id
    WHERE l.type = 'Pharmacy'
      AND sm.movement = 'OUT'
      AND sm.created_at >= date('now', 'start of month')
      AND sm.created_at < date('now', 'start of month', '+1 month')
      AND (sm.reference_note IS NULL OR sm.reference_note NOT LIKE '[REVERSED]%')
  `).get();
  const totalMonthlySales = totalMonthlySalesRow ? totalMonthlySalesRow.total_sales : 0;

  // Query 2: List of insufficient (low stock) products at Pharmacy locations
  const insufficientProducts = db.prepare(`
    SELECT
      sl.location_id,
      l.name AS location_name,
      sl.batch_no,
      p.sku,
      p.name AS product_name,
      p.category,
      sl.quantity,
      sl.reorder_point,
      b.expiry_date
    FROM stock_level sl
    JOIN batch b ON b.batch_no = sl.batch_no
    JOIN product p ON p.product_id = b.product_id
    JOIN location l ON l.location_id = sl.location_id
    WHERE l.type = 'Pharmacy'
      AND sl.quantity <= sl.reorder_point
    ORDER BY l.name ASC, p.name ASC, b.expiry_date ASC
  `).all();

  // Query 3: List of near expiry batches (<= 4 months and > now, quantity > 0) at Pharmacy locations
  const nearExpiryBatches = db.prepare(`
    SELECT
      b.batch_no,
      p.sku,
      p.name AS product_name,
      b.expiry_date,
      CAST(julianday(b.expiry_date) - julianday('now') AS INTEGER) AS days_until_expiry,
      sl.location_id,
      l.name AS location_name,
      sl.quantity
    FROM batch b
    JOIN product p ON p.product_id = b.product_id
    JOIN stock_level sl ON sl.batch_no = b.batch_no
    JOIN location l ON l.location_id = sl.location_id
    WHERE l.type = 'Pharmacy'
      AND sl.quantity > 0
      AND b.expiry_date <= date('now', '+4 months')
      AND b.expiry_date > date('now')
    ORDER BY b.expiry_date ASC, p.name ASC
  `).all();

  // Query 4: List of top selling products in current calendar month at Pharmacy locations
  const topSellingProducts = db.prepare(`
    SELECT
      p.name AS product_name,
      p.sku,
      COALESCE(SUM(sm.quantity), 0) AS quantity_sold
    FROM stock_movement sm
    JOIN batch b ON sm.batch_no = b.batch_no
    JOIN product p ON b.product_id = p.product_id
    JOIN location l ON l.location_id = sm.from_location
    WHERE sm.movement = 'OUT'
      AND l.type = 'Pharmacy'
      AND sm.created_at >= date('now', 'start of month')
      AND sm.created_at < date('now', 'start of month', '+1 month')
      AND (sm.reference_note IS NULL OR sm.reference_note NOT LIKE '[REVERSED]%')
    GROUP BY p.product_id, p.name, p.sku
    ORDER BY quantity_sold DESC, p.name ASC
  `).all();

  res.json({
    totalMonthlySales,
    insufficientProductsCount: insufficientProducts.length,
    nearExpiryBatchesCount: nearExpiryBatches.length,
    insufficientProducts,
    nearExpiryBatches,
    topSellingProducts
  });
}));

// --- WAREHOUSE DASHBOARD ---
router.get('/warehouse-dashboard', asyncHandler((req, res) => {
  // Query 1: Low stock at Warehouse
  const insufficientProducts = db.prepare(`
    SELECT
      sl.location_id, l.name AS location_name,
      sl.batch_no, p.sku, p.name AS product_name, p.category,
      sl.quantity, sl.reorder_point, b.expiry_date
    FROM stock_level sl
    JOIN batch b ON b.batch_no = sl.batch_no
    JOIN product p ON p.product_id = b.product_id
    JOIN location l ON l.location_id = sl.location_id
    WHERE l.type = 'Warehouse' AND sl.quantity <= sl.reorder_point
    ORDER BY p.name ASC
  `).all();

  // Query 2: Near expiry at Warehouse (<= 4 months)
  const nearExpiryBatches = db.prepare(`
    SELECT
      b.batch_no, p.sku, p.name AS product_name, b.expiry_date,
      CAST(julianday(b.expiry_date) - julianday('now') AS INTEGER) AS days_until_expiry,
      sl.location_id, l.name AS location_name, sl.quantity
    FROM batch b
    JOIN product p ON p.product_id = b.product_id
    JOIN stock_level sl ON sl.batch_no = b.batch_no
    JOIN location l ON l.location_id = sl.location_id
    WHERE l.type = 'Warehouse' AND sl.quantity > 0
      AND b.expiry_date <= date('now', '+4 months') AND b.expiry_date > date('now')
    ORDER BY b.expiry_date ASC
  `).all();

  // Query 3: Incoming deliveries (Company/Supplier -> Warehouse)
  const incomingDeliveries = db.prepare(`
    SELECT
      sm.movement_id, sm.batch_no, p.name AS product_name,
      sm.quantity, sm.created_at,
      lf.name AS from_supplier,
      lt.name AS to_warehouse
    FROM stock_movement sm
    JOIN batch b ON b.batch_no = sm.batch_no
    JOIN product p ON p.product_id = b.product_id
    JOIN location lf ON lf.location_id = sm.from_location
    JOIN location lt ON lt.location_id = sm.to_location
    WHERE sm.movement = 'TRANSFER'
      AND lf.type = 'Supplier'
      AND lt.type = 'Warehouse'
    ORDER BY sm.created_at DESC
    LIMIT 15
  `).all();

  // Query 4: Outgoing shipments (Warehouse -> Pharmacy)
  const outgoingShipments = db.prepare(`
    SELECT
      sm.movement_id, sm.batch_no, p.name AS product_name,
      sm.quantity, sm.created_at,
      lf.name AS from_warehouse,
      lt.name AS to_pharmacy
    FROM stock_movement sm
    JOIN batch b ON b.batch_no = sm.batch_no
    JOIN product p ON p.product_id = b.product_id
    JOIN location lf ON lf.location_id = sm.from_location
    JOIN location lt ON lt.location_id = sm.to_location
    WHERE sm.movement = 'TRANSFER'
      AND lf.type = 'Warehouse'
      AND lt.type = 'Pharmacy'
    ORDER BY sm.created_at DESC
    LIMIT 15
  `).all();

  res.json({
    insufficientProductsCount: insufficientProducts.length,
    nearExpiryBatchesCount: nearExpiryBatches.length,
    insufficientProducts,
    nearExpiryBatches,
    incomingDeliveries,
    outgoingShipments
  });
}));

module.exports = router;
