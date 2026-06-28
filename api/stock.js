/**
 * Routes: /api/stock
 */
const { Router } = require('express');
const { asyncHandler, requireFields, requirePositiveInt } = require('./middleware');
const {
  deductStock,
  transferStock,
  receiveStock,
  getLowStock,
  getSupplierInventory,
  receiveFromCompany,
  dispatchToPharmacy,
  pharmacySale,
  adjustStock,
  receiveFromCompanyBulk,
  dispatchToPharmacyBulk,
  returnToSupplier,
  reverseTransaction
} = require('../lib/stock');

const router = Router();

router.post('/receive',
  requireFields('location_id', 'batch_no', 'quantity'),
  requirePositiveInt('quantity'),
  asyncHandler((req, res) => {
    const { location_id, batch_no, quantity, reorder_point, note } = req.body;
    const result = receiveStock(location_id, batch_no, quantity, parseInt(reorder_point || 0, 10), note);
    res.status(201).json(result);
  })
);

router.post('/deduct',
  requireFields('location_id', 'product_id', 'quantity'),
  requirePositiveInt('quantity'),
  asyncHandler((req, res) => {
    const { location_id, product_id, quantity, specific_batch_no, note } = req.body;
    const result = deductStock(location_id, product_id, quantity, specific_batch_no || null, note);

    if (!result.success) {
      return res.status(409).json(result);
    }
    res.json(result);
  })
);

router.post('/transfer',
  requireFields('from_location_id', 'to_location_id', 'product_id', 'quantity'),
  requirePositiveInt('quantity'),
  asyncHandler((req, res) => {
    const { from_location_id, to_location_id, product_id, quantity, specific_batch_no, note } = req.body;
    const result = transferStock(from_location_id, to_location_id, product_id, quantity, specific_batch_no || null, note);

    if (!result.success) {
      return res.status(409).json(result);
    }
    res.json(result);
  })
);

router.post('/company-to-warehouse',
  requireFields('supplier_id', 'warehouse_id', 'items'),
  asyncHandler((req, res) => {
    const { supplier_id, warehouse_id, items, note } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: 'Items array is required' });
    
    for (const item of items) {
      item.qty = parseInt(item.qty, 10);
      if (isNaN(item.qty) || item.qty <= 0) return res.status(400).json({ success: false, error: 'All item quantities must be positive integers' });
      item.reorderPoint = parseInt(item.reorderPoint || 0, 10);
      item.price = parseFloat(item.price || 0.0);
    }

    try {
      const result = receiveFromCompanyBulk(supplier_id, warehouse_id, items, note);
      res.json(result);
    } catch (err) {
      res.status(409).json({ success: false, error: err.message });
    }
  })
);

router.post('/warehouse-to-pharmacy',
  requireFields('warehouse_id', 'pharmacy_id', 'items'),
  asyncHandler((req, res) => {
    const { warehouse_id, pharmacy_id, items, note } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: 'Items array is required' });
    
    for (const item of items) {
      item.qty = parseInt(item.qty, 10);
      if (isNaN(item.qty) || item.qty <= 0) return res.status(400).json({ success: false, error: 'All item quantities must be positive integers' });
    }

    try {
      const result = dispatchToPharmacyBulk(warehouse_id, pharmacy_id, items, note);
      res.json(result);
    } catch (err) {
      res.status(409).json({ success: false, error: err.message });
    }
  })
);

router.post('/return-to-supplier',
  requireFields('location_id', 'supplier_id', 'product_id', 'quantity'),
  asyncHandler((req, res) => {
    const { location_id, supplier_id, product_id, quantity, note } = req.body;
    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) return res.status(400).json({ success: false, error: 'Quantity must be a positive integer' });

    try {
      const result = returnToSupplier(location_id, supplier_id, product_id, parsedQty, note);
      res.json(result);
    } catch (err) {
      res.status(409).json({ success: false, error: err.message });
    }
  })
);

router.post('/reverse',
  requireFields('movement_id'),
  asyncHandler((req, res) => {
    const { movement_id, note } = req.body;
    try {
      const result = reverseTransaction(movement_id, note);
      res.json(result);
    } catch (err) {
      res.status(409).json({ success: false, error: err.message });
    }
  })
);

router.post('/pharmacy-sale',
  requireFields('pharmacy_id', 'product_id', 'quantity'),
  asyncHandler((req, res) => {
    const { pharmacy_id, product_id, quantity, specific_batch_no, note } = req.body;
    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) return res.status(400).json({ success: false, error: 'Quantity must be a positive integer' });
    const result = pharmacySale(pharmacy_id, product_id, parsedQty, specific_batch_no || null, note);
    if (!result.success) return res.status(409).json(result);
    res.json(result);
  })
);

router.post('/adjust',
  requireFields('location_id', 'product_id', 'specific_batch_no'),
  asyncHandler((req, res) => {
    const { location_id, product_id, specific_batch_no, note } = req.body;
    const result = adjustStock(location_id, product_id, specific_batch_no, note);
    if (!result.success) return res.status(409).json(result);
    res.json(result);
  })
);

router.put('/reorder-point', requireFields('location_id', 'batch_no', 'reorder_point'), asyncHandler((req, res) => {
  const { location_id, batch_no, reorder_point } = req.body;
  const rp = parseInt(reorder_point, 10);
  if (isNaN(rp) || rp < 0) return res.status(400).json({ error: 'Invalid reorder point' });

  const db = require('../db/connection');
  const result = db.prepare(`
    UPDATE stock_level 
    SET reorder_point = ? 
    WHERE location_id = ? AND batch_no = ?
  `).run(rp, location_id, batch_no);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Stock record not found' });
  }

  res.json({ success: true });
}));

router.get('/low', asyncHandler((req, res) => {
  const locationId = req.query.location_id ? parseInt(req.query.location_id, 10) : null;
  const rows = getLowStock(locationId);
  res.json(rows);
}));

router.put('/ignore-low', requireFields('location_id', 'batch_no'), asyncHandler((req, res) => {
  const { location_id, batch_no } = req.body;
  const db = require('../db/connection');
  const result = db.prepare(`
    UPDATE stock_level 
    SET is_ignored = 1 
    WHERE location_id = ? AND batch_no = ?
  `).run(location_id, batch_no);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Stock record not found' });
  }
  res.json({ success: true });
}));

router.get('/suppliers', asyncHandler((req, res) => {
  const rows = getSupplierInventory(req.query.name || null);
  res.json(rows);
}));

module.exports = router;
