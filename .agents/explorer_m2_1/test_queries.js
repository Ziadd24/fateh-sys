const db = require('../../db/connection');

console.log('Testing connection & queries...');

try {
  // Test basic connection
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tables:', tables.map(t => t.name));

  // Query 1: totalMonthlySales
  const salesQuery = db.prepare(`
    SELECT COALESCE(SUM(sm.quantity), 0) AS total_sales
    FROM stock_movement sm
    JOIN location l ON sm.from_location = l.location_id
    WHERE l.type = 'Pharmacy'
      AND sm.movement = 'OUT'
      AND sm.created_at >= datetime('now', 'start of month')
      AND sm.created_at < datetime('now', 'start of month', '+1 month')
  `);
  console.log('Query 1 (Sales):', salesQuery.get());

  // Query 2: insufficientProductsCount
  const lowCountQuery = db.prepare(`
    SELECT COUNT(*) AS count
    FROM stock_level sl
    JOIN location l ON sl.location_id = l.location_id
    WHERE l.type = 'Pharmacy'
      AND sl.quantity <= sl.reorder_point
  `);
  console.log('Query 2 (Low stock count):', lowCountQuery.get());

  // Query 3: nearExpiryCount
  const nearExpiryCountQuery = db.prepare(`
    SELECT COUNT(*) AS count
    FROM stock_level sl
    JOIN batch b ON sl.batch_no = b.batch_no
    JOIN location l ON sl.location_id = l.location_id
    WHERE l.type = 'Pharmacy'
      AND sl.quantity > 0
      AND b.expiry_date <= date('now', '+4 months')
      AND b.expiry_date > date('now')
  `);
  console.log('Query 3 (Near expiry count):', nearExpiryCountQuery.get());

  // Query 4: insufficientProducts (list)
  const lowListQuery = db.prepare(`
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
    ORDER BY l.name ASC, p.name ASC
  `);
  console.log('Query 4 (Low stock list length):', lowListQuery.all().length);

  // Query 5: nearExpiryBatches (list)
  const nearExpiryListQuery = db.prepare(`
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
    ORDER BY b.expiry_date ASC, l.name ASC
  `);
  console.log('Query 5 (Near expiry list length):', nearExpiryListQuery.all().length);

  // Query 6: topSellingProducts
  const topSellingQuery = db.prepare(`
    SELECT
      p.name AS product_name,
      p.sku,
      COALESCE(SUM(sm.quantity), 0) AS quantity_sold
    FROM stock_movement sm
    JOIN batch b ON sm.batch_no = b.batch_no
    JOIN product p ON b.product_id = p.product_id
    JOIN location l ON sm.from_location = l.location_id
    WHERE l.type = 'Pharmacy'
      AND sm.movement = 'OUT'
      AND sm.created_at >= datetime('now', 'start of month')
      AND sm.created_at < datetime('now', 'start of month', '+1 month')
    GROUP BY p.product_id, p.name, p.sku
    ORDER BY quantity_sold DESC
    LIMIT 5
  `);
  console.log('Query 6 (Top selling):', topSellingQuery.all());

  console.log('All queries compile and run successfully.');
} catch (e) {
  console.error('Query failure:', e);
}
