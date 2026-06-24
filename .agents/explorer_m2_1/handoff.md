# Handoff Report — Pharmacy Dashboard API Design

## 1. Observation

- **Database Connection & Dialect**:
  - `db/connection.js:6-16` shows the project uses Node's native SQLite module (`node:sqlite`'s `DatabaseSync`):
    ```javascript
    const { DatabaseSync } = require('node:sqlite');
    // ...
    const dbPath = path.join(dataDir, 'vet-monitor.db');
    const db = new DatabaseSync(dbPath);
    ```
  - Query compilation is synchronous using `db.prepare(sql).all(...params)`, `db.prepare(sql).get(...params)`, and `db.prepare(sql).run(...params)`.

- **Schema Constraints & Location Filtering**:
  - `db/migrations/001_core_schema.up.sql:38-45` defines the location table:
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
    This shows locations of type 'Pharmacy' are identified by `type = 'Pharmacy'`.

- **Stock Movements & Sales**:
  - `db/migrations/001_core_schema.up.sql:85-100` defines the stock movement table:
    ```sql
    CREATE TABLE stock_movement (
        movement_id     INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_no        TEXT NOT NULL REFERENCES batch(batch_no) ON DELETE RESTRICT,
        from_location   INTEGER REFERENCES location(location_id),
        to_location     INTEGER REFERENCES location(location_id),
        quantity        INTEGER NOT NULL CHECK (quantity > 0),
        movement        TEXT NOT NULL CHECK(movement IN ('IN', 'OUT', 'TRANSFER', 'ADJUSTMENT')),
        reference_note  TEXT,
        created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (
            (movement = 'IN'         AND from_location IS NULL AND to_location IS NOT NULL) OR
            (movement = 'OUT'        AND from_location IS NOT NULL AND to_location IS NULL) OR
            -- ...
        )
    );
    ```
  - `lib/stock.js:52` shows sales/deductions insert a movement with type `'OUT'`:
    ```javascript
    const insertMovement = db.prepare(`
      INSERT INTO stock_movement
        (batch_no, from_location, to_location, quantity, movement, reference_note)
      VALUES (?, ?, NULL, ?, 'OUT', ?)
    `);
    ```
    Thus, sales from a pharmacy are recorded as `movement = 'OUT'` where `from_location` has a location of type `'Pharmacy'`.

- **Date and Expiry Calculations**:
  - `db/migrations/001_core_schema.up.sql:159-160` (view `vw_near_expiry`) and `workers/expiry-alert.js:21-22` identify near-expiry batches as:
    ```sql
    WHERE b.expiry_date <= date('now', '+4 months')
      AND b.expiry_date >  date('now')
      AND sl.quantity > 0
    ```
  - Days until expiry is calculated as:
    ```sql
    CAST(julianday(b.expiry_date) - julianday('now') AS INTEGER) AS days_until_expiry
    ```
  - Indexing: `stock_movement` has a built-in index on `created_at` (`db/migrations/001_core_schema.up.sql:105`):
    ```sql
    CREATE INDEX idx_movement_created ON stock_movement (created_at);
    ```

- **Contract Category Mismatch**:
  - The interface contract in `.agents/sub_orch_m2/SCOPE.md:35-46` requires the `category` field for `insufficientProducts`:
    ```json
    "insufficientProducts": [
      {
        "location_id": "loc-123",
        "location_name": "Main Pharmacy",
        "batch_no": "B-9988",
        "sku": "SKU-PH-1",
        "product_name": "Amoxicillin",
        "category": "Antibiotic",
        "quantity": 5,
        "reorder_point": 10,
        "expiry_date": "2026-10-31"
      }
    ]
    ```
  - However, the built-in view `vw_low_stock` does not select the `category` column from the `product` table.

- **Query Validation Execution**:
  - Run command `node .agents/explorer_m2_1/test_queries.js` succeeded, confirming the SQL queries correctly retrieve existing records from the SQLite database.

## 2. Logic Chain

1. **Location Filtering**:
   - Location type is checked using `l.type = 'Pharmacy'`.
   - Any query calculating pharmacy stats or lists must join the `location` table and enforce this check (Observation 2).

2. **Deductions (Sales)**:
   - Sales are represented by `stock_movement` rows with `movement = 'OUT'`.
   - The source location must be checked to ensure it is a pharmacy: `sm.from_location = l.location_id` and `l.type = 'Pharmacy'` (Observation 3).

3. **Current Calendar Month Filter & Index Performance**:
   - Storing dates using `CURRENT_TIMESTAMP` defaults to the standard format `'YYYY-MM-DD HH:MM:SS'`.
   - Comparing strings of different lengths (e.g. `'2026-06-23 15:40:02'` vs `'2026-06-01'`) can introduce subtle boundary bugs in lexicographical string comparisons.
   - Using `datetime('now', 'start of month')` generates a full 19-character timestamp `'YYYY-MM-DD 00:00:00'`, matching the format of `created_at` and avoiding edge cases.
   - Performing column-based functions like `strftime('%Y-%m', sm.created_at)` disables index usage on `sm.created_at`.
   - Designing boundary conditions as constant-folding expressions (`sm.created_at >= datetime('now', 'start of month') AND sm.created_at < datetime('now', 'start of month', '+1 month')`) allows SQLite to leverage the index `idx_movement_created` (Observation 4).

