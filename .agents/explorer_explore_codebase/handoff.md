# Handoff Report — Codebase Investigation

## 1. Observation
This report summarizes the findings from the read-only codebase investigation of the `vet-monitor` repository located at `d:\ziad 2026\vet-monitor`.

### A. Database Structure & Schema
- **Files**:
  - Connection: `db/connection.js`
  - Migrations: `db/migrations/001_core_schema.up.sql`, `db/migrations/001_core_schema.down.sql`
  - Migration Runner: `db/migrate.js`
- **Database Engine**: Uses native Node.js `node:sqlite` DatabaseSync module (`db/connection.js`, line 6: `const { DatabaseSync } = require('node:sqlite');`).
- **Mismatch Alert**: The `.env.example` file contains a reference to PostgreSQL (`DATABASE_URL=postgresql://user:password@localhost:5432/vet_monitor`), which is currently unused as `db/connection.js` is hardcoded to use SQLite (`const dbPath = path.join(dataDir, 'vet-monitor.db');`).
- **Tables, Columns & Relations** (from `db/migrations/001_core_schema.up.sql`):
  1. **`product`**:
     - `product_id` (INTEGER PRIMARY KEY AUTOINCREMENT)
     - `sku` (TEXT NOT NULL UNIQUE)
     - `name` (TEXT NOT NULL)
     - `category` (TEXT NOT NULL)
     - `created_at` (TEXT DEFAULT CURRENT_TIMESTAMP)
     - `updated_at` (TEXT DEFAULT CURRENT_TIMESTAMP)
     - *Indexes*: `idx_product_category` ON `product(category)`, `idx_product_sku` ON `product(sku)`.
  2. **`batch`**:
     - `batch_no` (TEXT PRIMARY KEY)
     - `product_id` (INTEGER NOT NULL REFERENCES `product(product_id)` ON DELETE RESTRICT)
     - `expiry_date` (TEXT NOT NULL)
     - `manufactured` (TEXT)
     - `created_at` (TEXT DEFAULT CURRENT_TIMESTAMP)
     - *Indexes*: `idx_batch_product` ON `batch(product_id)`, `idx_batch_expiry` ON `batch(expiry_date)`.
  3. **`location`**:
     - `location_id` (INTEGER PRIMARY KEY AUTOINCREMENT)
     - `name` (TEXT NOT NULL UNIQUE)
     - `type` (TEXT NOT NULL CHECK(type IN ('Pharmacy', 'Warehouse', 'Exporter')))
     - `address` (TEXT)
     - `is_active` (INTEGER DEFAULT 1)
     - `created_at` (TEXT DEFAULT CURRENT_TIMESTAMP)
     - *Indexes*: `idx_location_type` ON `location(type)`.
  4. **`stock_level`**:
     - `location_id` (INTEGER REFERENCES `location(location_id)` ON DELETE RESTRICT)
     - `batch_no` (TEXT REFERENCES `batch(batch_no)` ON DELETE RESTRICT)
     - `quantity` (INTEGER DEFAULT 0 CHECK(quantity >= 0))
     - `reorder_point` (INTEGER DEFAULT 0 CHECK(reorder_point >= 0))
     - `updated_at` (TEXT DEFAULT CURRENT_TIMESTAMP)
     - *Primary Key*: `(location_id, batch_no)`
     - *Indexes*: `idx_stock_level_batch` ON `stock_level(batch_no)`, `idx_stock_level_low` ON `stock_level(quantity, reorder_point) WHERE quantity <= reorder_point`.
  5. **`expiry_alert`**:
     - `alert_id` (INTEGER PRIMARY KEY AUTOINCREMENT)
     - `batch_no` (TEXT REFERENCES `batch(batch_no)` ON DELETE CASCADE)
     - `location_id` (INTEGER REFERENCES `location(location_id)` ON DELETE CASCADE)
     - `alert_date` (TEXT NOT NULL)
     - `expiry_date` (TEXT NOT NULL)
     - `acknowledged` (INTEGER DEFAULT 0)
     - `created_at` (TEXT DEFAULT CURRENT_TIMESTAMP)
     - *Unique Constraint*: `(batch_no, location_id, alert_date)`
     - *Indexes*: `idx_expiry_alert_pending` ON `expiry_alert(acknowledged) WHERE acknowledged = 0`.
  6. **`stock_movement`**:
     - `movement_id` (INTEGER PRIMARY KEY AUTOINCREMENT)
     - `batch_no` (TEXT REFERENCES `batch(batch_no)` ON DELETE RESTRICT)
     - `from_location` (INTEGER REFERENCES `location(location_id)`)
     - `to_location` (INTEGER REFERENCES `location(location_id)`)
     - `quantity` (INTEGER CHECK(quantity > 0))
     - `movement` (TEXT CHECK(movement IN ('IN', 'OUT', 'TRANSFER', 'ADJUSTMENT')))
     - `reference_note` (TEXT)
     - `created_at` (TEXT DEFAULT CURRENT_TIMESTAMP)
     - *Indexes*: `idx_movement_batch`, `idx_movement_from`, `idx_movement_to`, `idx_movement_created`.
