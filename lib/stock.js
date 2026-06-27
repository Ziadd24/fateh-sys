/**
 * FIFO Stock Operations
 *
 * Core business logic for stock deductions, transfers, and receiving.
 * All deductions follow First-In, First-Out: oldest expiry batches are consumed first.
 */
const db = require('../db/connection');

/**
 * Cleanup a batch if its total quantity across all locations is 0.
 * Deletes: stock_level rows → expiry_alerts → inventory_discrepancies → stock_movements → batch.
 * MUST be called from within an active transaction.
 *
 * @param {string} batchNo  - The batch to inspect and potentially remove
 */
function cleanupEmptyBatch(batchNo) {
  const row = db.prepare(
    'SELECT COALESCE(SUM(quantity), 0) AS total FROM stock_level WHERE batch_no = ?'
  ).get(batchNo);

  if (row && row.total === 0) {
    // Remove in dependency order so FK constraints are satisfied
    db.prepare('DELETE FROM expiry_alert WHERE batch_no = ?').run(batchNo);
    db.prepare('DELETE FROM inventory_discrepancy WHERE batch_no = ?').run(batchNo);
    db.prepare('DELETE FROM stock_level WHERE batch_no = ?').run(batchNo);
    db.prepare('DELETE FROM stock_movement WHERE batch_no = ?').run(batchNo);
    db.prepare('DELETE FROM batch WHERE batch_no = ?').run(batchNo);
  }
}

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
  if (qty <= 0) return { success: false, error: 'Quantity must be greater than zero.' };

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

      // Auto-remove the batch if it is now completely depleted across all locations
      cleanupEmptyBatch(batch.batch_no);
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
function transferStock(fromLocationId, toLocationId, productId, qty, specificBatchNo = null, note = null) {
  if (qty <= 0) return { success: false, error: 'Quantity must be greater than zero.' };
  
  return db.transaction(() => {
    let query = `
      SELECT sl.batch_no, sl.quantity, b.expiry_date
       FROM stock_level sl
       JOIN batch b ON b.batch_no = sl.batch_no
       WHERE sl.location_id = ?
         AND b.product_id   = ?
         AND sl.quantity     > 0
    `;
    const params = [fromLocationId, productId];
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

  return transferStock(warehouseId, pharmacyId, productId, qty, null, note);
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
function adjustStock(locationId, productId, specificBatchNo, note = null) {
  return db.transaction(() => {
    const existing = db.prepare(`
      SELECT sl.quantity 
      FROM stock_level sl 
      JOIN batch b ON b.batch_no = sl.batch_no 
      WHERE sl.location_id = ? AND sl.batch_no = ? AND b.product_id = ?
    `).get(locationId, specificBatchNo, productId);

    if (!existing || existing.quantity <= 0) {
      return { success: false, error: 'No stock available in this specific batch to discard.' };
    }

    const qty = existing.quantity;

    db.prepare(`
      UPDATE stock_level SET quantity = 0
      WHERE location_id = ? AND batch_no = ?
    `).run(locationId, specificBatchNo);

    db.prepare(`
      INSERT INTO stock_movement
        (batch_no, from_location, to_location, quantity, movement, reference_note)
      VALUES (?, ?, NULL, ?, 'ADJUSTMENT', ?)
    `).run(specificBatchNo, locationId, qty, note || 'Damaged/Expired Stock Adjustment');

    // Auto-remove the batch if it is now completely depleted across all locations
    cleanupEmptyBatch(specificBatchNo);

    return { success: true };
  })();
}

/**
 * Bulk Receive from Company
 * @param {Array} items - [{ productId, rawBatchNo, expiryDate, qty, reorderPoint }]
 */
function receiveFromCompanyBulk(supplierId, warehouseId, items, note = null) {
  return db.transaction(() => {
    const supplier = db.prepare('SELECT type FROM location WHERE location_id = ?').get(supplierId);
    if (!supplier || supplier.type !== 'Supplier') return { success: false, error: 'Source must be a Supplier' };
    
    const warehouse = db.prepare('SELECT type FROM location WHERE location_id = ?').get(warehouseId);
    if (!warehouse || warehouse.type !== 'Warehouse') return { success: false, error: 'Destination must be a Warehouse' };

    for (const item of items) {
      const { productId, expiryDate, qty, reorderPoint } = item;
      const rawBatchNo = item.batchNo || item.rawBatchNo || 'N/A';
      const batchNo = `P${productId}-${rawBatchNo}`;

      const existingBatch = db.prepare('SELECT * FROM batch WHERE batch_no = ?').get(batchNo);
      if (existingBatch) {
        if (existingBatch.product_id !== Number(productId)) {
          throw new Error(`Batch number conflict with a different product for batch ${rawBatchNo}.`);
        }
        if (existingBatch.expiry_date !== expiryDate) {
          throw new Error(`Batch already exists with a different expiry date for batch ${rawBatchNo}.`);
        }
      } else {
        db.prepare('INSERT INTO batch (batch_no, product_id, expiry_date) VALUES (?, ?, ?)')
          .run(batchNo, productId, expiryDate);
      }

      db.prepare(`
        INSERT INTO stock_level (location_id, batch_no, quantity, reorder_point)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (location_id, batch_no)
        DO UPDATE SET 
          quantity = stock_level.quantity + EXCLUDED.quantity,
          reorder_point = EXCLUDED.reorder_point
      `).run(warehouseId, batchNo, qty, reorderPoint || 0);

      db.prepare(`
        INSERT INTO stock_movement (batch_no, from_location, to_location, quantity, movement, reference_note)
        VALUES (?, ?, ?, ?, 'TRANSFER', ?)
      `).run(batchNo, supplierId, warehouseId, qty, note);

      if (item.price !== undefined) {
        db.prepare(`
          INSERT INTO supplier_offer (supplier_id, product_id, price, condition)
          VALUES (?, ?, ?, 'New')
          ON CONFLICT(supplier_id, product_id)
          DO UPDATE SET price = EXCLUDED.price
        `).run(supplierId, productId, item.price);

        db.prepare('UPDATE product SET unit_cost = ? WHERE product_id = ?').run(item.price, productId);
      }
    }
    return { success: true };
  })();
}

/**
 * Bulk Dispatch to Pharmacy
 * @param {Array} items - [{ productId, qty }]
 */
function dispatchToPharmacyBulk(warehouseId, pharmacyId, items, note = null) {
  return db.transaction(() => {
    const warehouse = db.prepare('SELECT type FROM location WHERE location_id = ?').get(warehouseId);
    if (!warehouse || warehouse.type !== 'Warehouse') return { success: false, error: 'Source must be a Warehouse' };

    const pharmacy = db.prepare('SELECT type FROM location WHERE location_id = ?').get(pharmacyId);
    if (!pharmacy || pharmacy.type !== 'Pharmacy') return { success: false, error: 'Destination must be a Pharmacy' };

    const allTransfers = [];
    for (const item of items) {
      const { productId, qty, specificBatchNo } = item;
      const result = transferStock(warehouseId, pharmacyId, productId, qty, specificBatchNo || null, note);
      if (!result.success) {
        throw new Error(`Failed to transfer product ${productId}: ${result.error}`);
      }
      allTransfers.push(...result.transfers);
    }
    return { success: true, transfers: allTransfers };
  })();
}

/**
 * Return stock to Supplier
 */
function returnToSupplier(locationId, supplierId, productId, qty, note = null) {
  if (qty <= 0) return { success: false, error: 'Quantity must be greater than zero.' };

  return db.transaction(() => {
    // 1. Deduct from our location
    const deductResult = deductStock(locationId, productId, qty, null, 'RETURN_DEDUCT_TEMP');
    if (!deductResult.success) throw new Error(deductResult.error);

    // 2. The deductStock logged an 'OUT' movement with a temp note. 
    // We should fix the movement records to reflect it as an 'OUT' to the supplier.
    for (const d of deductResult.deducted) {
      db.prepare(`
        UPDATE stock_movement 
        SET to_location = ?, movement = 'TRANSFER', reference_note = ? 
        WHERE batch_no = ? AND from_location = ? AND quantity = ? AND movement = 'OUT' AND reference_note = 'RETURN_DEDUCT_TEMP'
      `).run(supplierId, note || 'Return to Supplier', d.batch_no, locationId, d.qty_taken);
    }

    return deductResult;
  })();
}

/**
 * Reverse a stock movement
 */
function reverseTransaction(movementId, note = null) {
  return db.transaction(() => {
    const movement = db.prepare('SELECT * FROM stock_movement WHERE movement_id = ?').get(movementId);
    if (!movement) return { success: false, error: 'Movement not found' };

    if (movement.movement === 'TRANSFER') {
      // Transfer back exact batch from to_location to from_location
      const existing = db.prepare('SELECT quantity FROM stock_level WHERE location_id = ? AND batch_no = ?').get(movement.to_location, movement.batch_no);
      if (!existing || existing.quantity < movement.quantity) {
        throw new Error('Cannot reverse TRANSFER: Stock has already been consumed at destination.');
      }
      // Deduct from destination
      db.prepare(`
        UPDATE stock_level SET quantity = quantity - ? WHERE location_id = ? AND batch_no = ?
      `).run(movement.quantity, movement.to_location, movement.batch_no);
      
      // Upsert back to source
      db.prepare(`
        INSERT INTO stock_level (location_id, batch_no, quantity, reorder_point)
        VALUES (?, ?, ?, 0)
        ON CONFLICT (location_id, batch_no)
        DO UPDATE SET quantity = stock_level.quantity + EXCLUDED.quantity
      `).run(movement.from_location, movement.batch_no, movement.quantity);

      // Log movement as REVERSAL
      db.prepare(`
        INSERT INTO stock_movement (batch_no, from_location, to_location, quantity, movement, reference_note)
        VALUES (?, ?, ?, ?, 'TRANSFER', ?)
      `).run(movement.batch_no, movement.to_location, movement.from_location, movement.quantity, note || `Reversal of movement ${movementId}`);
    } else if (movement.movement === 'OUT' || movement.movement === 'ADJUSTMENT') {
      // Add back to from_location (using UPSERT to be safe if row was missing)
      db.prepare(`
        INSERT INTO stock_level (location_id, batch_no, quantity, reorder_point)
        VALUES (?, ?, ?, 0)
        ON CONFLICT (location_id, batch_no)
        DO UPDATE SET quantity = stock_level.quantity + EXCLUDED.quantity
      `).run(movement.from_location, movement.batch_no, movement.quantity);
      
      // Mark original movement as reversed instead of inserting a fake 'IN' movement
      db.prepare(`
        UPDATE stock_movement SET reference_note = ? WHERE movement_id = ?
      `).run(`[REVERSED] ` + (movement.reference_note || ''), movementId);
      
    } else if (movement.movement === 'IN') {
      // Deduct from to_location
      const existing = db.prepare('SELECT quantity FROM stock_level WHERE location_id = ? AND batch_no = ?').get(movement.to_location, movement.batch_no);
      if (!existing || existing.quantity < movement.quantity) {
        throw new Error('Cannot reverse IN: Stock has already been consumed.');
      }
      db.prepare(`
        UPDATE stock_level SET quantity = quantity - ? WHERE location_id = ? AND batch_no = ?
      `).run(movement.quantity, movement.to_location, movement.batch_no);

      // Mark original movement as reversed instead of inserting a fake 'OUT' movement
      db.prepare(`
        UPDATE stock_movement SET reference_note = ? WHERE movement_id = ?
      `).run(`[REVERSED] ` + (movement.reference_note || ''), movementId);
    }

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
  adjustStock,
  receiveFromCompanyBulk,
  dispatchToPharmacyBulk,
  returnToSupplier,
  reverseTransaction
};
