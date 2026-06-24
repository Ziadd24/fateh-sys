/**
 * Routes: /api/reports
 */
const { Router } = require('express');
const db = require('../db/connection');
const { asyncHandler } = require('./middleware');

const router = Router();

/**
 * GET /api/reports/pharmacy-dashboard
 *
 * Consolidates inventory metrics and alerts for pharmacy locations.
 * Returns:
 * - totalMonthlySales: total units sold (movement = 'OUT') at locations of type 'Pharmacy' in current calendar month
 * - insufficientProductsCount: count of insufficient products at pharmacy locations (quantity <= reorder_point)
 * - nearExpiryBatchesCount: count of near-expiry batches at pharmacy locations (expiring in <= 4 months, quantity > 0)
 * - insufficientProducts: list of products/batches below reorder point at pharmacy locations
 * - nearExpiryBatches: list of batches expiring in <= 4 months with positive quantity at pharmacy locations
 * - topSellingProducts: list of top products sold at pharmacies in current calendar month ordered by quantity_sold descending
 */
router.get('/pharmacy-dashboard', asyncHandler((req, res) => {
  // Query 1: totalMonthlySales
  const totalMonthlySalesRow = db.prepare(`
    SELECT COALESCE(SUM(sm.quantity), 0) AS total_monthly_sales
    FROM stock_movement sm
    JOIN location l ON l.location_id = sm.from_location
    WHERE sm.movement = 'OUT'
      AND l.type = 'Pharmacy'
      AND sm.created_at >= date('now', 'start of month')
  `).get();
  
  const totalMonthlySales = totalMonthlySalesRow.total_monthly_sales;

  // Query 2: insufficientProductsCount
  const insufficientProductsCountRow = db.prepare(`
    SELECT COUNT(*) AS count
    FROM stock_level sl
    JOIN location l ON l.location_id = sl.location_id
    WHERE l.type = 'Pharmacy'
      AND sl.quantity <= sl.reorder_point
  `).get();
  
  const insufficientProductsCount = insufficientProductsCountRow.count;

  // Query 3: nearExpiryBatchesCount
  const nearExpiryBatchesCountRow = db.prepare(`
    SELECT COUNT(*) AS count
    FROM batch b
    JOIN stock_level sl ON sl.batch_no = b.batch_no
    JOIN location l ON l.location_id = sl.location_id
    WHERE l.type = 'Pharmacy'
      AND b.expiry_date <= date('now', '+4 months')
      AND b.expiry_date > date('now')
      AND sl.quantity > 0
  `).get();
  
  const nearExpiryBatchesCount = nearExpiryBatchesCountRow.count;

  // Query 4: insufficientProducts (list)
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

  // Query 5: nearExpiryBatches (list)
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
      AND b.expiry_date <= date('now', '+4 months')
      AND b.expiry_date > date('now')
      AND sl.quantity > 0
    ORDER BY b.expiry_date ASC, p.name ASC
  `).all();

  // Query 6: topSellingProducts (list)
  const topSellingProducts = db.prepare(`
    SELECT
      p.name AS product_name,
      p.sku,
      SUM(sm.quantity) AS quantity_sold
    FROM stock_movement sm
    JOIN batch b ON b.batch_no = sm.batch_no
    JOIN product p ON p.product_id = b.product_id
    JOIN location l ON l.location_id = sm.from_location
    WHERE sm.movement = 'OUT'
      AND l.type = 'Pharmacy'
      AND sm.created_at >= date('now', 'start of month')
    GROUP BY p.product_id, p.name, p.sku
    ORDER BY quantity_sold DESC, p.name ASC
  `).all();

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
