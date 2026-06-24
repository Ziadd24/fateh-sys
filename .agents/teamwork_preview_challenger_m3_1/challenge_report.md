# Challenge Report — Category Switcher

## Challenge Summary

**Overall risk assessment**: MEDIUM (due to out-of-sync E2E test suite; LOW for the core switcher code itself)

---

## Challenges

### [Medium] Challenge 1: Out-of-Sync E2E Test Suite (`tests/e2e.test.js`)
- **Assumption challenged**: Assumes the pre-existing test suite (`tests/e2e.test.js`) is aligned with the actual implementation.
- **Attack scenario**: Running the project's standard E2E test suite via `node --test tests/e2e.test.js` fails. The E2E tests expect tab buttons referencing `switchTab('pharmacies')`, `switchTab('warehouse')`, and `switchTab('exporters')`, while `public/index.html` actually implements sidebar tabs as `switchTab('inventory')`, `switchTab('alerts')`, and `switchTab('admin')`. Additionally, `tests/e2e.test.js` attempts to call `context.switchTab('warehouse')` which throws a `TypeError` (since there is no `#tab-warehouse` element in the DOM).
- **Blast radius**: Running automated CI/CD pipelines will fail due to out-of-sync tests, even though the frontend application functions correctly.
- **Mitigation**: Update the E2E test cases to target the correct DOM elements and tab identifiers used in production.

### [Low] Challenge 2: Case Sensitivity in Location Type Filtering
- **Assumption challenged**: Assumes location types in the database and API responses will always exactly match the casing of the switcher states (`Pharmacy`, `Warehouse`, `Exporter`).
- **Attack scenario**: If a branch is inserted with the location type `'pharmacy'` (lowercase) or `'warehouse'`, the filter expression `item.location_type === state.category` will fail because of case sensitivity.
- **Blast radius**: Items belonging to lowercase location types will be silently filtered out and not display in the UI under any switcher category.
- **Mitigation**: Normalize casing during filtering: `item.location_type.toLowerCase() === state.category.toLowerCase()`.

---

## Stress Test Results

### Scenario 1: Initial load state check
- **Expected behavior**: State initialized with category `'Pharmacy'`, and the pharmacy dashboard is visible.
- **Actual behavior**: `state.category` starts as `'Pharmacy'`, and `pharmacy-dashboard` style.display is `'block'`.
- **Status**: PASS

### Scenario 2: Switch to Warehouse category
- **Expected behavior**: State changes to `'Warehouse'`, category switcher active button changes to Warehouse, pharmacy dashboard is hidden (`display: none`), and only Warehouse inventory items are shown.
- **Actual behavior**: State updates, active button toggled correctly, `pharmacy-dashboard` display set to `'none'`, inventory rendered contains only location type `'Warehouse'`.
- **Status**: PASS

### Scenario 3: Switch to Exporter category
- **Expected behavior**: State changes to `'Exporter'`, active button changes to Exporter, pharmacy dashboard is hidden, and only Exporter inventory items are shown.
- **Actual behavior**: State updates, active button toggled correctly, `pharmacy-dashboard` display set to `'none'`, inventory rendered contains only location type `'Exporter'`.
- **Status**: PASS

### Scenario 4: Call switchCategory with invalid or undefined category
- **Expected behavior**: Application handles gracefully without throwing errors; switcher buttons lose active class and table displays empty state.
- **Actual behavior**: Code executes without throwing errors, hides the pharmacy dashboard, active buttons are all deactivated, and table renders empty state.
- **Status**: PASS

---

## Unchallenged Areas

- **Backend API Database Integrity**: Database foreign key constraints and category/location type validation at the server level were not stress-tested because the scope of the review is restricted to the frontend Category Switcher components in `public/index.html` and `public/app.js`.
