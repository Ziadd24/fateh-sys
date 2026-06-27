/**
 * Routes: /api/offers
 */
const { Router } = require('express');
const db = require('../db/connection');
const { asyncHandler, requireFields } = require('./middleware');

const router = Router();

// Get the best offers, sorted by price
router.get('/best', asyncHandler((req, res) => {
  let rows = db.prepare(`
    SELECT 
      so.offer_id,
      so.price,
      so.condition,
      l.location_id AS supplier_id,
      l.name AS supplier_name,
      p.product_id,
      p.sku,
      p.name AS product_name,
      p.category
    FROM supplier_offer so
    JOIN location l ON l.location_id = so.supplier_id
    JOIN product p ON p.product_id = so.product_id
    WHERE l.is_active = 1
    ORDER BY so.price ASC, p.name ASC
  `).all();
  
  // Attach dynamic importance level
  const allOffers = db.prepare('SELECT so.supplier_id, so.product_id, so.price FROM supplier_offer so JOIN location l ON so.supplier_id = l.location_id WHERE l.is_active = 1').all();
  const minPrices = {};
  for (const o of allOffers) {
    if (!(o.product_id in minPrices) || o.price < minPrices[o.product_id]) minPrices[o.product_id] = o.price;
  }
  
  rows = rows.map(row => {
    const supplierOffers = allOffers.filter(o => o.supplier_id === row.supplier_id);
    const count = supplierOffers.length;
    const cheapestCount = supplierOffers.filter(o => o.price <= minPrices[o.product_id]).length;
    const score = count + (cheapestCount * 3);
    
    let stars = 1;
    if (score >= 15) stars = 5;
    else if (score >= 9) stars = 4;
    else if (score >= 4) stars = 3;
    else if (score >= 1) stars = 2;
    
    return { ...row, importance_level: stars };
  });
  
  res.json(rows);
}));

// Create or update a supplier offer
router.post('/', requireFields('supplier_id', 'product_id', 'price'), asyncHandler((req, res) => {
  const { supplier_id, product_id, price, condition } = req.body;
  
  const result = db.prepare(`
    INSERT INTO supplier_offer (supplier_id, product_id, price, condition)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(supplier_id, product_id) DO UPDATE SET
      price = excluded.price,
      condition = excluded.condition,
      created_at = CURRENT_TIMESTAMP
  `).run(supplier_id, product_id, parseFloat(price), condition || null);
  
  const offer = db.prepare('SELECT * FROM supplier_offer WHERE supplier_id = ? AND product_id = ?').get(supplier_id, product_id);
  res.status(201).json(offer);
}));

module.exports = router;
