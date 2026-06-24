## 2026-06-23T12:57:20Z

You are Worker (teamwork_preview_worker).
Your working directory is d:\ziad 2026\vet-monitor\.agents\worker_m2.
Your parent conversation ID is 72c0a0c2-734e-444c-938e-26f8e9aa5604.
Your mission is to implement:
- GET /api/reports/pharmacy-dashboard in api/reports.js
- Mount it in server.js

Please use the designs proposed by the explorers:
Explorer 1 handoff: d:\ziad 2026\vet-monitor\.agents\explorer_m2_1\proposed_reports.js
Explorer 2 handoff: d:\ziad 2026\vet-monitor\.agents\explorer_m2_2\proposed_api_reports.js

Ensure the implementation follows the contract exactly:
Returns { totalMonthlySales, insufficientProductsCount, nearExpiryBatchesCount, insufficientProducts, nearExpiryBatches, topSellingProducts } where:
  - totalMonthlySales: total units sold (movement = 'OUT' at locations of type 'Pharmacy' in the current calendar month.
  - insufficientProductsCount: count of insufficient products at pharmacy locations (quantity <= reorder_point).
  - nearExpiryBatchesCount: count of near-expiry batches at pharmacy locations (expiring in <= 4 months and > now, quantity > 0).
  - insufficientProducts: list of objects matching the contract schema (location_id, location_name, batch_no, sku, product_name, category, quantity, reorder_point, expiry_date).
  - nearExpiryBatches: list of objects matching the contract schema (batch_no, sku, product_name, expiry_date, days_until_expiry, location_id, location_name, quantity).
  - topSellingProducts: list of products with product_name, sku, quantity_sold (sum of movement = 'OUT' at pharmacy locations in the current calendar month), ordered by quantity_sold descending.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please do the following:
1. Create api/reports.js with the correct implementation of GET /api/reports/pharmacy-dashboard using the Node.js native sqlite connection imported via ../db/connection.js. Ensure timezone date handling uses SQLite datetime/date functions correctly and performantly.
2. Edit server.js to mount the reports router under '/api/reports'.
3. Run tests or write a validation script to verify that the server builds and runs correctly. Verify using existing test or command scripts, if any.
4. Save your changes description to handoff.md in your working directory and notify the parent conversation ID (72c0a0c2-734e-444c-938e-26f8e9aa5604) when complete.
