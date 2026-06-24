# E2E Test Suite Design and Planning Report

## 1. Observation
We have inspected the Vet Monitor codebase and `.agents/orchestrator/TEST_INFRA.md`. Here are the direct observations:

* **Codebase Structure**:
  * **Backend**: An Express application (`server.js`) that uses native `node:sqlite` (introduced in Node.js 22.5+) via `db/connection.js`. It runs server APIs under the `/api` prefix (such as `/api/products`, `/api/batches`, `/api/locations`, `/api/stock`, `/api/alerts`, `/api/movements`, and `/api/inventory`).
  * **Database Connection**: In `db/connection.js`, the SQLite database path is hardcoded:
    ```javascript
    const dbPath = path.join(dataDir, 'vet-monitor.db');
    const db = new DatabaseSync(dbPath);
    ```
    This connection has `PRAGMA foreign_keys = ON` enabled.
  * **Migrations & Seeds**: Migrations are run via `node db/migrate.js`, which applies schemas defined in `db/migrations/001_core_schema.up.sql`. `db/seed.js` prints: `"Seed data is now managed via the Admin Dashboard UI."`
  * **Frontend**: Located in `public/` and consists of `index.html`, `app.js`, and `styles.css`.
  * **Background Worker**: `workers/expiry-alert.js` scans for near-expiry batches and inserts them into `expiry_alert` database table. It is triggered via `POST /api/alerts/scan`.
* **Package Dependencies**:
  * In `package.json`, there are only three dependencies: `dotenv` (^16.4.0), `express` (^4.21.0), and `cors` (^2.8.5).
  * There are no testing utilities or database libraries (like `better-sqlite3`, `jest`, `mocha`, `playwright`, or `jsdom`) installed.
* **Requirements (`TEST_INFRA.md`)**:
  * Requires a 38-test-case E2E test suite written using the Node.js built-in `node:test` runner under `tests/e2e.test.js`.
  * Must be invoked using `node --test tests/e2e.test.js`.
  * Exit code `0` indicates success, and non-zero indicates failure.
  * Tests are grouped into 4 Tiers:
    * **Tier 1 (Feature Coverage)**: 15 tests.
    * **Tier 2 (Boundary & Corner Cases)**: 15 tests.
    * **Tier 3 (Cross-Feature Combinations)**: 3 tests.
    * **Tier 4 (Real-World Application Scenarios)**: 5 tests.

---

## 2. Logic Chain
Based on our observations, we formulate the following design decisions:

1. **Running Tests with Built-in Modules**:
   * Since there are no external testing packages in `package.json` and we are constrained not to add external packages, we must rely solely on Node.js built-ins.
   * Node.js has a native `node:test` runner and `node:assert` assertion library (stable in modern versions).
   * Network requests can be performed using native `fetch` (global in Node.js 18+).
   * Frontend scripts can be read using `node:fs` and executed in a mocked sandbox via `node:vm` to verify client-side behavior without a real browser.
2. **Programmatic Server Lifecycle & Dynamic Port Binding**:
   * Spawning the server using `child_process.spawn('node', ['server.js'])` is cleaner than requiring it because:
     * It runs in a separate process, meaning it won't pollute the test runner's module cache.
     * We can easily kill it using `.kill('SIGINT')` which triggers the graceful shutdown handler in `server.js`.
     * We can find a free TCP port dynamically by opening a temporary server on port `0`, retrieving its bound port, closing it, and then passing that port via `process.env.PORT` to the child process.
   * Polling `http://localhost:${PORT}/api/health` before starting the tests ensures the server is ready to handle requests.
3. **Database Isolation**:
   * To prevent test runs from modifying or polluting the development/production database (`data/vet-monitor.db`), we need to isolate the database.
   * Since `db/connection.js` hardcodes the database path, we propose adding a small change to it:
     ```javascript
     const dbPath = process.env.TEST_DB_PATH 
       ? path.resolve(process.env.TEST_DB_PATH)
       : path.join(dataDir, 'vet-monitor.db');
     ```
   * The test runner can set `process.env.TEST_DB_PATH = 'data/vet-monitor-test.db'` in its own environment and spawn the server with the same variable. This ensures both processes talk to the same isolated database file.
   * To reset the database before each test run without process restart overhead or database locking errors (which happen if you overwrite a SQLite file while a process has an open handle), we can run a series of SQL `DELETE FROM` statements in a transaction in the `beforeEach` hook. Since SQLite foreign key constraints are on, we must delete from child tables first: `stock_movement` $\rightarrow$ `expiry_alert` $\rightarrow$ `stock_level` $\rightarrow$ `batch` $\rightarrow$ `location` $\rightarrow$ `product`.
