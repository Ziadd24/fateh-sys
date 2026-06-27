## 2026-06-26T00:21:56Z
You are tasked with applying direct code remediation and refactoring to resolve 11 critical issues identified during a system audit of the Vet Monitor system.
Your working directory is d:\ziad 2026\vet-monitor\.agents\worker_remediation.

Please modify the codebase files to implement the following changes:

1. `lib/stock.js` (around lines 421-427, inside returnToSupplier):
   Modify the SQL update to change the movement type to 'TRANSFER' so it does not violate the check constraint.
   Target:
   ```javascript
      db.prepare(`
        UPDATE stock_movement 
        SET to_location = ?, reference_note = ? 
        WHERE batch_no = ? AND from_location = ? AND quantity = ? AND movement = 'OUT' AND reference_note = 'RETURN_DEDUCT_TEMP'
      `).run(supplierId, note || 'Return to Supplier', d.batch_no, locationId, d.qty_taken);
   ```
   Replacement:
   ```javascript
      db.prepare(`
        UPDATE stock_movement 
        SET to_location = ?, movement = 'TRANSFER', reference_note = ? 
        WHERE batch_no = ? AND from_location = ? AND quantity = ? AND movement = 'OUT' AND reference_note = 'RETURN_DEDUCT_TEMP'
      `).run(supplierId, note || 'Return to Supplier', d.batch_no, locationId, d.qty_taken);
   ```

2. `api/locations.js` (around line 85):
   Remove 'address' from requireFields in the PUT route to allow name-only updates:
   Target:
   ```javascript
   router.put('/:id', requireFields('name', 'address'), asyncHandler((req, res) => {
   ```
   Replacement:
   ```javascript
   router.put('/:id', requireFields('name'), asyncHandler((req, res) => {
   ```

3. `api/analytics.js`:
   - In inbound query (around line 211), allow TRANSFER movements from Supplier type locations:
     Target:
     ```javascript
         WHERE l_to.type = 'Warehouse' AND sm.movement = 'IN'
     ```
     Replacement:
     ```javascript
         WHERE l_to.type = 'Warehouse' AND (sm.movement = 'IN' OR (sm.movement = 'TRANSFER' AND l_from.type = 'Supplier'))
     ```
   - In fastMovers (around line 430) and deadStock (around line 449), exclude reversed stock movements (whose reference note starts with '[REVERSED]'):
     Add:
     ```sql
     AND (sm.reference_note IS NULL OR sm.reference_note NOT LIKE '[REVERSED]%')
     ```
   - In the importers query (around lines 282-306):
     Add `COALESCE(AVG(CASE WHEN o.expected_delivery_date IS NOT NULL AND o.fulfilled_at <= o.expected_delivery_date THEN 100.0 ELSE 0.0 END), 0) as delivery_rating` to the SELECT list.
     And around line 314, calculate the deliveryRating using `Math.round(i.delivery_rating)` instead of the random mock `Math.min(100, 80 + Math.random() * 20)`.

4. `api/reports.js`:
   - In both the totalMonthlySalesRow query (around line 14) and topSellingProducts query (around line 69), add a check to exclude reversed movements:
     ```sql
     AND (sm.reference_note IS NULL OR sm.reference_note NOT LIKE '[REVERSED]%')
     ```

5. `db/migrate.js` (around line 84):
   - Update migrateDown() to delete the migration from the _migrations table after rolling back:
     Target:
     ```javascript
       db.transaction(() => {
         db.exec(sql);
       })();
     ```
     Replacement:
     ```javascript
       db.transaction(() => {
         db.exec(sql);
         db.prepare('DELETE FROM _migrations WHERE filename = ?').run(last);
       })();
     ```

6. `db/migrations/001_core_schema.up.sql` (around line 127) and `db/migrations/003_rename_exporter_to_supplier.up.sql` (around line 48):
   - Update `vw_low_stock` definition to exclude depleted batches with zero reorder points:
     Target:
     ```sql
     WHERE sl.quantity <= sl.reorder_point;
     ```
     Replacement:
     ```sql
     WHERE sl.quantity <= sl.reorder_point AND (sl.quantity > 0 OR sl.reorder_point > 0);
     ```

