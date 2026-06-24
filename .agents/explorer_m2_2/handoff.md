# Handoff Report: Pharmacy Dashboard Report Design

## 1. Observation
We observed the following properties of the codebase:
- **Database File**: The SQLite database file is located at `data/vet-monitor.db` (automatically created by connection utility).
- **Connection Initialization**: Located in `db/connection.js`. It imports Node.js's native `node:sqlite` module (using `DatabaseSync`) and enables foreign keys:
  ```javascript
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  ```
- **Schema**: Defined in `db/migrations/001_core_schema.up.sql`. Key tables are:
  - `product` containing `product_id`, `sku`, `name`, `category`.
  - `batch` containing `batch_no`, `product_id`, `expiry_date` (TEXT).
  - `location` containing `location_id`, `name`, `type` (CHECK constraints for `'Pharmacy'`, `'Warehouse'`, `'Exporter'`), `is_active` (INTEGER).
  - `stock_level` containing `location_id`, `batch_no`, `quantity`, `reorder_point`. It has a partial index `idx_stock_level_low` for rows matching `quantity <= reorder_point`.
  - `stock_movement` containing `movement_id`, `batch_no`, `from_location`, `to_location`, `quantity`, `movement` (`'IN'`, `'OUT'`, `'TRANSFER'`, `'ADJUSTMENT'`), and `created_at` (TEXT, default `CURRENT_TIMESTAMP` which is UTC).
- **Pharmacy Identification**: Active locations of type pharmacy are identified using `location.type = 'Pharmacy' AND location.is_active = 1`.
- **Sale Recording**: Stock deductions (sales) are recorded as movements of type `'OUT'`. Specifically, in `lib/stock.js` (lines 49-53):
  ```javascript
  const insertMovement = db.prepare(`
    INSERT INTO stock_movement
      (batch_no, from_location, to_location, quantity, movement, reference_note)
    VALUES (?, ?, NULL, ?, 'OUT', ?)
  `);
  ```
- **SQLite Date Operations**: Date and time calculations in SQLite are performed in UTC.
  - Sold in current calendar month: `created_at >= date('now', 'start of month')` (which resolves to `'YYYY-MM-01'` UTC).
  - Expiring in <= 4 months and > now: `expiry_date <= date('now', '+4 months') AND expiry_date > date('now')`.
  - Days until expiry: `CAST(julianday(expiry_date) - julianday('now') AS INTEGER)`.
- **Existing Views**: Two views in `001_core_schema.up.sql` are related:
  - `vw_low_stock` (lines 112-127) lists stock levels below reorder point.
  - `vw_near_expiry` (lines 145-162) lists active stock level rows expiring within 4 months.

---

## 2. Logic Chain
Based on these observations, we conclude the following query designs and endpoint routing are correct:
1. **Router Location**: Since other API routing is partitioned under `api/`, the dashboard reporting should be implemented in `api/reports.js` and mounted in `server.js` using `app.use('/api/reports', require('./api/reports'));`.
2. **Standardized SQL Dialect & UTC Consistency**:
   - Because `stock_movement.created_at` defaults to `CURRENT_TIMESTAMP` (UTC time), checking if a movement occurred in the current month using `created_at >= date('now', 'start of month')` aligns perfectly on the UTC timezone.
   - For near-expiry, `expiry_date` is compared against `date('now')` and `date('now', '+4 months')` using SQLite's native date functions.
3. **Query Standardization**:
   - **`totalMonthlySales`**: Sum of quantity in `stock_movement` filtered by `movement = 'OUT'`, location type `'Pharmacy'`, and `created_at` starting this month.
   - **`insufficientProductsCount`**: Row count of `stock_level` at pharmacies where `quantity <= reorder_point`.
   - **`nearExpiryBatchesCount`**: Row count of batches at pharmacies where quantity is positive, and expiry date falls between today and 4 months in the future.
   - **`insufficientProducts` (list)**: Detailed properties matching the contract schema (including `category`) filtered by `quantity <= reorder_point` and location type `'Pharmacy'`.
   - **`nearExpiryBatches` (list)**: Detailed properties matching the contract schema (including calculated `days_until_expiry`) filtered by expiration window, positive quantity, and location type `'Pharmacy'`.
   - **`topSellingProducts` (list)**: Groups `'OUT'` movements by product, sums quantity, filters by current month and pharmacy locations, and orders by quantity descending.

---

