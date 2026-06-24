# Scope: Milestone 2: Backend API Expansion

## Architecture
- **API Endpoint**: `GET /api/reports/pharmacy-dashboard`
- **Controller/Router File**: `api/reports.js`
- **Main Server File**: `server.js`
- **Database**: SQLite/PostgreSQL/MySQL (dependent on codebase, to be explored)
- **Data Flow**:
  - Client sends GET request to `/api/reports/pharmacy-dashboard`
  - Server routes to `api/reports.js`
  - `api/reports.js` queries DB for inventory, locations, movements, and products
  - Data aggregated according to the contract, filtering by locations of type 'Pharmacy' and relevant date/quantity/expiry thresholds
  - JSON response returned to client

## Milestone Task List
| # | Task Name | Scope | Dependencies | Status |
|---|-----------|-------|--------------|--------|
| 1 | Explore codebase | Discover db schema, existing endpoints, query utilities | None | PLANNED |
| 2 | Implementation | Implement GET /api/reports/pharmacy-dashboard and mount it in server.js | M1 | PLANNED |
| 3 | Review & Unit Test | Run static analysis, write unit tests, verify design | M2 | PLANNED |
| 4 | Challenger Verification | Run adversarial stress testing on queries and edge cases | M3 | PLANNED |
| 5 | Forensic Audit | Verify integrity, ensure no cheating/hardcoding/dummy implementations | M4 | PLANNED |
| 6 | Gate Check | Verify all checks pass, finalize handoff | M5 | PLANNED |

## Interface Contracts
### GET /api/reports/pharmacy-dashboard
- **Request**: `GET /api/reports/pharmacy-dashboard` (no query params specified, but should handle gracefully)
- **Response status**: `200 OK` on success, `500 Internal Server Error` on error
- **Response schema**:
```json
{
  "totalMonthlySales": 150,
  "insufficientProductsCount": 3,
  "nearExpiryBatchesCount": 2,
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
  ],
  "nearExpiryBatches": [
    {
      "batch_no": "B-9988",
      "sku": "SKU-PH-1",
      "product_name": "Amoxicillin",
      "expiry_date": "2026-09-30",
      "days_until_expiry": 99,
      "location_id": "loc-123",
      "location_name": "Main Pharmacy",
      "quantity": 15
    }
  ],
  "topSellingProducts": [
    {
      "product_name": "Amoxicillin",
      "sku": "SKU-PH-1",
      "quantity_sold": 120
    }
  ]
}
```
