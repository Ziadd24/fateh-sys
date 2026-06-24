const db = require('../../db/connection');

console.log('--- TEST RUNNING WITH LOCALTIME ---');

try {
  // 1. totalMonthlySales
  const totalMonthlySales = db.prepare(`
    SELECT COALESCE(SUM(sm.quantity), 0) AS count
    FROM stock_movement sm
    JOIN location l ON sm.from_location = l.location_id
    WHERE sm.movement = 'OUT'
      AND l.type = 'Pharmacy'
      AND strftime('%Y-%m', sm.created_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime')
  `).get();
  console.log('1. totalMonthlySales:', totalMonthlySales);

  // 2. insufficientProductsCount (unique products)
  const insufficientProductsCount = db.prepare(`
    SELECT COUNT(DISTINCT b.product_id) AS count
    FROM stock_level sl
    JOIN batch b ON sl.batch_no = b.batch_no
    JOIN location l ON sl.location_id = l.location_id
    WHERE l.type = 'Pharmacy'
      AND sl.quantity <= sl.reorder_point
  `).get();
  console.log('2. insufficientProductsCount:', insufficientProductsCount);

  // 3. nearExpiryBatchesCount (unique batches)
  const nearExpiryBatchesCount = db.prepare(`
    SELECT COUNT(DISTINCT b.batch_no) AS count
    FROM batch b
    JOIN stock_level sl ON sl.batch_no = b.batch_no
    JOIN location l ON sl.location_id = l.location_id
    WHERE l.type = 'Pharmacy'
      AND b.expiry_date <= date('now', 'localtime', '+4 months')
      AND b.expiry_date > date('now', 'localtime')
      AND sl.quantity > 0
  `).get();
  console.log('3. nearExpiryBatchesCount:', nearExpiryBatchesCount);

  // 4. insufficientProducts (list)
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
    ORDER BY p.name ASC
  `).all();
  console.log('4. insufficientProducts:', insufficientProducts);

  // 5. nearExpiryBatches (list)
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
    ORDER BY b.expiry_date ASC
  `).all();
  console.log('5. nearExpiryBatches:', nearExpiryBatches);

  // 6. topSellingProducts (list - current month)
  const topSellingProductsMonth = db.prepare(`
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
  console.log('6. topSellingProducts (current month):', topSellingProductsMonth);

} catch (err) {
  console.error('Error running test queries:', err);
}
