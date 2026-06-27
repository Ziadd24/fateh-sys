# Project: Vet Monitor Multi-tab System and Pharmacy Supervisor Dashboard

## Architecture
The Vet Monitor system is a Node.js + Express SPA with a native SQLite backend.
- **Frontend**: A single page application in `public/` (index.html, styles.css, app.js).
- **Backend**: An Express server in `server.js` mounting routers from `api/`.
- **Database**: Native Node.js `node:sqlite` DatabaseSync module querying `data/vet-monitor.db`.
- **Data Flow**: Frontend switches between category contexts. For the Pharmacy context, it queries the new consolidated dashboard reporting endpoint `/api/reports/pharmacy-dashboard` to populate the supervisor panels.

## Code Layout
- `server.js` - Server entry point
- `api/` - Express routing modules
  - `api/reports.js` [NEW] - Consolidated dashboard data for Pharmacy context
- `public/` - SPA frontend files
  - `public/index.html` - Navigation tabs and dashboard UI panels
  - `public/app.js` - Tabs state, API integrations, and UI rendering
  - `public/styles.css` - Dashboard layout styling
- `tests/` [NEW] - Test scripts
  - `tests/e2e.test.js` [NEW] - Custom Node.js E2E test suite using native `node:test`

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | E2E Test Suite Setup | Setup E2E testing using `node:test`, verify API health, and plan tests for new features. | None | PLANNED |
| 2 | Backend API Expansion | Implement `/api/reports/pharmacy-dashboard` in `api/reports.js`. Mount in `server.js`. Verify with test cases. | M1 | PLANNED |
| 3 | Frontend Category Switcher | Implement tabs/sidebar switcher in `public/index.html` and `public/app.js` to change contexts between "Pharmacies", "Warehouse", and "Exporters". | M1 | PLANNED |
| 4 | Pharmacy Supervisor Dashboard UI | Create UI cards/panels in "Pharmacies" tab showing low stock, near expiry, and total monthly sales. Bind to backend dashboard endpoint. | M2, M3 | PLANNED |
| 5 | E2E Validation & Audit | Run all E2E tests, verify metrics, execute adversarial tests, and perform a clean Forensic Audit. | M4 | PLANNED |

## Interface Contracts
### GET `/api/reports/pharmacy-dashboard`
- **Description**: Returns consolidated metrics and lists for the Pharmacy Supervisor Dashboard.
- **Response Format**:
  ```json
  {
    "totalMonthlySales": 0,
    "insufficientProductsCount": 0,
    "nearExpiryBatchesCount": 0,
    "insufficientProducts": [
      {
        "location_id": 1,
        "location_name": "صيدلية أ",
        "batch_no": "B1",
        "sku": "VET-123",
        "product_name": "دواء أ",
        "category": "مضادات حيوية",
        "quantity": 5,
        "reorder_point": 10,
        "expiry_date": "2026-10-01"
      }
    ],
    "nearExpiryBatches": [
      {
        "batch_no": "B1",
        "sku": "VET-123",
        "product_name": "دواء أ",
        "expiry_date": "2026-10-01",
        "days_until_expiry": 100,
        "location_id": 1,
        "location_name": "صيدلية أ",
        "quantity": 5
      }
    ],
    "topSellingProducts": [
      {
        "product_name": "دواء أ",
        "sku": "VET-123",
        "quantity_sold": 50
      }
    ]
  }
  ```

## Code Audit Issues and Remediation Plan

The static code audit identified 11 critical issues:

1. **CHECK constraint violation in returnToSupplier**: In `lib/stock.js`, returning stock to a supplier sets `to_location = supplierId` for a movement where `movement = 'OUT'`. This violates the DB check constraint requiring `to_location` to be `NULL` for `OUT` movements.
   - *Fix*: Update the movement type to `'TRANSFER'` when returning to a supplier.
2. **Tab vs Category switching mismatch in E2E Tests**: In `tests/e2e.test.js`, the tests expect tab buttons switching to `'pharmacies'`, `'warehouse'`, and `'exporters'` via `switchTab(...)`, but the actual sidebar tabs are `'inventory'`, `'analytics'`, `'alerts'`, and `'admin'`.
   - *Fix*: Update index.html and app.js to support these tab actions or align the E2E tests with the switcher/tab structure.
3. **Missing Exporter switcher button in index.html**: In `public/index.html`, the `'Exporter'` button is missing from the category switcher. `tests/verify-switcher.js` expects exactly 3 buttons.
   - *Fix*: Add the `'Exporter'` category switcher button to the navigation bar.
4. **Supplier/Exporter terminology mismatch**: Migration 003 renamed location type `'Exporter'` to `'Supplier'` in the DB. However, the tests, switcher, and frontend state use `'Exporter'`.
   - *Fix*: Map `'Exporter'` to `'Supplier'` in database queries and API endpoints where appropriate, or align the terms.
5. **PUT location validation failure on missing address**: In `api/locations.js`, PUT `/api/locations/:id` requires both `'name'` and `'address'`, but the frontend `editSupplier()` only sends `'name'`, causing a `400 Bad Request` validation error.
   - *Fix*: Remove the mandatory `'address'` field requirement from the PUT validation in the backend.
6. **Warehouse inbound activity log missing TRANSFER type movements**: In `api/analytics.js`, inbound logs only aggregate `'IN'` movements. However, supplier deliveries to the warehouse are registered as `'TRANSFER'` movements, meaning all incoming deliveries are missing from the warehouse profile.
   - *Fix*: Update the query to include `'TRANSFER'` movements where the source location is a Supplier.
7. **Reversed transactions inflating sales metrics**: Reversals in `lib/stock.js` only prepend `[REVERSED]` to the reference note but leave the movement as `'OUT'`. Reporting queries sum all `'OUT'` movements, counting reversed sales.
   - *Fix*: Filter out movements with reference notes matching `[REVERSED]%` in sales reporting queries.
8. **Depleted batches permanently showing as low stock**: Depleted batches (quantity = 0) with a reorder point of 0 satisfy `sl.quantity <= sl.reorder_point` and are permanently shown as low stock.
   - *Fix*: Update low stock checks to exclude `quantity = 0` when `reorder_point = 0`.
9. **Shortage predictor excluding out-of-stock products**: The shortage risks query uses inner joins on `stock_level` and `batch`, excluding products with 0 active stock level rows in the warehouse.
   - *Fix*: Change inner joins to left joins in the shortage risks query.
10. **Migration rollback tracker not cleaned up**: In `db/migrate.js`, `migrateDown` executes the rollback SQL but does not delete the filename from the `_migrations` tracking table.
    - *Fix*: Execute deletion of the rolled-back migration filename from `_migrations` inside the transaction.
11. **Fake mock metrics for supplier ratings**: In `api/analytics.js`, the on-time delivery rating is calculated using `Math.random() * 20` instead of using the actual expected delivery and fulfilled dates.
    - *Fix*: Calculate the actual rating using the tracking data introduced in Migration 009.

## Remediation Strategy

We will delegate the remediation of these issues to a single Worker subagent. The worker will:
1. Align the HTML/JS frontend switching logic with test expectations (add Exporter button, ensure tab switches for pharmacies, warehouse, exporters are correctly supported).
2. Fix backend routes (PUT validation, analytics queries, sales report queries).
3. Fix transaction logic in `lib/stock.js` (supplier return constraint, reversed sales notes).
4. Fix database views/helpers (low stock logic, shortage risks, migration tracking).
5. Run the tests to verify the fixes.

