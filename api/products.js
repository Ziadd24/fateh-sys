/**
 * Routes: /api/products
 */
const { Router } = require('express');
const db = require('../db/connection');
const { asyncHandler, requireFields } = require('./middleware');

const router = Router();

router.get('/', asyncHandler((req, res) => {
  const { category } = req.query;
  let query = 'SELECT * FROM product ORDER BY name';
  const params = [];

  if (category) {
    query = 'SELECT * FROM product WHERE category = ? ORDER BY name';
    params.push(category);
  }

  const rows = db.prepare(query).all(...params);
  res.json(rows);
}));

router.get('/:id', asyncHandler((req, res) => {
  const { id } = req.params;

  const product = db.prepare('SELECT * FROM product WHERE product_id = ?').get(id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const batches = db.prepare(`
    SELECT b.batch_no, b.expiry_date, b.manufactured,
           COALESCE(SUM(sl.quantity), 0) AS total_stock
    FROM batch b
    LEFT JOIN stock_level sl ON sl.batch_no = b.batch_no
    WHERE b.product_id = ?
    GROUP BY b.batch_no
    ORDER BY b.expiry_date ASC
  `).all(id);

  res.json({ ...product, batches });
}));

router.post('/', requireFields('name', 'category'), asyncHandler((req, res) => {
  let { sku, name, category, storage_condition } = req.body;
  
  if (!sku) {
    sku = Math.random().toString(36).substring(2, 6).toUpperCase();
  }
  
  const uCost = 0.0;
  const sCond = storage_condition || 'Room Temperature';

  const result = db.prepare(`
    INSERT INTO product (sku, name, category, unit_cost, storage_condition)
    VALUES (?, ?, ?, ?, ?)
  `).run(sku, name, category, uCost, sCond);

  res.status(201).json({ 
    product_id: result.lastInsertRowid, 
    sku, name, category, unit_cost: uCost, storage_condition: sCond 
  });
}));

router.put('/:id', requireFields('name', 'category'), asyncHandler((req, res) => {
  const { id } = req.params;
  const { sku, name, category, storage_condition } = req.body;
  const sCond = storage_condition || 'Room Temperature';

  const result = db.prepare(`
    UPDATE product 
    SET sku = ?, name = ?, category = ?, storage_condition = ?
    WHERE product_id = ?
  `).run(sku, name, category, sCond, id);

  if (result.changes === 0) return res.status(404).json({ error: 'المنتج غير موجود' });
  
  res.json({ success: true });
}));

router.delete('/:id', asyncHandler((req, res) => {
  const { id } = req.params;

  return db.transaction(() => {
    // 1. Verify product exists
    const product = db.prepare('SELECT product_id FROM product WHERE product_id = ?').get(id);
    if (!product) {
      return res.status(404).json({ error: 'لم يتم العثور على الدواء' });
    }

    // 2. Get all batches for this product
    const batches = db.prepare('SELECT batch_no FROM batch WHERE product_id = ?').all(id);

    // 3. Block deletion if any batch still has live stock
    for (const { batch_no } of batches) {
      const stockRow = db.prepare(
        'SELECT COALESCE(SUM(quantity), 0) AS total FROM stock_level WHERE batch_no = ?'
      ).get(batch_no);
      if (stockRow && stockRow.total > 0) {
        return res.status(400).json({
          error: 'لا يمكن حذف هذا الدواء لوجود كميات في المخزون. يرجى تصفية المخزون أولاً.'
        });
      }
    }

    // 4. For every batch (all zero-stock), delete dependencies then the batch itself
    for (const { batch_no } of batches) {
      db.prepare('DELETE FROM expiry_alert         WHERE batch_no = ?').run(batch_no);
      db.prepare('DELETE FROM inventory_discrepancy WHERE batch_no = ?').run(batch_no);
      db.prepare('DELETE FROM stock_level           WHERE batch_no = ?').run(batch_no);
      db.prepare('DELETE FROM stock_movement        WHERE batch_no = ?').run(batch_no);
      db.prepare('DELETE FROM batch                 WHERE batch_no = ?').run(batch_no);
    }

    // 5. supplier_offer and supplier_price_history cascade via ON DELETE CASCADE on product_id
    // 6. Delete the product
    db.prepare('DELETE FROM product WHERE product_id = ?').run(id);

    return res.json({ success: true });
  })();
}));


module.exports = router;
