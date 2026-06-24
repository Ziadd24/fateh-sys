/**
 * Routes: /api/stock
 */
const { Router } = require('express');
const { asyncHandler, requireFields } = require('./middleware');
const {
  deductStock,
  transferStock,
  receiveStock,
  getLowStock,
  getSupplierInventory,
  receiveFromCompany,
  dispatchToPharmacy,
  pharmacySale,
  adjustStock
} = require('../lib/stock');

const router = Router();

router.post('/receive',
  requireFields('location_id', 'batch_no', 'quantity'),
  asyncHandler((req, res) => {
    const { location_id, batch_no, quantity, reorder_point, note } = req.body;
    const result = receiveStock(location_id, batch_no, quantity, reorder_point || 0, note);
    res.status(201).json(result);
  })
);

router.post('/deduct',
  requireFields('location_id', 'product_id', 'quantity'),
  asyncHandler((req, res) => {
    const { location_id, product_id, quantity, note } = req.body;
    const result = deductStock(location_id, product_id, quantity, note);

    if (!result.success) {
      return res.status(409).json(result);
    }
    res.json(result);
  })
);

router.post('/transfer',
  requireFields('from_location_id', 'to_location_id', 'product_id', 'quantity'),
  asyncHandler((req, res) => {
    const { from_location_id, to_location_id, product_id, quantity, note } = req.body;
    const result = transferStock(from_location_id, to_location_id, product_id, quantity, note);

    if (!result.success) {
      return res.status(409).json(result);
    }
    res.json(result);
  })
);

router.post('/company-to-warehouse',
  requireFields('supplier_id', 'warehouse_id', 'product_id', 'batch_no', 'expiry_date', 'quantity'),
  asyncHandler((req, res) => {
    const { supplier_id, warehouse_id, product_id, batch_no, expiry_date, quantity, note } = req.body;
    const result = receiveFromCompany(supplier_id, warehouse_id, product_id, batch_no, expiry_date, quantity, note);
    if (!result.success) return res.status(409).json(result);
    res.json(result);
  })
);

router.post('/warehouse-to-pharmacy',
  requireFields('warehouse_id', 'pharmacy_id', 'product_id', 'quantity'),
  asyncHandler((req, res) => {
    const { warehouse_id, pharmacy_id, product_id, quantity, note } = req.body;
    const result = dispatchToPharmacy(warehouse_id, pharmacy_id, product_id, quantity, note);
    if (!result.success) return res.status(409).json(result);
    res.json(result);
  })
);

router.post('/pharmacy-sale',
  requireFields('pharmacy_id', 'product_id', 'quantity'),
  asyncHandler((req, res) => {
    const { pharmacy_id, product_id, quantity, specific_batch_no, note } = req.body;
    const result = pharmacySale(pharmacy_id, product_id, quantity, specific_batch_no, note);
    if (!result.success) return res.status(409).json(result);
    res.json(result);
  })
);

router.post('/adjust',
  requireFields('location_id', 'product_id', 'specific_batch_no', 'quantity'),
  asyncHandler((req, res) => {
    const { location_id, product_id, specific_batch_no, quantity, note } = req.body;
    const result = adjustStock(location_id, product_id, specific_batch_no, quantity, note);
    if (!result.success) return res.status(409).json(result);
    res.json(result);
  })
);

router.get('/low', asyncHandler((req, res) => {
  const locationId = req.query.location_id ? parseInt(req.query.location_id, 10) : null;
  const rows = getLowStock(locationId);
  res.json(rows);
}));

router.get('/suppliers', asyncHandler((req, res) => {
  const rows = getSupplierInventory(req.query.name || null);
  res.json(rows);
}));

module.exports = router;