4. **Testing Frontend Assets**:
   * **HTML Validation**: The test runner fetches the index page via `fetch('http://localhost:${PORT}/')` and uses string includes/regular expressions to assert that target tabs, dashboard container IDs, and onclick hooks are present in the DOM.
   * **JS State and Event Logic**: The test runner reads `public/app.js` using `fs.readFileSync` and executes it inside a `node:vm` sandbox. By providing mock objects for `document`, `window`, and `fetch`, we can call functions like `switchTab('warehouse')`, `loadLowStock()`, or `api()` and inspect state changes and DOM updates (like elements' `classList` or `innerHTML`) dynamically.
5. **Mapping 38 Test Cases**:
   * By combining Tier 1 (15), Tier 2 (15), Tier 3 (3), and Tier 4 (5) from `TEST_INFRA.md`, we specify a precise design for all 38 tests, ensuring every requirement is fully addressed.

---

## 3. Caveats
* **Frontend CSS/Styling**: We do not test layout rendering, CSS visual appearance, or font loading as these require browser-based layout engines.
* **Unimplemented APIs**: The Pharmacy Supervisor Dashboard reporting endpoint `/api/reports/pharmacy-dashboard` and the UI tabs for "Pharmacies", "Warehouse", and "Exporters" are not yet implemented. The test design assumes the interface contracts defined in `PROJECT.md`.
* **Timing & Workers**: Tests simulating time (e.g. days until expiry calculations) will rely on SQLite's `date('now')` and system time. We will seed dates using dynamic offsets (e.g. `date('now', '+2 months')`) relative to current time to ensure they pass regardless of when the test suite is run.

---

## 4. Conclusion
Below is the complete design and implementation plan for the E2E test suite in `tests/e2e.test.js`.

### Proposed Changes to `db/connection.js`
We propose updating the database path resolution in `db/connection.js` to look like this:
```javascript
// db/connection.js lines 15-16
const dbPath = process.env.TEST_DB_PATH
  ? path.resolve(process.env.TEST_DB_PATH)
  : path.join(dataDir, 'vet-monitor.db');
const db = new DatabaseSync(dbPath);
```

### Detailed Design for `tests/e2e.test.js`

Here is the complete blueprint code skeleton:

```javascript
/**
 * Vet Monitor — E2E Test Suite
 * Runner: Node.js built-in node:test
 * Executed via: node --test tests/e2e.test.js
 */

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const vm = require('node:vm');

// Set test environment configuration
const TEST_DB_PATH = path.resolve(__dirname, '../data/vet-monitor-test.db');
process.env.TEST_DB_PATH = TEST_DB_PATH;
process.env.NODE_ENV = 'test';

// Import DB connection (will resolve to TEST_DB_PATH)
const db = require('../db/connection');

let serverProcess;
let serverPort;
let serverUrl;

// Helper: Find a free TCP port dynamically
function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

// Helper: Clear all tables in a transaction (foreign key safe order)
function clearDatabase() {
  db.transaction(() => {
    db.exec('DELETE FROM stock_movement');
    db.exec('DELETE FROM expiry_alert');
    db.exec('DELETE FROM stock_level');
    db.exec('DELETE FROM batch');
    db.exec('DELETE FROM location');
    db.exec('DELETE FROM product');
  })();
}

// Helper: Seed product in database
function seedProduct(name, category, sku) {
  const result = db.prepare(`
    INSERT INTO product (name, category, sku) VALUES (?, ?, ?)
  `).run(name, category, sku);
  return result.lastInsertRowid;
}

// Helper: Seed batch in database
function seedBatch(batchNo, productId, expiryDate) {
  db.prepare(`
    INSERT INTO batch (batch_no, product_id, expiry_date) VALUES (?, ?, ?)
  `).run(batchNo, productId, expiryDate);
}

// Helper: Seed location in database
function seedLocation(name, type) {
  const result = db.prepare(`
    INSERT INTO location (name, type) VALUES (?, ?)
  `).run(name, type);
  return result.lastInsertRowid;
}

// Helper: Seed stock level in database
function seedStock(locationId, batchNo, quantity, reorderPoint = 0) {
  db.prepare(`
    INSERT INTO stock_level (location_id, batch_no, quantity, reorder_point)
    VALUES (?, ?, ?, ?)
  `).run(locationId, batchNo, quantity, reorderPoint);
}

// Helper: Mock Browser Sandbox for public/app.js testing
function runFrontendScript(mockGlobals = {}) {
  const appJsPath = path.resolve(__dirname, '../public/app.js');
  const code = fs.readFileSync(appJsPath, 'utf8');

  const domElements = {};
  const mockElement = (id) => ({
    id,
    classList: {
      add: (c) => domElements[id].classes.add(c),
      remove: (c) => domElements[id].classes.delete(c),
      contains: (c) => domElements[id].classes.has(c),
    },
    classes: new Set(),
    textContent: '',
    innerHTML: '',
    reset: () => {},
    querySelector: (sel) => mockElement(id + '_' + sel),
  });

  const getElementById = (id) => {
    if (!domElements[id]) domElements[id] = mockElement(id);
    return domElements[id];
  };

  const context = {
    document: {
      getElementById,
      querySelectorAll: (sel) => [mockElement('dummy')],
      createElement: () => ({ className: '', innerHTML: '', appendChild: () => {}, remove: () => {} }),
    },
    window: { addEventListener: () => {} },
    console: { log: () => {}, error: () => {} },
    setInterval: () => {},
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    ...mockGlobals,
  };

  vm.createContext(context);
  vm.runInContext(code, context);
  return { context, domElements };
}

// Global hooks
before(async () => {
  // Ensure data dir exists
  const dataDir = path.dirname(TEST_DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Clear previous test DB
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  // Run migrations
  const { execSync } = require('node:child_process');
  execSync('node db/migrate.js', { env: { ...process.env } });

  // Get dynamic port and spawn server
  serverPort = await getFreePort();
  serverUrl = `http://localhost:${serverPort}`;

  serverProcess = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(serverPort) }
  });

  // Wait for server health response
  let ready = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`${serverUrl}/api/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 100));
  }

  if (!ready) {
    throw new Error('Express test server failed to start');
  }
});

after(async () => {
  if (serverProcess) {
    serverProcess.kill('SIGINT');
  }
  if (fs.existsSync(TEST_DB_PATH)) {
    try {
      fs.unlinkSync(TEST_DB_PATH);
    } catch (e) {}
  }
});

beforeEach(async () => {
  clearDatabase();
});
```

