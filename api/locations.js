/**
 * Routes: /api/locations
 */
const { Router } = require('express');
const db = require('../db/connection');
const { asyncHandler, requireFields } = require('./middleware');

const router = Router();

router.get('/', asyncHandler((req, res) => {
  const { type } = req.query;
  let query = 'SELECT * FROM location WHERE is_active = 1 ORDER BY type, name';
  const params = [];

  if (type) {
    query = 'SELECT * FROM location WHERE is_active = 1 AND type = ? ORDER BY name';
    params.push(type);
  }

  let locations = db.prepare(query).all(...params);

  if (!type || type === 'Supplier') {
    const allOffers = db.prepare('SELECT so.supplier_id, so.product_id, so.price FROM supplier_offer so JOIN location l ON so.supplier_id = l.location_id WHERE l.is_active = 1').all();
    const minPrices = {};
    for (const o of allOffers) {
      if (!(o.product_id in minPrices) || o.price < minPrices[o.product_id]) {
        minPrices[o.product_id] = o.price;
      }
    }
    
    locations = locations.map(l => {
      if (l.type === 'Supplier') {
        const supplierOffers = allOffers.filter(o => o.supplier_id === l.location_id);
        const count = supplierOffers.length;
        const cheapestCount = supplierOffers.filter(o => o.price <= minPrices[o.product_id]).length;
        const score = count + (cheapestCount * 3);
        
        let stars = 1;
        if (score >= 15) stars = 5;
        else if (score >= 9) stars = 4;
        else if (score >= 4) stars = 3;
        else if (score >= 1) stars = 2;
        
        return { ...l, importance_level: stars };
      }
      return l;
    });
  }

  res.json(locations);
}));

router.get('/:id', asyncHandler((req, res) => {
  const { id } = req.params;

  const location = db.prepare('SELECT * FROM location WHERE location_id = ?').get(id);
  if (!location) return res.status(404).json({ error: 'Location not found' });

  const inventory = db.prepare(`
    SELECT sl.batch_no, p.sku, p.name AS product_name, p.category,
           b.expiry_date, sl.quantity, sl.reorder_point,
           CASE WHEN sl.quantity <= sl.reorder_point THEN 1 ELSE 0 END AS is_low
    FROM stock_level sl
    JOIN batch    b ON b.batch_no   = sl.batch_no
    JOIN product  p ON p.product_id = b.product_id
    WHERE sl.location_id = ? AND sl.quantity > 0
    ORDER BY b.expiry_date ASC
  `).all(id);

  res.json({ ...location, inventory });
}));

router.post('/', requireFields('name', 'type'), asyncHandler((req, res) => {
  const { name, type, address, max_capacity, importance_level } = req.body;
  const maxCap = type === 'Warehouse' ? (parseInt(max_capacity, 10) || 50000) : 50000;
  const impLevel = parseInt(importance_level, 10) || 3;

  const result = db.prepare(
    'INSERT INTO location (name, type, address, max_capacity, importance_level) VALUES (?, ?, ?, ?, ?)'
  ).run(name, type, address || null, maxCap, impLevel);

  res.status(201).json({ id: result.lastInsertRowid, success: true });
}));

router.put('/:id', requireFields('name'), asyncHandler((req, res) => {
  const { id } = req.params;
  const { name, address } = req.body;
  const result = db.prepare(`
    UPDATE location SET name = ?, address = ? WHERE location_id = ?
  `).run(name, address || null, id);
  if (result.changes === 0) return res.status(404).json({ error: 'Location not found' });
  const location = db.prepare('SELECT * FROM location WHERE location_id = ?').get(id);
  res.json(location);
}));

router.delete('/:id', asyncHandler((req, res) => {
  const { id } = req.params;
  const result = db.prepare('UPDATE location SET is_active = 0 WHERE location_id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Location not found' });
  res.json({ success: true });
}));

module.exports = router;
