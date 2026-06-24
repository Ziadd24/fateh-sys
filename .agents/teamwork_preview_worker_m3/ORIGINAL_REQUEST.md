## 2026-06-23T12:51:31Z

You are the Worker for Milestone 3: Frontend Category Switcher.
Your working directory is d:\ziad 2026\vet-monitor\.agents\teamwork_preview_worker_m3.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task: Implement the visual Category Switcher in public/index.html, public/app.js, and public/styles.css.

Specific guidelines:
1. In public/index.html:
   - Add a category switcher navigation at the top of the `.content-wrapper` (or top of `.main-content` layout). It should contain three buttons: "الصيدليات" (Pharmacy context), "المستودع" (Warehouse context), and "المصدرون" (Exporter context).
   - Add a container `<div id="pharmacy-dashboard" class="pharmacy-only" style="margin-bottom: 2rem;">` that acts as a placeholder for the Pharmacy Supervisor Dashboard (Milestone 4). Inside it, place a card layout with a title (e.g., "لوحة تحكم مشرف الصيدلية") and some neat placeholder texts for insufficient stock count, expiry date alerts, and monthly sales.
2. In public/app.js:
   - In the global `state` object, initialize `category: 'Pharmacy'`.
   - Implement `switchCategory(category)` function:
     * Sets `state.category = category` (where category is 'Pharmacy', 'Warehouse', or 'Exporter').
     * Toggles active classes on the category switcher buttons.
     * Updates the display of `#pharmacy-dashboard` (visible only if category is 'Pharmacy', hidden otherwise).
     * Re-renders the inventory table to show only items matching `location_type === state.category`.
   - Update `renderInventoryTable()` to filter items before sorting and rendering:
     * Filter: `const filtered = state.inventory.filter(item => !state.category || item.location_type === state.category);`
     * Ensure sorting and empty state work correctly with the filtered array.
   - In `loadAll()`, make sure we trigger the filter and toggle the dashboard state when loading data.
3. In public/styles.css:
   - Add responsive CSS rules for the category switcher tabs and the dashboard placeholder. Make them look professional, aligned to the RTL layout, and cohesive with the existing Tailwind-like theme (using CSS variables).
4. Run/test:
   - Make sure there are no Javascript console errors. Propose starting the server (`npm start`) and verifying that the page loads correctly and switches tabs filtering the inventory.

Write a handoff.md detailing your changes and verification results, then send a message back.
