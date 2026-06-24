# Original User Request

## Initial Request — 2026-06-23T12:13:51Z

A massive update to the existing Vet Monitor system to support custom information, functions, and a multi-tab interface for three categories: Pharmacies, Warehouse, and Exporters. The immediate focus is the Pharmacy module, specifically providing supervisors with tracking for insufficient products, expiry dates, and total monthly sales.

Working directory: d:\ziad 2026\vet-monitor
Integrity mode: benchmark

## Requirements

### R1. Multi-category Navigation
Implement a clear tabbed or sidebar navigation system to switch between "Pharmacies", "Warehouse", and "Exporters" contexts within the existing web application UI.

### R2. Pharmacy Supervisor Dashboard
Within the Pharmacy context, build a dashboard that displays:
- Insufficient products (items falling below low-stock thresholds)
- Expiry date monitoring (highlighting batches near expiration)
- Total months sales (monthly sales aggregated metrics)

### R3. Backend Integration
Utilize the existing SQLite database and Express backend (`server.js`). You may need to create or expand existing endpoints in the `api/` directory (e.g., `api/inventory.js`, `api/products.js`, `api/stock.js`) to provide the necessary aggregated data for the dashboard.

### R4. Production Quality UI
The frontend delivery must be a polished, production-ready feature with robust logic. Integrate seamlessly with the existing `public/index.html`, `styles.css`, and `app.js`.

### R5. Backend Safety Constraints
Do NOT modify or break any existing backend core logic. If you must add new API capabilities to fetch the required data, do so by adding new, isolated endpoints (or new files) rather than modifying the core of the existing backend.

## Acceptance Criteria

### API and Data Integrity
- [ ] A dedicated API endpoint (or set of endpoints) successfully returns JSON data containing low stock products, batch expiry dates, and sales metrics.
- [ ] The existing API health check (`GET /api/health`) continues to pass.
- [ ] Existing backend features and database structures are intact and undisturbed.

### User Interface 
- [ ] The application has distinct navigable sections for Pharmacies, Warehouse, and Exporters.
- [ ] The Pharmacy dashboard successfully renders dynamic data fetched from the backend (no hardcoded mocks).
- [ ] UI elements (tables/cards) clearly show the insufficient stock, expiration dates, and sales metrics without console errors.
