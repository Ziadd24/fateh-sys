# Scope: Vet Monitor Custom Multi-tab System and Pharmacy Supervisor Dashboard

## Architecture
The system is a Node.js + Express SPA with a native SQLite database (`data/vet-monitor.db`) queried using `node:sqlite`.
- **Backend**: Express router in `api/reports.js` mounted at `/api/reports/` in `server.js`.
- **Frontend**: Single-page application inside `public/` (index.html, app.js, styles.css). Navigation switcher changes context among:
  - "Pharmacies" (shows the supervisor dashboard panels when active)
  - "Warehouse" (existing views)
  - "Exporters" (existing views)
- **Database Schema**: Querying tables in `data/vet-monitor.db`. Let's discover tables like sales, inventory, products, batches, locations, etc.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M2 | Backend API Expansion | Implement `/api/reports/pharmacy-dashboard` in `api/reports.js`. Mount in `server.js`. | None | PLANNED |
| M3 | Frontend Category Switcher | Switch between "Pharmacies", "Warehouse", "Exporters" in `public/index.html` and `public/app.js`. | None | PLANNED |
| M4 | Pharmacy Supervisor Dashboard UI | Create panels for low stock, near expiry, total monthly sales in "Pharmacies" tab, bound to dashboard endpoint. | M2, M3 | PLANNED |
| M5 | E2E Validation & Audit | Pass 100% E2E tests (Phase 1) and adversarial coverage hardening (Phase 2). | M4 | PLANNED |

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
