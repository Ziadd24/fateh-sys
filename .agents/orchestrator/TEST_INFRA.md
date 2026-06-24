# E2E Test Infra: Vet Monitor

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on internal implementation design.
- Verification checks Node.js Express server APIs and parses frontend HTML/JS structure.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Multi-category Navigation (R1) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | Pharmacy Supervisor Dashboard (R2) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 3 | Backend Integration & Safety (R3, R5) | ORIGINAL_REQUEST §R3, §R5 | 5 | 5 | ✓ |

## Test Architecture
- **Test Runner**: Node.js built-in `node:test` runner.
- **Invocation**: Run command `node --test tests/e2e.test.js`
- **Pass/Fail Semantics**: Exit code 0 on success, non-zero on failure.
- **Test Cases Location**: `tests/e2e.test.js`

## Test Cases & Tiers

### Tier 1: Feature Coverage (15 tests)
- **F1 (Navigation)**:
  - Check tab elements for Pharmacies context in HTML.
  - Check tab elements for Warehouse context in HTML.
  - Check tab elements for Exporters context in HTML.
  - Check category select handlers in app.js.
  - Verify tab switching css classes changes context state.
- **F2 (Pharmacy Dashboard)**:
  - Verify API returns correct keys for low stock items.
  - Verify API returns correct keys for near-expiry items.
  - Verify API returns correct keys for monthly sales.
  - Verify frontend renders low stock list.
  - Verify frontend renders near-expiry list.
- **F3 (Backend Integration & Safety)**:
  - Verify `GET /api/health` returns status `ok`.
  - Verify existing API endpoints like `GET /api/products` work unchanged.
  - Verify database migrations run and seed works.
  - Verify dashboard API rejects invalid request types.
  - Verify standard inventory route `/api/inventory` is intact.

### Tier 2: Boundary & Corner Cases (15 tests)
- Low stock limits: 0 stock, exactly at reorder point, just above reorder point.
- Expiry date ranges: expiring today, expiring in exactly 4 months (boundary), expiring in 4 months + 1 day (should not be in alert), expired items.
- Sales range: 0 monthly sales (new location), negative sales quantity (should be rejected by database constraints), large sales quantity.
- UI elements: empty state message when no low stock items, empty state for near expiry, no console errors.

### Tier 3: Cross-Feature Combinations (3 tests)
- **C1**: Deducting stock of a product at a pharmacy (sale) immediately updates the dashboard's Monthly Sales metric AND may trigger Insufficient Stock if quantity drops below threshold.
- **C2**: Adding new locations of different types (Warehouse, Exporters) and receiving stock there does NOT affect the Pharmacy Supervisor Dashboard's metrics (isolation check).
- **C3**: Creating a new near-expiry batch, receiving it at a pharmacy, then acknowledging/expiring the alert, verifying dashboard updates dynamically.

### Tier 4: Real-World Application Scenarios (5 tests)
- **Scenario 1**: End-to-end user path: Supervisor logs in, navigates to "Pharmacies" workspace, observes monthly sales and near-expiry drugs, issues a stock deduction (simulated sale), updates low stock checklist, and views updated metrics.
- **Scenario 2**: Multi-location supply chain transfer: transfer stock from Warehouse to Pharmacy, verifying that Warehouse inventory decreases, Pharmacy inventory increases, and the Pharmacy Dashboard dynamically updates its low stock notifications.
- **Scenario 3**: Exporters inventory quarantine: Exporters products are received and verified to show up ONLY in the Exporters inventory tab, with zero leakage into the Pharmacy Supervisor Dashboard.
- **Scenario 4**: Expiry date alerts scan loop: run the worker to populate Alerts, verify that those alerts are populated for pharmacy locations and render under Pharmacy Dashboard's Expiry date section, then acknowledge one alert and verify it is removed from active alerts.
- **Scenario 5**: High workload sales aggregation: generate multiple random FIFO deductions (sales) at different pharmacies throughout the current month, verify the `/api/reports/pharmacy-dashboard` returns the exact mathematical sum of quantities.

## Coverage Thresholds
- Tier 1: 15 tests
- Tier 2: 15 tests
- Tier 3: 3 tests
- Tier 4: 5 tests
- Total E2E test cases: 38
