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
