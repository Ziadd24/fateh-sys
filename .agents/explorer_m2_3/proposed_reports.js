/**
 * Proposed Router for /api/reports
 * To be implemented in api/reports.js
 */
const { Router } = require('express');
const db = require('../db/connection');
const { asyncHandler } = require('./middleware');

const router = Router();

router.get('/pharmacy-dashboard', asyncHandler((req, res) => {
  // 1. totalMonthlySales
  // Sum of quantities sold from Pharmacy locations in the current calendar month.
  const salesRow = db.prepare(`
    SELECT COALESCE(SUM(sm.quantity), 0) AS totalMonthlySales
    FROM stock_movement sm
    JOIN location l ON sm.from_location = l.location_id
    WHERE sm.movement = 'OUT'
      AND l.type = 'Pharmacy'
      AND strftime('%Y-%m', sm.created_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime')
  `).get();
  const totalMonthlySales = salesRow ? salesRow.totalMonthlySales : 0;

  // 2. insufficientProductsCount
  // Count of unique products that have low stock (quantity <= reorder_point) at any Pharmacy location.
  const insufficientCountRow = db.prepare(`
    SELECT COUNT(DISTINCT b.product_id) AS insufficientProductsCount
    FROM stock_level sl
    JOIN batch b ON sl.batch_no = b.batch_no
    JOIN location l ON sl.location_id = l.location_id
    WHERE l.type = 'Pharmacy'
      AND sl.quantity <= sl.reorder_point
  `).get();
  const insufficientProductsCount = insufficientCountRow ? insufficientCountRow.insufficientProductsCount : 0;

  // 3. nearExpiryBatchesCount
  // Count of batches near expiry (<= 4 months and > now) that are currently in stock (quantity > 0) at Pharmacy locations.
  const nearExpiryCountRow = db.prepare(`
    SELECT COUNT(DISTINCT b.batch_no) AS nearExpiryBatchesCount
    FROM batch b
    JOIN stock_level sl ON sl.batch_no = b.batch_no
    JOIN location l ON sl.location_id = l.location_id
    WHERE l.type = 'Pharmacy'
      AND b.expiry_date <= date('now', 'localtime', '+4 months')
      AND b.expiry_date > date('now', 'localtime')
      AND sl.quantity > 0
  `).get();
  const nearExpiryBatchesCount = nearExpiryCountRow ? nearExpiryCountRow.nearExpiryBatchesCount : 0;

  // 4. insufficientProducts (list)
  // List of low-stock items at Pharmacy locations.
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
    ORDER BY p.name ASC, l.name ASC
  `).all();

  // 5. nearExpiryBatches (list)
  // List of batches expiring in <= 4 months with quantity > 0 at Pharmacy locations.
  const nearExpiryBatches = db.prepare(`
    SELECT
      b.batch_no,
      p.sku,
      p.name AS product_name,
      b.expiry_date,
      CAST(julianday(b.expiry_date) - julianday('now', 'localtime') AS INTEGER) AS days_until_expiry,
      sl.location_id,
      l.name AS location_name,
      sl.quantity
    FROM batch b
    JOIN product p ON p.product_id = b.product_id
    JOIN stock_level sl ON sl.batch_no = b.batch_no
    JOIN location l ON l.location_id = sl.location_id
    WHERE l.type = 'Pharmacy'
      AND b.expiry_date <= date('now', 'localtime', '+4 months')
      AND b.expiry_date > date('now', 'localtime')
      AND sl.quantity > 0
    ORDER BY b.expiry_date ASC, p.name ASC
  `).all();

  // 6. topSellingProducts (list)
  // Top selling products sold from Pharmacy locations in the current calendar month.
  const topSellingProducts = db.prepare(`
    SELECT
      p.name AS product_name,
      p.sku,
      SUM(sm.quantity) AS quantity_sold
    FROM stock_movement sm
    JOIN batch b ON sm.batch_no = b.batch_no
    JOIN product p ON b.product_id = p.product_id
    JOIN location l ON sm.from_location = l.location_id
    WHERE sm.movement = 'OUT'
      AND l.type = 'Pharmacy'
      AND strftime('%Y-%m', sm.created_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime')
    GROUP BY p.product_id, p.name, p.sku
    ORDER BY quantity_sold DESC
    LIMIT 5
  `).all();

  // Return aggregated dashboard data
  res.json({
    totalMonthlySales,
    insufficientProductsCount,
    nearExpiryBatchesCount,
    insufficientProducts,
    nearExpiryBatches,
    topSellingProducts
  });
}));

module.exports = router;
