## 2026-06-23T12:55:00Z
You are a worker agent for E2E tests. Your task is to set up the E2E test infrastructure and implement Tier 1 Feature Coverage tests.

Please follow these steps:
1. Modify `db/connection.js` to allow overriding the database file path using the `TEST_DB_PATH` environment variable:
```javascript
const dbPath = process.env.TEST_DB_PATH
  ? path.resolve(process.env.TEST_DB_PATH)
  : path.join(dataDir, 'vet-monitor.db');
const db = new DatabaseSync(dbPath);
```
Ensure all other database setup/connection logic remains unchanged.

2. Create `tests/e2e.test.js` using the Node.js built-in `node:test` runner and `node:assert` library.
3. In `tests/e2e.test.js`, implement:
   - Dynamic port selection to prevent port-in-use conflicts.
   - Child process spawning and termination of the Express server (`server.js`).
   - A clean database helper that deletes rows in a transaction in foreign-key-safe order before each test.
   - A VM sandboxing mechanism to load and execute `public/app.js` with mocked DOM/window/fetch globals to test the frontend JavaScript behavior.
4. Implement the 15 Tier 1 Feature Coverage tests (F1-T1 to F3-T15) as specified in `.agents/explorer_e2e_setup/handoff.md`.
5. Run the test suite with `node --test tests/e2e.test.js`. Document the execution output and which tests pass (like health check, products, migrations) and which tests fail (like the unimplemented pharmacy dashboard endpoints/UI). Verify that the suite runs cleanly to completion without process crashes or hangs.
6. Write your report to `handoff.md` in your working directory `.agents/worker_tier1_setup/`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
