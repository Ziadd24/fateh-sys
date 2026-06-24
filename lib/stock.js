/**
 * FIFO Stock Operations
 *
 * Core business logic for stock deductions, transfers, and receiving.
 * All deductions follow First-In, First-Out: oldest expiry batches are consumed first.
 */
const db = require('../db/connection');

/**
 * Deduct stock from a location using FIFO (earliest expiry first).
 *
 * @param {number} locationId  - The location to deduct from
 * @param {number} productId   - The product to deduct
 * @param {number} qty         - Total quantity to deduct
 * @param {string} [note]      - Optional reference note for audit trail
 * @returns {Object} { success, deducted: [{ batch_no, qty_taken, remaining }] }
 */
function deductStock(locationId, productId, qty, specificBatchNo = null, note = null) {
  return db.transaction(() => {
    // Lock rows in FIFO order (earliest expiry first)
    // Note: SQLite doesn't have row-level FOR UPDATE locking, but the whole db.transaction() ensures serializability.
    let query = `
      SELECT sl.batch_no, sl.quantity, b.expiry_date
       FROM stock_level sl
       JOIN batch b ON b.batch_no = sl.batch_no
       WHERE sl.location_id = ?
         AND b.product_id   = ?
         AND sl.quantity     > 0
    `;
    const params = [locationId, productId];
    if (specificBatchNo) {
      query += ` AND sl.batch_no = ?`;
      params.push(specificBatchNo);
    }
    query += ` ORDER BY b.expiry_date ASC`;

    const batches = db.prepare(query).all(...params);

    const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0);
    if (totalAvailable < qty) {
      return {
        success: false,
        error: `Insufficient stock. Requested: ${qty}, available: ${totalAvailable}`,
      };
    }

    let remaining = qty;
    const deducted = [];
    
    const updateStock = db.prepare(`
      UPDATE stock_level
      SET quantity = ?
      WHERE location_id = ? AND batch_no = ?
    `);
    
    const insertMovement = db.prepare(`
      INSERT INTO stock_movement
        (batch_no, from_location, to_location, quantity, movement, reference_note)
      VALUES (?, ?, NULL, ?, 'OUT', ?)
    `);

    for (const batch of batches) {
      if (remaining <= 0) break;

      const take = Math.min(batch.quantity, remaining);
      const newQty = batch.quantity - take;

      updateStock.run(newQty, locationId, batch.batch_no);

      // Audit trail
      insertMovement.run(batch.batch_no, locationId, take, note);

      deducted.push({
        batch_no: batch.batch_no,
        expiry_date: batch.expiry_date,
        qty_taken: take,
        remaining: newQty,
      });

      remaining -= take;
    }

    return { success: true, deducted };
  })();
}

/**
 * Transfer stock between two locations using FIFO.
 *
 * @param {number} fromLocationId
 * @param {number} toLocationId
 * @param {number} productId
 * @param {number} qty
 * @param {string} [note]
 * @returns {Object} { success, transfers: [{ batch_no, qty_moved }] }
 */