- **Views**:
  - **`vw_low_stock`**: Selects stock levels where `quantity <= reorder_point`.
  - **`vw_exporter_inventory`**: Selects stock levels where location type is 'Exporter'.
  - **`vw_near_expiry`**: Selects batches expiring within 4 months with available quantity > 0.

---

### B. Existing Backend Server & API Endpoints
- **Server Entry**: `server.js` starts an Express app listening on `PORT` (default 3000). On startup, it checks if `_migrations` table exists, running `npm run migrate` if missing (lines 20-30).
- **API Files & Endpoints**:
  1. `/api/health` (`server.js` line 40): Health check endpoint.
  2. `/api/products` (`api/products.js`):
     - `GET /`: Lists products. Supports filtering by query parameter `?category=...`.
     - `GET /:id`: Retrieves single product details plus associated batches and their total stock.
     - `POST /`: Creates a product. Generates random SKU starting with `VET-` if none provided.
     - `DELETE /:id`: Deletes product. Fails if dependencies exist (e.g. FOREIGN KEY check).
  3. `/api/batches` (`api/batches.js`):
     - `GET /`: Lists batches. Supports query parameters `?product_id=...` and `?near_expiry=true`.
     - `POST /`: Registers a new batch.
     - `DELETE /:batch_no`: Deletes a batch.
  4. `/api/locations` (`api/locations.js`):
     - `GET /`: Lists active locations. Supports query `?type=...`.
     - `GET /:id`: Retrieves location info plus all inventory items present at that location.
     - `POST /`: Registers a new location.
  5. `/api/stock` (`api/stock.js` routes mapping to `lib/stock.js` functions):
     - `POST /receive`: Receives stock into a location (calls `receiveStock`).
     - `POST /deduct`: Deducts stock from a location (calls `deductStock`).
     - `POST /transfer`: Transfers stock between locations (calls `transferStock`).
     - `GET /low`: Retrieves low stock items (calls `getLowStock`).
     - `GET /exporters`: Retrieves exporter inventory (calls `getExporterInventory`).
  6. `/api/alerts` (`api/alerts.js` routes mapping to `workers/expiry-alert.js` functions):
     - `GET /`: Gets pending near-expiry alerts (calls `getPendingAlerts`).
     - `POST /scan`: Scans database for near-expiry items and populates alerts (calls `scanAndAlert`).
     - `PATCH /:id/acknowledge`: Acknowledges alert (calls `acknowledgeAlert`).
  7. `/api/movements` (`api/movements.js`):
     - `GET /`: Lists recent stock movements. Supports query params `?batch_no=...`, `?location_id=...`, `?limit=...`.
  8. `/api/inventory` (`api/inventory.js`):
     - `GET /`: Flat list of all stock items where quantity > 0, joined with product, batch, and location info.

---

### C. Existing Frontend Application Structure
- **Location**: All static files are in `public/` and served as static middleware in `server.js` (`app.use(express.static(path.join(__dirname, 'public')));`).
- **SPA Files**:
  - `public/index.html`: Contains UI layout with a sidebar (line 17), main content topbar (line 47), and tab contents for `inventory` (line 62), `alerts` (line 91), and `admin` (line 144). It also defines modals for `receiveModal` and `deductModal`.
  - `public/styles.css`: Contains typography (Tajawal & Inter), layout definitions (CSS Grid, flexbox), theme colors, utility classes, and components (buttons, badges, toasts, forms).
  - `public/app.js`: Holds state, handles tab switching (`switchTab()`), manages network requests (`api()`), populates select dropdowns, and triggers rendering of inventory table, defined products, defined batches, near-expiry alerts, low-stock lists, and recent movements.