---

### Specification for the 38 Test Cases

#### Tier 1: Feature Coverage (15 tests)

| # | Test Title | Setup | Action | Expected Assertion |
|---|------------|-------|--------|---------------------|
| 1 | F1-T1: Check tab elements for Pharmacies context in HTML | None | Fetch index.html from server | HTML contains tab button switching to `'pharmacies'` context. |
| 2 | F1-T2: Check tab elements for Warehouse context in HTML | None | Fetch index.html from server | HTML contains tab button switching to `'warehouse'` context. |
| 3 | F1-T3: Check tab elements for Exporters context in HTML | None | Fetch index.html from server | HTML contains tab button switching to `'exporters'` context. |
| 4 | F1-T4: Check category select handlers in app.js | None | Read `public/app.js` code | Contains function `switchTab` or equivalent tab-switching handler. |
| 5 | F1-T5: Verify tab switching CSS classes changes context state | Run VM sandbox for `app.js` | Call `switchTab('warehouse')` | Expect the warehouse element to have `'active'` class added, and others removed. |
| 6 | F2-T6: Verify API returns correct keys for low stock items | Seed low stock Pharmacy item | `GET /api/reports/pharmacy-dashboard` | Response contains keys `insufficientProducts` and `insufficientProductsCount`. |
| 7 | F2-T7: Verify API returns correct keys for near-expiry items | Seed near-expiry Pharmacy batch | `GET /api/reports/pharmacy-dashboard` | Response contains keys `nearExpiryBatches` and `nearExpiryBatchesCount`. |
| 8 | F2-T8: Verify API returns correct keys for monthly sales | None | `GET /api/reports/pharmacy-dashboard` | Response contains key `totalMonthlySales`. |
| 9 | F2-T9: Verify frontend renders low stock list | Mock VM fetch for dashboard API with 1 low stock item | Call `loadLowStock()` inside VM | Element `lowStockList` is populated with correct HTML list structure. |
| 10 | F2-T10: Verify frontend renders near-expiry list | Mock VM fetch for dashboard API with 1 near-expiry item | Call `loadAlerts()` inside VM | Element `nearExpiryList` is populated with correct HTML alert structure. |
| 11 | F3-T11: Verify GET /api/health returns status ok | None | `GET /api/health` | Response status is 200 and body is `{ status: 'ok', ... }`. |
| 12 | F3-T12: Verify existing API endpoints like GET /api/products work unchanged | Seed 2 products | `GET /api/products` | Response contains exactly the 2 products seeded. |
| 13 | F3-T13: Verify database migrations run and seed works | Clear DB, run migrations | Query sqlite master tables | Tables `product`, `batch`, `location`, `stock_level` are created. |
| 14 | F3-T14: Verify dashboard API rejects invalid request types | None | `POST /api/reports/pharmacy-dashboard` | Expect response status 404 (or 405 Method Not Allowed). |
| 15 | F3-T15: Verify standard inventory route /api/inventory is intact | Seed 1 product, batch, location, stock | `GET /api/inventory` | Response is an array containing the seeded item details. |