function transferStock(fromLocationId, toLocationId, productId, qty, note = null) {
  return db.transaction(() => {
    const batches = db.prepare(`
      SELECT sl.batch_no, sl.quantity, b.expiry_date
       FROM stock_level sl
       JOIN batch b ON b.batch_no = sl.batch_no
       WHERE sl.location_id = ?
         AND b.product_id   = ?
         AND sl.quantity     > 0
       ORDER BY b.expiry_date ASC
    `).all(fromLocationId, productId);

    const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0);
    if (totalAvailable < qty) {
      return {
        success: false,
        error: `Insufficient stock at source. Requested: ${qty}, available: ${totalAvailable}`,
      };
    }

    let remaining = qty;
    const transfers = [];

    const updateSourceStock = db.prepare(`
      UPDATE stock_level SET quantity = quantity - ?
      WHERE location_id = ? AND batch_no = ?
    `);
    
    const upsertDestStock = db.prepare(`
      INSERT INTO stock_level (location_id, batch_no, quantity, reorder_point)
      VALUES (?, ?, ?, 0)
      ON CONFLICT (location_id, batch_no)
      DO UPDATE SET quantity = stock_level.quantity + EXCLUDED.quantity
    `);
    
    const insertMovement = db.prepare(`
      INSERT INTO stock_movement
        (batch_no, from_location, to_location, quantity, movement, reference_note)
      VALUES (?, ?, ?, ?, 'TRANSFER', ?)
    `);

    for (const batch of batches) {
      if (remaining <= 0) break;

      const take = Math.min(batch.quantity, remaining);

      // Decrease source
      updateSourceStock.run(take, fromLocationId, batch.batch_no);

      // Upsert destination
      upsertDestStock.run(toLocationId, batch.batch_no, take);

      // Audit trail
      insertMovement.run(batch.batch_no, fromLocationId, toLocationId, take, note);

      transfers.push({
        batch_no: batch.batch_no,
        expiry_date: batch.expiry_date,
        qty_moved: take,
      });

      remaining -= take;
    }

    return { success: true, transfers };
  })();
}

/**
 * Receive stock into a location (goods-in).
 *
 * @param {number} locationId
 * @param {string} batchNo
 * @param {number} qty
 * @param {number} [reorderPoint=0]
 * @param {string} [note]
 */
function receiveStock(locationId, batchNo, qty, reorderPoint = 0, note = null) {
  return db.transaction(() => {
    db.prepare(`
      INSERT INTO stock_level (location_id, batch_no, quantity, reorder_point)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (location_id, batch_no)
       DO UPDATE SET quantity = stock_level.quantity + EXCLUDED.quantity
    `).run(locationId, batchNo, qty, reorderPoint);

    db.prepare(`
      INSERT INTO stock_movement
         (batch_no, from_location, to_location, quantity, movement, reference_note)
       VALUES (?, NULL, ?, ?, 'IN', ?)
    `).run(batchNo, locationId, qty, note);

    return { success: true };
  })();
}

/**
 * Get low-stock items for a specific location (or all locations).
 *
 * @param {number|null} locationId - null for all locations
 * @returns {Array} rows from vw_low_stock
 */
function getLowStock(locationId = null) {
  const where = locationId ? 'WHERE location_id = ?' : '';
  const params = locationId ? [locationId] : [];
  return db.prepare(`SELECT * FROM vw_low_stock ${where} ORDER BY location_name, product_name`).all(...params);
}

/**
 * Get supplier-allocated inventory.
 *
 * @param {string|null} supplierName - null for all suppliers
 * @returns {Array}
 */
function getSupplierInventory(supplierName = null) {
  const where = supplierName ? 'WHERE supplier_name = ?' : '';
  const params = supplierName ? [supplierName] : [];
  return db.prepare(`SELECT * FROM vw_supplier_inventory ${where} ORDER BY supplier_name, product_name`).all(...params);
}

/**
 * Receive from Company: Strictly Supplier -> Warehouse
 * Automatically registers the batch if it doesn't exist.
 */
