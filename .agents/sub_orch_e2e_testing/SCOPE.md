# Scope: E2E Test Suite Implementation

## Architecture
- **Test Runner**: Node.js built-in `node:test` runner.
- **Assertion Library**: Node.js built-in `node:assert`.
- **Target App**: Node.js Express server (`server.js`) started programmatically or via child process, with dynamically allocated ports to avoid port conflicts.
- **Database**: SQLite database (`data/vet-monitor.db`), initialized and seeded using migration and seed scripts, with database isolation or reset between test sections where necessary.
- **E2E verification channels**: REST API endpoints (e.g. GET/POST endpoints) and parsing rendered HTML/JS structure from the server endpoints.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Setup & Tier 1 | Setup Express helper, SQLite reset helper, and implement 15 Tier 1 Feature Coverage tests | none | DONE |
| 2 | Tier 2 | Implement 15 Tier 2 Boundary & Corner case tests | M1 | IN_PROGRESS |
| 3 | Tier 3 & Tier 4 | Implement 3 Tier 3 Cross-Feature tests and 5 Tier 4 Real-World scenario tests | M2 | PLANNED |
| 4 | Integration & TEST_READY | Verify all 38 tests pass, run Forensic Auditor, publish TEST_READY.md | M3 | PLANNED |

## Interface Contracts
- Tests must be executed using: `node --test tests/e2e.test.js`
- Express server must be queried via dynamic HTTP fetch calls.
- SQLite DB must be manipulated or queried using the existing DB connection module (`db/connection.js`).