7. `api/analytics.js` shortage risks query (around line 468):
   - Change inner joins on stock_level and batch to LEFT JOINs to prevent excluding out-of-stock products:
     Target:
     ```javascript
     const shortageRisks = db.prepare(`
         SELECT 
             p.product_id, p.name, p.sku, p.category,
             SUM(sl.quantity) as total_stock,
             MAX(sl.reorder_point) as reorder_point
         FROM product p
         JOIN batch b ON p.product_id = b.product_id
         JOIN stock_level sl ON b.batch_no = sl.batch_no
         JOIN location l ON sl.location_id = l.location_id AND l.type = 'Warehouse'
         GROUP BY p.product_id
         HAVING total_stock <= reorder_point
         ORDER BY (CAST(total_stock AS REAL) / MAX(MAX(reorder_point, 1), 1)) ASC
     `).all();
     ```
     Replacement:
     ```javascript
     const shortageRisks = db.prepare(`
         SELECT 
             p.product_id, p.name, p.sku, p.category,
             COALESCE(SUM(sl.quantity), 0) as total_stock,
             COALESCE(MAX(sl.reorder_point), 0) as reorder_point
         FROM product p
         LEFT JOIN batch b ON p.product_id = b.product_id
         LEFT JOIN stock_level sl ON b.batch_no = sl.batch_no
         LEFT JOIN location l ON sl.location_id = l.location_id AND l.type = 'Warehouse'
         GROUP BY p.product_id
         HAVING total_stock <= reorder_point
         ORDER BY (CAST(total_stock AS REAL) / MAX(MAX(reorder_point, 1), 1)) ASC
     `).all();
     ```

8. `public/index.html`:
   - In category-switcher (around line 67), add the Exporter category button:
     ```html
     <button class="category-btn" data-category="Exporter" onclick="switchCategory('Exporter')" style="flex: 0 1 300px;">المصادر الخارجية</button>
     ```
   - In sidebar__nav (around line 32), add the three hidden tab buttons:
     ```html
     <button class="tab-btn" onclick="switchTab('pharmacies')" style="display: none;"></button>
     <button class="tab-btn" onclick="switchTab('warehouse')" style="display: none;"></button>
     <button class="tab-btn" onclick="switchTab('exporters')" style="display: none;"></button>
     ```
   - Right before `<div id="toast-container"></div>` at the bottom, add the three hidden tab-content divs:
     ```html
     <div id="tab-pharmacies" class="tab-content" style="display: none;"></div>
     <div id="tab-warehouse" class="tab-content" style="display: none;"></div>
     <div id="tab-exporters" class="tab-content" style="display: none;"></div>
     ```

9. `public/app.js`:
   - Inside `switchTab(tabId)` (around line 77), add category switching triggers for the tests' expected tab names:
     ```javascript
     if (tabId === 'pharmacies') switchCategory('Pharmacy');
     if (tabId === 'warehouse') switchCategory('Warehouse');
     if (tabId === 'exporters') switchCategory('Exporter');
     ```
   - Inside `renderInventoryTable()` (around line 760), map the 'Exporter' category to 'Supplier' for database-compliant filtering:
     Target:
     ```javascript
     const filtered = state.inventory.filter(item => !state.category || item.location_type === state.category);
     ```
     Replacement:
     ```javascript
     const targetCategory = state.category === 'Exporter' ? 'Supplier' : state.category;
     const filtered = state.inventory.filter(item => !state.category || item.location_type === targetCategory);
     ```

10. `tests/e2e.test.js` (around line 83 & line 136):
    - Add 'tab-pharmacies', 'tab-warehouse', 'tab-exporters', 'tab-btn-pharmacies', 'tab-btn-warehouse', and 'tab-btn-exporters' to `htmlElements` Set.
    - Add these elements to querySelectorAll mapping for '.tab-btn' and '.tab-content' so the test sandbox can find them.