#### Tier 2: Boundary & Corner Cases (15 tests)

| # | Test Title | Setup | Action | Expected Assertion |
|---|------------|-------|--------|---------------------|
| 16 | T2-T16: Low stock limit: 0 stock (boundary) | Seed Pharmacy item, quantity = 0, reorder = 5 | `GET /api/reports/pharmacy-dashboard` | Product is listed in `insufficientProducts` (0 <= 5). |
| 17 | T2-T17: Low stock limit: exactly at reorder point (boundary) | Seed Pharmacy item, quantity = 5, reorder = 5 | `GET /api/reports/pharmacy-dashboard` | Product is listed in `insufficientProducts` (5 <= 5). |
| 18 | T2-T18: Low stock limit: just above reorder point (boundary) | Seed Pharmacy item, quantity = 6, reorder = 5 | `GET /api/reports/pharmacy-dashboard` | Product is NOT listed in `insufficientProducts` (6 > 5). |
| 19 | T2-T19: Expiry date range: expiring today (boundary) | Seed Pharmacy batch with expiry = today | `GET /api/reports/pharmacy-dashboard` | Batch is NOT listed in `nearExpiryBatches` (since expired/expires today, not approaching expiry). |
| 20 | T2-T20: Expiry date range: expiring in exactly 4 months (boundary) | Seed Pharmacy batch, expiry = today + 4 months | `GET /api/reports/pharmacy-dashboard` | Batch is listed in `nearExpiryBatches` (exactly 4 months boundary). |
| 21 | T2-T21: Expiry date range: expiring in 4 months + 1 day (boundary) | Seed Pharmacy batch, expiry = today + 4 months + 1 day | `GET /api/reports/pharmacy-dashboard` | Batch is NOT listed in `nearExpiryBatches` (> 4 months). |
| 22 | T2-T22: Expiry date range: expired items | Seed Pharmacy batch, expiry = yesterday | `GET /api/reports/pharmacy-dashboard` | Batch is NOT listed in `nearExpiryBatches` (already expired). |
| 23 | T2-T23: Sales range: 0 monthly sales (new location) | Seed Pharmacy location | `GET /api/reports/pharmacy-dashboard` | `totalMonthlySales` is 0. |
| 24 | T2-T24: Sales range: negative sales quantity | Seed Pharmacy item, stock = 10 | `POST /api/stock/deduct` with quantity = -5 | Expect HTTP 400 or 409 (rejected by validation/db check). |
| 25 | T2-T25: Sales range: large sales quantity | Seed Pharmacy item, stock = 10000 | `POST /api/stock/deduct` with quantity = 9000 | Expect HTTP 200, dashboard monthly sales is 9000. |
| 26 | T2-T26: UI elements: empty state message when no low stock | Mock empty low stock in VM | Render dashboard in VM | `lowStockList` text contains empty state message. |
| 27 | T2-T27: UI elements: empty state for near expiry | Mock empty near expiry in VM | Render dashboard in VM | `nearExpiryList` text contains empty state message. |
| 28 | T2-T28: UI elements: no console errors | Mock console spy in VM | Run `loadAll()` inside VM | No calls to `console.error` recorded. |
| 29 | T2-T29: Low stock with reorder point = 0 | Seed Prod A (stock 0, reorder 0), Prod B (stock 1, reorder 0) | `GET /api/reports/pharmacy-dashboard` | Prod A is listed, Prod B is NOT listed in `insufficientProducts`. |
| 30 | T2-T30: Multiple batches for same product | Seed Batch A (low stock), Batch B (near expiry) | `GET /api/reports/pharmacy-dashboard` | Batch A in `insufficientProducts`, Batch B in `nearExpiryBatches`. |