4. **Category Schema Compliance**:
   - Since `vw_low_stock` does not include `product.category`, reusing it directly for `insufficientProducts` is insufficient (Observation 5).
   - Thus, a custom query joining `product` and selecting `p.category` must be executed to fulfill the interface contract.

5. **JS Count Reuse**:
   - Since counts and lists are returned together in the same payload, computing counts via array length in JavaScript (e.g., `insufficientProducts.length`) eliminates redundant COUNT queries on the database.

## 3. Caveats

- **Timezone Assumptions**: The SQLite database stores dates in UTC. The query design defaults to UTC month boundaries. If local business timezone boundaries are required:
  - We must use:
    `sm.created_at >= datetime('now', 'localtime', 'start of month', 'utc')`
    `AND sm.created_at < datetime('now', 'localtime', 'start of month', '+1 month', 'utc')`
  - This remains index-friendly but converts current host local-time boundaries to UTC constants before executing.

- **`topSellingProducts` Count Limit**: A default limit of `LIMIT 5` is chosen for top-selling products. This is configurable depending on front-end needs.

## 4. Conclusion

The pharmacy dashboard report GET `/api/reports/pharmacy-dashboard` can be designed cleanly and performantly:
- **Router location**: `api/reports.js`
- **Mounting point**: `server.js` using `app.use('/api/reports', require('./api/reports'))`
- **Date calculations**: SQLite's native sargable expressions (`datetime('now', 'start of month')`, `date('now', '+4 months')`, and `julianday()`).
- **Data compliance**: Avoid using `vw_low_stock` directly due to missing `category` field; use a direct raw SQL query instead.

### Query Design details:
- **totalMonthlySales**:
  ```sql
  SELECT COALESCE(SUM(sm.quantity), 0) AS total_sales
  FROM stock_movement sm
  JOIN location l ON sm.from_location = l.location_id
  WHERE l.type = 'Pharmacy'
    AND sm.movement = 'OUT'
    AND sm.created_at >= datetime('now', 'start of month')
    AND sm.created_at < datetime('now', 'start of month', '+1 month')
  ```
- **insufficientProducts**:
  ```sql
  SELECT sl.location_id, l.name AS location_name, sl.batch_no, p.sku, p.name AS product_name, p.category, sl.quantity, sl.reorder_point, b.expiry_date
  FROM stock_level sl
  JOIN batch b ON b.batch_no = sl.batch_no
  JOIN product p ON p.product_id = b.product_id
  JOIN location l ON l.location_id = sl.location_id
  WHERE l.type = 'Pharmacy' AND sl.quantity <= sl.reorder_point
  ORDER BY l.name ASC, p.name ASC
  ```
- **nearExpiryBatches**:
  ```sql
  SELECT b.batch_no, p.sku, p.name AS product_name, b.expiry_date, CAST(julianday(b.expiry_date) - julianday('now') AS INTEGER) AS days_until_expiry, sl.location_id, l.name AS location_name, sl.quantity
  FROM batch b
  JOIN product p ON p.product_id = b.product_id
  JOIN stock_level sl ON sl.batch_no = b.batch_no
  JOIN location l ON l.location_id = sl.location_id
  WHERE l.type = 'Pharmacy' AND sl.quantity > 0 AND b.expiry_date <= date('now', '+4 months') AND b.expiry_date > date('now')
  ORDER BY b.expiry_date ASC, l.name ASC
  ```
- **topSellingProducts**:
  ```sql
  SELECT p.name AS product_name, p.sku, COALESCE(SUM(sm.quantity), 0) AS quantity_sold
  FROM stock_movement sm
  JOIN batch b ON sm.batch_no = b.batch_no
  JOIN product p ON b.product_id = p.product_id
  JOIN location l ON sm.from_location = l.location_id
  WHERE l.type = 'Pharmacy' AND sm.movement = 'OUT' AND sm.created_at >= datetime('now', 'start of month') AND sm.created_at < datetime('now', 'start of month', '+1 month')
  GROUP BY p.product_id, p.name, p.sku
  ORDER BY quantity_sold DESC LIMIT 5
  ```

## 5. Verification Method

To verify the SQL correctness and response structure:
1. Run the prepared test script:
   ```bash
   node .agents/explorer_m2_1/test_queries.js
   ```
   This will query the database and assert that all SQL queries compile and return the correct formats.
2. Invalidation conditions:
   - Changes to the underlying table columns (e.g. renaming `reorder_point`, renaming `type` column options).
   - Database schema migrations removing indices or altering default timestamp behavior.