---

### D. Test Infrastructure
- **Analysis**:
  - `package.json` contains no test runner, test framework dependencies (such as Mocha, Jest, or Cypress), or test script configuration.
  - No files matching `*test*` or `*spec*` exist anywhere in the repository.
- **Conclusion**: There are **no existing tests** configured or implemented in the codebase.

---

### E. Data Structures Summary
1. **Products**: Skus act as human-readable keys, products are categorized (e.g., "مضادات حيوية"), and have auto-assigned database IDs.
2. **Batches**: Batches are defined globally, containing an expiration date (`expiry_date`) and optional manufacturing date (`manufactured`).
3. **Locations**: Represents pharmacies, warehouses, or exporters.
4. **Inventory**: Represented via the `stock_level` table which links a `location_id` and `batch_no` to a current `quantity` and a `reorder_point` threshold.
5. **Sales**: There is no distinct `sale` or `invoice` table. Sales are modeled as **outbound stock movements** (`movement = 'OUT'`) from a location via FIFO deduction (the earliest-expiring batch is deducted first). The quantity represents the units sold. The schema has no pricing, cost, or revenue columns.

---

## 2. Logic Chain
1. **No Test Framework Found**: Reading `package.json` shows only `dotenv`, `express`, and `cors` under `dependencies`. The `scripts` object contains database commands (`migrate`, `seed`), start commands, and worker commands, but no `test` script. Therefore, no tests exist.
2. **PostgreSQL vs SQLite Mismatch**: `package.json` does not list PostgreSQL drivers (like `pg`), and `db/connection.js` explicitly imports `node:sqlite`'s `DatabaseSync` to write to `data/vet-monitor.db`. Thus, SQLite is the active database despite the PostgreSQL URL in `.env.example`.
3. **Sales representation**: Looking at `lib/stock.js`, the `deductStock` function handles reduction of stock levels and creates a movement row with `movement = 'OUT'` and `from_location` set to the deduction source. Since no tables capture price/revenue, sales are represented by the `stock_movement` records where `movement = 'OUT'`.
4. **Integrating Tabs Safely**: In `public/index.html`, the inventory table already includes a column for `category`. The `/api/inventory` endpoint includes `category` in the returned payload. Therefore, category tabs/sidebar filtering can be implemented entirely in the frontend without modifying the backend.
5. **Integrating Supervisor Dashboard & Monthly Sales Safely**:
   - Insufficient stock: Already supported by the database view `vw_low_stock` and route `/api/stock/low`.
   - Expiration dates: Already supported by `vw_near_expiry` and route `/api/alerts`.
   - Total monthly sales: Requires an aggregation. We can implement a new route `GET /api/reports/monthly-sales` in a new file `api/reports.js` and mount it in `server.js` without touching existing business logic. This endpoint will query `stock_movement` for `SUM(quantity)` where `movement = 'OUT'` and the month matches the current month.

---

## 3. Caveats
- **Node.js Version Requirement**: The codebase relies on the native `node:sqlite` module, which requires Node.js v22.5.0 or higher.
- **Sales Definition**: We assume "total monthly sales" refers to the sum of quantities from `stock_movement` records with `movement = 'OUT'` during the current calendar month. If financial value is required, schema migrations adding price columns would be necessary. However, since the prompt specifies not modifying or breaking existing backend core logic, we stick to quantity-based metrics.

---

## 4. Conclusion
The repository contains a functional, lightweight, Node.js + Express SPA using SQLite. There is no testing framework configured. New features can be integrated safely by implementing frontend category filtering and adding a new non-breaking API file (`api/reports.js`) to provide monthly sales aggregates.

---

## 5. Verification Method
- **Run server check**: Run `node server.js` to ensure the server starts correctly and auto-migrates if database is not present.
- **Run expiry worker check**: Run `npm run check:expiry` to execute the expiry alert worker and confirm database scanning works.
- **API Inspection**: Fetch `http://localhost:3000/api/health` to confirm the backend is up.
- **Check files**: Verify that the database schema is intact by inspecting `data/vet-monitor.db` using an SQLite client.