## 3. Caveats
- **Timezone Boundary**: `date('now', 'start of month')` operates on UTC. If the local system is in a different timezone (e.g. UTC+3), there might be a few hours at the start of the month where a local sale falls into a different calendar month in UTC. However, since the database is consistently stored in UTC (`CURRENT_TIMESTAMP`), standardizing on SQLite UTC calculations is the most robust way to query without introducing inconsistency.
- **days_until_expiry rounding**: `julianday('now')` contains a fractional part for time of day, whereas `expiry_date` is a pure date string (effectively midnight). Truncating with `CAST(... AS INTEGER)` may under-report the exact remaining time by up to 24 hours. This is the standard behavior utilized by `vw_near_expiry` in the codebase.

---

## 4. Conclusion
We have fully designed the SQL queries and route setup for `GET /api/reports/pharmacy-dashboard`.
The proposed route file `api/reports.js` has been created as `proposed_api_reports.js` and the mount patch as `proposed_server.patch` in the explorer's working directory (`.agents/explorer_m2_2/`).

The SQL designs are as follows:

### Query 1: totalMonthlySales
```sql
SELECT COALESCE(SUM(sm.quantity), 0) AS total_monthly_sales
FROM stock_movement sm
JOIN location l ON l.location_id = sm.from_location
WHERE sm.movement = 'OUT'
  AND l.type = 'Pharmacy'
  AND sm.created_at >= date('now', 'start of month');
```

### Query 2: insufficientProductsCount
```sql
SELECT COUNT(*) AS count
FROM stock_level sl
JOIN location l ON l.location_id = sl.location_id
WHERE l.type = 'Pharmacy'
  AND sl.quantity <= sl.reorder_point;
```

### Query 3: nearExpiryBatchesCount
```sql
SELECT COUNT(*) AS count
FROM batch b
JOIN stock_level sl ON sl.batch_no = b.batch_no
JOIN location l ON l.location_id = sl.location_id
WHERE l.type = 'Pharmacy'
  AND b.expiry_date <= date('now', '+4 months')
  AND b.expiry_date > date('now')
  AND sl.quantity > 0;
```

### Query 4: insufficientProducts (list)
```sql
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
ORDER BY l.name ASC, p.name ASC, b.expiry_date ASC;
```

### Query 5: nearExpiryBatches (list)
```sql
SELECT
  b.batch_no,
  p.sku,
  p.name AS product_name,
  b.expiry_date,
  CAST(julianday(b.expiry_date) - julianday('now') AS INTEGER) AS days_until_expiry,
  sl.location_id,
  l.name AS location_name,
  sl.quantity
FROM batch b
JOIN product p ON p.product_id = b.product_id
JOIN stock_level sl ON sl.batch_no = b.batch_no
JOIN location l ON l.location_id = sl.location_id
WHERE l.type = 'Pharmacy'
  AND b.expiry_date <= date('now', '+4 months')
  AND b.expiry_date > date('now')
  AND sl.quantity > 0
ORDER BY b.expiry_date ASC, p.name ASC;
```

### Query 6: topSellingProducts (list)
```sql
SELECT
  p.name AS product_name,
  p.sku,
  SUM(sm.quantity) AS quantity_sold
FROM stock_movement sm
JOIN batch b ON b.batch_no = sm.batch_no
JOIN product p ON p.product_id = b.product_id
JOIN location l ON l.location_id = sm.from_location
WHERE sm.movement = 'OUT'
  AND l.type = 'Pharmacy'
  AND sm.created_at >= date('now', 'start of month')
GROUP BY p.product_id, p.name, p.sku
ORDER BY quantity_sold DESC, p.name ASC;
```

---

## 5. Verification Method
To independently verify the implementation:
1. Apply the patch `proposed_server.patch` and create `api/reports.js` using `proposed_api_reports.js`.
2. Start the application: `npm start` or `npm run dev`.
3. Perform manual integration verification by querying the API using PowerShell or curl:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3000/api/reports/pharmacy-dashboard" -Method Get
   ```
4. Verify the outputs match the database contents:
   - Sum of movements of type `'OUT'` from locations with `type = 'Pharmacy'` in the current month should equal `totalMonthlySales`.
   - Length of `insufficientProducts` should equal `insufficientProductsCount`.
   - Length of `nearExpiryBatches` should equal `nearExpiryBatchesCount`.
   - `topSellingProducts` must have its elements ordered by `quantity_sold` descending.
