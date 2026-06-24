# Original User Request

## Initial Request — 2026-06-23T15:36:27+03:00

You are the Sub-Orchestrator for Milestone 2: Backend API Expansion.
Your working directory is d:\ziad 2026\vet-monitor\.agents\sub_orch_m2.
Your parent conversation ID is 99e11144-0b46-476e-a8f7-9baad0e9e246.
Your mission is to implement and verify:
- GET /api/reports/pharmacy-dashboard in api/reports.js
- Mount it in server.js
- The API must follow the contract:
  Returns { totalMonthlySales, insufficientProductsCount, nearExpiryBatchesCount, insufficientProducts, nearExpiryBatches, topSellingProducts } where:
  - totalMonthlySales: total units sold (movement = 'OUT') at locations of type 'Pharmacy' in the current calendar month.
  - insufficientProductsCount: count of insufficient products at pharmacy locations (quantity <= reorder_point).
  - nearExpiryBatchesCount: count of near-expiry batches at pharmacy locations (expiring in <= 4 months and > now, quantity > 0).
  - insufficientProducts: list of objects matching the contract schema (location_id, location_name, batch_no, sku, product_name, category, quantity, reorder_point, expiry_date).
  - nearExpiryBatches: list of objects matching the contract schema (batch_no, sku, product_name, expiry_date, days_until_expiry, location_id, location_name, quantity).
  - topSellingProducts: list of products with product_name, sku, quantity_sold (sum of movement = 'OUT' at pharmacy locations in the current calendar month), ordered by quantity_sold descending.
- Please initialize your BRIEFING.md and progress.md in your working directory.
- Perform the iteration loop (Explorer -> Worker -> Reviewer -> Challenger -> Forensic Auditor -> Gate) to implement and verify.
- Ensure all database queries are correct and performant. Do not write dummy code. Ensure no hardcoded responses.
- When complete, write handoff.md and send a message reporting status and results back to your parent.
