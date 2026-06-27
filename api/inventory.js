const express = require('express');
const router = express.Router();
const db = require('../db/connection');

// GET /api/inventory
// Returns a flat list of all stock items joined with product, batch, and location info
router.get('/', (req, res, next) => {
  try {
    const inventory = db.prepare(`
      SELECT 
        sl.location_id,
        l.name as location_name,
        l.type as location_type,
        sl.batch_no,
        b.expiry_date,
        p.product_id,
        p.name as product_name,
        p.category,
        p.sku,
        COALESCE(NULLIF(p.unit_cost, 0), (SELECT MIN(price) FROM supplier_offer WHERE product_id = p.product_id), 0) as unit_cost,
        sl.quantity,
        sl.reorder_point,
        p.storage_condition,
        COALESCE(
          (SELECT loc.name 
           FROM stock_movement sm 
           JOIN location loc ON sm.from_location = loc.location_id
           WHERE sm.batch_no = b.batch_no AND loc.type = 'Supplier'
           ORDER BY sm.created_at ASC LIMIT 1),
          (SELECT loc.name 
           FROM supplier_offer so 
           JOIN location loc ON so.supplier_id = loc.location_id
           WHERE so.product_id = p.product_id
           ORDER BY so.price ASC LIMIT 1),
          'لا يوجد مورد'
        ) as cheapest_importer
      FROM stock_level sl
      JOIN location l ON sl.location_id = l.location_id
      JOIN batch b ON sl.batch_no = b.batch_no
      JOIN product p ON b.product_id = p.product_id
      WHERE sl.quantity > 0
      ORDER BY l.name ASC, b.expiry_date ASC
    `).all();

    res.json(inventory);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