function receiveFromCompany(supplierId, warehouseId, productId, rawBatchNo, expiryDate, qty, note = null) {
  return db.transaction(() => {
    const supplier = db.prepare('SELECT type FROM location WHERE location_id = ?').get(supplierId);
    if (!supplier || supplier.type !== 'Supplier') return { success: false, error: 'Source must be a Supplier' };
    
    const warehouse = db.prepare('SELECT type FROM location WHERE location_id = ?').get(warehouseId);
    if (!warehouse || warehouse.type !== 'Warehouse') return { success: false, error: 'Destination must be a Warehouse' };

    // Format batch to be globally unique: P{productId}-{rawBatchNo}
    const batchNo = `P${productId}-${rawBatchNo}`;

    // 1. Check if batch exists and validate expiry
    const existingBatch = db.prepare('SELECT * FROM batch WHERE batch_no = ?').get(batchNo);
    if (existingBatch) {
      if (existingBatch.product_id !== Number(productId)) {
        return { success: false, error: 'Batch number conflict with a different product.' };
      }
      if (existingBatch.expiry_date !== expiryDate) {
        return { success: false, error: `Batch already exists with a different expiry date (${existingBatch.expiry_date}). Please verify.` };
      }
    } else {
      // Create new batch
      db.prepare(`
        INSERT INTO batch (batch_no, product_id, expiry_date)
        VALUES (?, ?, ?)
      `).run(batchNo, productId, expiryDate);
    }

    // 2. Upsert stock level in Warehouse
    db.prepare(`
      INSERT INTO stock_level (location_id, batch_no, quantity, reorder_point)
      VALUES (?, ?, ?, 0)
      ON CONFLICT (location_id, batch_no)
      DO UPDATE SET quantity = stock_level.quantity + EXCLUDED.quantity
    `).run(warehouseId, batchNo, qty);

    // 3. Record movement
    db.prepare(`
      INSERT INTO stock_movement
        (batch_no, from_location, to_location, quantity, movement, reference_note)
      VALUES (?, ?, ?, ?, 'TRANSFER', ?)
    `).run(batchNo, supplierId, warehouseId, qty, note);

    return { success: true };
  })();
}

/**
 * Dispatch to Pharmacy: Strictly Warehouse -> Pharmacy
 */
function dispatchToPharmacy(warehouseId, pharmacyId, productId, qty, note = null) {
  const warehouse = db.prepare('SELECT type FROM location WHERE location_id = ?').get(warehouseId);
  if (!warehouse || warehouse.type !== 'Warehouse') return { success: false, error: 'Source must be a Warehouse' };

  const pharmacy = db.prepare('SELECT type FROM location WHERE location_id = ?').get(pharmacyId);
  if (!pharmacy || pharmacy.type !== 'Pharmacy') return { success: false, error: 'Destination must be a Pharmacy' };

  return transferStock(warehouseId, pharmacyId, productId, qty, note);
}

/**
 * Pharmacy Sale: Strictly deducts from Pharmacy
 */
function pharmacySale(pharmacyId, productId, qty, specificBatchNo = null, note = null) {
  const pharmacy = db.prepare('SELECT type FROM location WHERE location_id = ?').get(pharmacyId);
  if (!pharmacy || pharmacy.type !== 'Pharmacy') return { success: false, error: 'Location must be a Pharmacy' };

  return deductStock(pharmacyId, productId, qty, specificBatchNo, note);
}

/**
 * Adjust Stock: Discard damaged or expired stock from a specific batch.
 */
function adjustStock(locationId, productId, specificBatchNo, qty, note = null) {
  return db.transaction(() => {
    const existing = db.prepare(`
      SELECT sl.quantity 
      FROM stock_level sl 
      JOIN batch b ON b.batch_no = sl.batch_no 
      WHERE sl.location_id = ? AND sl.batch_no = ? AND b.product_id = ?
    `).get(locationId, specificBatchNo, productId);

    if (!existing || existing.quantity < qty) {
      return { success: false, error: 'Insufficient stock in this specific batch to discard.' };
    }

    db.prepare(`
      UPDATE stock_level SET quantity = quantity - ?
      WHERE location_id = ? AND batch_no = ?
    `).run(qty, locationId, specificBatchNo);

    db.prepare(`
      INSERT INTO stock_movement
        (batch_no, from_location, to_location, quantity, movement, reference_note)
      VALUES (?, ?, NULL, ?, 'ADJUSTMENT', ?)
    `).run(specificBatchNo, locationId, qty, note || 'Damaged/Expired Stock Adjustment');

    return { success: true };
  })();
}

module.exports = {
  deductStock,
  transferStock,
  receiveStock,
  getLowStock,
  getSupplierInventory,
  receiveFromCompany,
  dispatchToPharmacy,
  pharmacySale,
  adjustStock
};