#### Tier 3: Cross-Feature Combinations (3 tests)

| # | Test Title | Setup | Action | Expected Assertion |
|---|------------|-------|--------|---------------------|
| 31 | T3-C1: Sale updates sales metric and low stock checklist | Seed Pharmacy item, quantity = 15, reorder = 10 | `POST /api/stock/deduct` with quantity = 6 | Sales increases to 6, product drops to 9 and shows in low stock list. |
| 32 | T3-C2: Non-pharmacy transactions isolated | Seed Warehouse and Exporter items, make sales/deductions | `GET /api/reports/pharmacy-dashboard` | Dashboard metrics remain 0 (no leakage from non-pharmacy locations). |
| 33 | T3-C3: Expiry alert life cycle: scan, show, acknowledge | Seed near-expiry item at Pharmacy | 1. `POST /api/alerts/scan`<br>2. `GET /api/alerts`<br>3. `PATCH /api/alerts/:id/acknowledge` | Alert is generated, displayed, and then filtered out after acknowledgment. |

#### Tier 4: Real-World Application Scenarios (5 tests)

| # | Test Title | Setup | Action | Expected Assertion |
|---|------------|-------|--------|---------------------|
| 34 | T4-S1: E2E Supervisor workflow | Seed Pharmacy item (qty 12, reorder 10) | Simulate navigate $\rightarrow$ view dashboard $\rightarrow$ deduct 5 units $\rightarrow$ view dashboard | Monthly sales shows 5, item now appears in low stock list (qty 7). |
| 35 | T4-S2: Warehouse to Pharmacy stock transfer | Seed Warehouse (qty 50) and Pharmacy (qty 0, reorder 10) | `POST /api/stock/transfer` for 20 units | Warehouse has 30, Pharmacy has 20, low stock alert for Pharmacy is resolved. |
| 36 | T4-S3: Exporters inventory quarantine | Seed Exporter location, receive near-expiry items | `GET /api/reports/pharmacy-dashboard` and `GET /api/stock/exporters` | Dashboard metrics are 0. Item only shows up in Exporters inventory endpoint. |
| 37 | T4-S4: Expiry alerts scan worker loop | Seed Pharmacy near-expiry item | Run `scanAndAlert()` worker, then acknowledge alert via API | Alert created in database, and active alerts list goes from 1 to 0 after ack. |
| 38 | T4-S5: High workload sales aggregation | Seed multiple Pharmacy items | Perform 10 consecutive random deductions at different pharmacies | `totalMonthlySales` equals the exact sum of all 10 deduction quantities. |

---

## 5. Verification Method
To verify that this design and plan is sound and ready for implementation:

1. **Database Path Configuration Check**:
   * Inspect `db/connection.js` and verify it contains the `process.env.TEST_DB_PATH` conditional override.
2. **Built-in Test Runner Invocation**:
   * Create a test file `tests/e2e.test.js` with the setup logic above, and run:
     ```bash
     node --test tests/e2e.test.js
     ```
   * Confirm the test suite executes, spawns the server, runs migrations, executes the health check verification, and exits clean.
3. **Database Reset Verification**:
   * Run a test case that inserts data, calls `clearDatabase()`, and asserts that the tables are completely empty, verifying the foreign key cascade deletions.
4. **VM Sandboxing Verification**:
   * Verify that requiring and executing `public/app.js` within `node:vm` executes without throwing references errors.
