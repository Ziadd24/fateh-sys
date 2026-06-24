# Handoff Report — Explorer 3

## 1. Observation
- **Database Connection and Tooling**:
  - File `db/connection.js` (lines 6-16) uses Node's native SQLite support:
    ```javascript
    const { DatabaseSync } = require('node:sqlite');
    ...
    const dbPath = path.join(dataDir, 'vet-monitor.db');
    const db = new DatabaseSync(dbPath);
    ```
  - This indicates the database engine is **SQLite**.
- **Location Types and Movements**:
  - `db/migrations/001_core_schema.up.sql` (line 38-45) shows the `location` schema:
    ```sql
    CREATE TABLE location (
        location_id  INTEGER PRIMARY KEY AUTOINCREMENT,
        name         TEXT NOT NULL UNIQUE,
        type         TEXT NOT NULL CHECK(type IN ('Pharmacy', 'Warehouse', 'Exporter')),
        address      TEXT,
        is_active    INTEGER NOT NULL DEFAULT 1,
        created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ```
    Locations of type `'Pharmacy'` are identified by `type = 'Pharmacy'`.
  - `db/migrations/001_core_schema.up.sql` (lines 85-100) shows the `stock_movement` schema:
    ```sql
    CREATE TABLE stock_movement (
        movement_id     INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_no        TEXT NOT NULL REFERENCES batch(batch_no) ON DELETE RESTRICT,
        from_location   INTEGER REFERENCES location(location_id),
        to_location     INTEGER REFERENCES location(location_id),
        quantity        INTEGER NOT NULL CHECK (quantity > 0),
        movement        TEXT NOT NULL CHECK(movement IN ('IN', 'OUT', 'TRANSFER', 'ADJUSTMENT')),
        ...
        CHECK (
            (movement = 'IN'         AND from_location IS NULL AND to_location IS NOT NULL) OR
            (movement = 'OUT'        AND from_location IS NOT NULL AND to_location IS NULL) OR
            ...
        )
    );
    ```
    Sales/deductions are recorded when `movement = 'OUT'`.
- **Existing Date Operations**:
  - `workers/expiry-alert.js` (lines 16-22) performs the following expiry checks:
    ```sql
    CAST(julianday(b.expiry_date) - julianday('now') AS INTEGER) AS days_until_expiry
    ...
    WHERE b.expiry_date <= date('now', '+4 months')
      AND b.expiry_date >  date('now')
      AND sl.quantity   >  0
    ```
- **Dashboard Contract Requirements** (`.agents/sub_orch_m2/SCOPE.md` lines 29-68):
  - Requires a single endpoint `GET /api/reports/pharmacy-dashboard` returning:
    - `totalMonthlySales` (number)
    - `insufficientProductsCount` (number)
    - `nearExpiryBatchesCount` (number)
    - `insufficientProducts` (list of low-stock products in pharmacies)
    - `nearExpiryBatches` (list of batches expiring in <= 4 months in pharmacies)
    - `topSellingProducts` (list of products sold in current month in pharmacies)

- **Query Executions Validation**:
  - Running our test suite `test_queries.js` using `node .agents/explorer_m2_3/test_queries.js` returned the following database outputs:
    ```javascript
    1. totalMonthlySales: { count: 25 }
    2. insufficientProductsCount: { count: 2 }
    3. nearExpiryBatchesCount: { count: 2 }
    ```

---

## 2. Logic Chain
1. **SQLite Dialect**: Based on `node:sqlite` in `db/connection.js`, standard SQLite SQL query dialect must be used.
2. **Identifying Pharmacy Sales**:
   - Filter location on `l.type = 'Pharmacy'`.
   - Filter movement on `sm.movement = 'OUT'` and join `sm.from_location = l.location_id`.
3. **Current Calendar Month**:
   - Compare transaction created date against current date using year-month formatting: `strftime('%Y-%m', sm.created_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime')`.
   - The `'localtime'` modifier ensures transactions near month boundaries are counted relative to the local server timezone, preventing discrepancies.
4. **Near Expiry Checks**:
   - Standardize boundary checks using:
     - `b.expiry_date <= date('now', 'localtime', '+4 months')`
     - `b.expiry_date > date('now', 'localtime')`
   - Calculate exact days remaining using:
     - `CAST(julianday(b.expiry_date) - julianday('now', 'localtime') AS INTEGER) AS days_until_expiry`
5. **Views Limitation**:
   - The `vw_low_stock` view lacks the `product.category` field which is required by the API contract.
   - The `vw_near_expiry` view lacks a filter for location type or the `location_type` field.
   - Therefore, direct SQL queries should be designed rather than relying on views, resulting in simpler, more standard joins.

---

## 3. Caveats
- **Timezone Modifications**: The modifier `'localtime'` assumes the Node server runs on the same local time as desired by the reporting business. If a fixed timezone offset is required, specific time zone conversions would be needed. Currently, the codebase does not specify any fixed offset.
- **Low Stock threshold**: Products with `reorder_point = 0` and `quantity = 0` are returned as low stock by SQLite since `0 <= 0` is true. This matches the project's view definitions.

---

## 4. Conclusion
We have successfully designed the API structure and all 6 SQL queries required for the `GET /api/reports/pharmacy-dashboard` endpoint.
The proposed file `proposed_reports.js` in our working directory contains the complete Express router implementation with the standardized queries.

---

## 5. Verification Method
- Execute the test query script to verify compatibility with the SQLite database:
  ```bash
  node .agents/explorer_m2_3/test_queries.js
  ```
- **Expected Output**: The terminal should display the correct data types, names, and counts corresponding to the contract without any SQL errors.
- **Invalidation Condition**: If any table schema modifications occur, such as changing the `stock_movement.created_at` default or adding new location types.
