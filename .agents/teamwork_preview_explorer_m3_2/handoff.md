# Handoff Report: Category Switcher Implementation Strategy

This report outlines the proposed strategy and code modifications to implement a visual Category Switcher, integrate a context-specific Pharmacy Dashboard placeholder, and apply responsive design to the Vet Monitor interface.

---

## 1. Observation
After conducting a read-only investigation of the Vet Monitor codebase, we observed the following:

- **HTML Layout Structure (`public/index.html`):**
  - The page uses a sidebar (`<aside class="sidebar">`, lines 17-41) and main content area (`<main class="main-content">`, lines 44-272) wrapped in a grid-based CSS layout (`.dashboard-layout`).
  - Inside the main content, a content wrapper (`<div class="content-wrapper">`, line 59) hosts separate tab views: `tab-inventory` (lines 62-88), `tab-alerts` (lines 91-141), and `tab-admin` (lines 144-269).
  - The inventory tab (`tab-inventory`) displays a table (`<table class="data-table">`, lines 71-85) populated dynamically from JavaScript.

- **JavaScript Operations (`public/app.js`):**
  - A global state object `state` (lines 8-15) stores reference data, including `locations` (line 9) and `inventory` (line 12).
  - The function `renderInventoryTable()` (lines 251-298) sorts and renders the inventory records directly from `state.inventory`. Each inventory item contains `location_type` (e.g. `'Pharmacy'`, `'Warehouse'`, `'Exporter'`) mapped to badges in `locationBadge(type)` (lines 230-234).
  - Reference data is fetched and loaded inside `loadAll()` (lines 386-405).

- **Styles and Responsiveness (`public/styles.css`):**
  - The layout employs fixed grid columns for the dashboard: `.dashboard-layout { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }` (lines 72-76).
  - There are currently no media queries or responsive grid/flex definitions to support mobile viewport scaling.

---

## 2. Logic Chain

1. **Category Switcher Placement:**
   - To offer the user intuitive, tab-like control over the inventory context without polluting the global navigation sidebar, the Switcher tabs should sit at the top of the inventory tab (`#tab-inventory`) in `public/index.html`. This ensures that changing the active category immediately filters the main table.
2. **State Tracking:**
   - Adding `activeCategory: 'Pharmacy'` (defaulting to Pharmacies) to `state` in `public/app.js` is the most straightforward way to track user selections. When a user clicks a switcher tab, a helper function `setCategory(category)` updates `state.activeCategory`, adjusts visual classes, and triggers a table redraw.
3. **Inventory Filtering:**
   - Modifying `renderInventoryTable()` to filter `state.inventory` based on `state.activeCategory` (matching `item.location_type`) ensures that the table updates reactively. A value of `'all'` bypasses the filter.
4. **Pharmacy Dashboard:**
   - An HTML container `#pharmacy-dashboard` inside the inventory tab will act as a placeholder. We will write an update function (`updatePharmacyDashboard()`) in JavaScript that runs when `'Pharmacy'` is selected. It calculates summary metrics (e.g., active pharmacy count, total pharmacy inventory quantity, low-stock alerts) from `state.locations` and `state.inventory` to populate the placeholder cards.
5. **CSS and Responsiveness:**
   - Devising styled `.category-switcher` (tabs container) and `.category-btn` classes gives the switcher a native feel consistent with the existing corporate theme.
   - Introducing media queries (targeting `max-width: 768px`) will re-layout `.dashboard-layout` to stack the sidebar vertically, convert sidebar buttons to a horizontal nav bar, and ensure the topbar/switcher elements resize beautifully on smaller screens.

---

## 3. Caveats
- **Alerts Filtering:** This proposal only applies category filtering to the main inventory table. Other sub-panels in the Alerts tab (e.g., near-expiry, low-stock, movement history) are not filtered. If filtering alerts by category is required, similar adjustments should be added to `loadAlerts()` and `loadLowStock()`.
- **Database Scope:** The filter is implemented purely on the client side on top of the loaded `state.inventory` array. Since data sizes are small (a few dozen items), client-side filtering is extremely fast. If inventory size grows to thousands of records, server-side pagination and category query params should be introduced.
- **Default Category:** The switcher is designed to default to `'Pharmacy'` based on the doctor-centric system specification.

---

## 4. Conclusion & Proposed Changes
We recommend implementing the following precise modifications across the frontend files:

### A. Modifications to `public/index.html`

Insert the Category Switcher tabs and the Pharmacy Dashboard placeholder at the top of `#tab-inventory`.

**Before (Lines 61-64):**
```html
        <!-- ═══ TAB: INVENTORY (Main Doctor View) ═══ -->
        <div id="tab-inventory" class="tab-content active">
          <div class="panel">
```

**After:**
```html
        <!-- ═══ TAB: INVENTORY (Main Doctor View) ═══ -->
        <div id="tab-inventory" class="tab-content active">
          
          <!-- ═══ CATEGORY SWITCHER ═══ -->
          <div class="category-switcher">
            <button class="category-btn active" data-category="Pharmacy" onclick="setCategory('Pharmacy')">🏪 صيدليات</button>
            <button class="category-btn" data-category="Warehouse" onclick="setCategory('Warehouse')">🏢 مستودعات</button>
            <button class="category-btn" data-category="Exporter" onclick="setCategory('Exporter')">🚢 مصدّرين</button>
            <button class="category-btn" data-category="all" onclick="setCategory('all')">الكل</button>
          </div>

          <!-- ═══ PHARMACY DASHBOARD PLACEHOLDER ═══ -->
          <div id="pharmacy-dashboard" class="pharmacy-dashboard">
            <div class="stats-mini">
              <div class="stat-card-mini">
                <span class="stat-card-mini__title">إجمالي الفروع الصيدلانية</span>
                <span class="stat-card-mini__value" id="pharmacy-count">0</span>
              </div>
              <div class="stat-card-mini">
                <span class="stat-card-mini__title">الأدوية المتاحة بالصيدليات</span>
                <span class="stat-card-mini__value" id="pharmacy-stock-count">0</span>
              </div>
              <div class="stat-card-mini">
                <span class="stat-card-mini__title">التنبيهات النشطة بالصيدليات</span>
                <span class="stat-card-mini__value" id="pharmacy-low-stock-count">0</span>
              </div>
            </div>
          </div>

          <div class="panel">
```

---

### B. Modifications to `public/app.js`

1. Add `activeCategory` to the global `state` definition.
2. Filter inventory records in `renderInventoryTable()` based on `activeCategory`.
3. Add helper functions `setCategory()` and `updatePharmacyDashboard()`.
4. Run `setCategory(state.activeCategory)` on page load to initialize the view.

**Before (Lines 8-15):**
```javascript
let state = {
  locations: [],
  products: [],
  batches: [],
  inventory: [],
  sortCol: 'product_name',
  sortAsc: true
};
```

**After:**
```javascript
let state = {
  locations: [],
  products: [],
  batches: [],
  inventory: [],
  sortCol: 'product_name',
  sortAsc: true,
  activeCategory: 'Pharmacy' // Track selected category
};
```

**Before (Lines 251-253):**
```javascript
function renderInventoryTable() {
  const inv = [...state.inventory];
  
  // Sorting logic
```

**After:**
```javascript
function renderInventoryTable() {
  let inv = [...state.inventory];
  
  // Filter inventory based on selected category type
  if (state.activeCategory && state.activeCategory !== 'all') {
    inv = inv.filter(item => item.location_type === state.activeCategory);
  }
  
  // Sorting logic
```

**Add new functions to `public/app.js` (e.g. before Init block, line 407):**
```javascript
function setCategory(category) {
  state.activeCategory = category;
  
  // Update category switcher buttons UI active state
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-category') === category);
  });
  
  // Handle pharmacy-specific dashboard visibility
  const dashboard = $('pharmacy-dashboard');
  if (dashboard) {
    if (category === 'Pharmacy') {
      dashboard.style.display = 'block';
      updatePharmacyDashboard();
    } else {
      dashboard.style.display = 'none';
    }
  }
  
  // Redraw inventory
  renderInventoryTable();
}

function updatePharmacyDashboard() {
  // 1. Total Pharmacies Count
  const pharmacyCount = state.locations.filter(l => l.type === 'Pharmacy').length;
  $('pharmacy-count').textContent = pharmacyCount;

  // 2. Total stock items in Pharmacies
  const pharmacyInv = state.inventory.filter(item => item.location_type === 'Pharmacy');
  const totalStock = pharmacyInv.reduce((sum, item) => sum + item.quantity, 0);
  $('pharmacy-stock-count').textContent = totalStock;

  // 3. Low stock items in Pharmacies
  const lowStockCount = pharmacyInv.filter(item => item.quantity <= item.reorder_point).length;
  $('pharmacy-low-stock-count').textContent = lowStockCount;
}
```

**Modify the Initialization listener to trigger `setCategory` on load:**

**Before (Lines 407-410):**
```javascript
// Init
window.addEventListener('DOMContentLoaded', loadAll);
setInterval(loadAll, 60000); // Poll every minute
```

**After:**
```javascript
// Init
window.addEventListener('DOMContentLoaded', async () => {
  await loadAll();
  setCategory(state.activeCategory); // Ensure initial category and dashboard states are drawn
});
setInterval(loadAll, 60000); // Poll every minute
```

---

### C. Modifications to `public/styles.css`

Append switcher styling, dashboard placeholder styling, and responsive media queries at the bottom of the file.

**Add at the end of the file:**
```css
/* ── Category Switcher Styles ── */
.category-switcher {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  background: var(--bg-card);
  padding: 0.5rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  width: fit-content;
}

.category-btn {
  background: transparent;
  border: none;
  padding: 0.5rem 1.25rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius);
  transition: var(--transition);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.category-btn:hover {
  color: var(--text-primary);
  background: var(--bg-body);
}

.category-btn.active {
  background: var(--primary);
  color: #ffffff;
}

/* ── Pharmacy Dashboard Placeholder Styles ── */
.pharmacy-dashboard {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 1.25rem;
  margin-bottom: 1.5rem;
  animation: fadeIn 0.3s ease-out;
}

.stats-mini {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.stat-card-mini {
  background: var(--bg-body);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.stat-card-mini__title {
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-weight: 600;
}

.stat-card-mini__value {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--primary);
}

/* ── Responsive Scaling Media Queries ── */
@media (max-width: 1024px) {
  .dashboard-layout {
    grid-template-columns: 200px 1fr;
  }
}

@media (max-width: 768px) {
  .dashboard-layout {
    grid-template-columns: 1fr; /* Stack sidebar vertically on top of main content */
  }
  
  .sidebar {
    border-left: none;
    border-bottom: 1px solid var(--border-color);
    width: 100%;
  }
  
  .sidebar__nav {
    flex-direction: row; /* Horizontal layout for sidebar menu on mobile */
    justify-content: space-around;
    padding: 0.5rem 0;
  }
  
  .tab-btn {
    padding: 0.5rem 1rem;
    border-right: none;
    border-bottom: 3px solid transparent;
    text-align: center;
    justify-content: center;
  }
  
  .tab-btn.active {
    border-right: none;
    border-bottom: 3px solid var(--primary);
  }
  
  .content-wrapper {
    padding: 1rem;
  }
  
  .topbar {
    padding: 1rem;
    flex-direction: column;
    gap: 1rem;
    align-items: stretch;
  }
  
  .topbar__actions {
    justify-content: space-between;
  }
  
  .category-switcher {
    width: 100%;
    justify-content: space-between;
  }
  
  .category-btn {
    flex: 1;
    justify-content: center;
    padding: 0.5rem;
    font-size: 0.85rem;
  }
}
```

---

## 5. Verification Method

To independently verify the recommendations:

1. **Environment Setup & Start:**
   - Open PowerShell or command line in the project root directory.
   - Propose starting the development server:
     ```bash
     npm run dev
     ```
   - Confirm server starts on `http://localhost:3000`.

2. **Visual & Behavioral Checks (Desktop):**
   - Open browser and navigate to `http://localhost:3000`.
   - Verify that the Category Switcher tabs (صيدليات, مستودعات, مصدّرين, الكل) appear prominently above the inventory panel.
   - Confirm that the Pharmacy Dashboard shows 3 mini stat cards (Total Pharmacies, Available Stock, Low Stock Alerts) when the active category is set to `'Pharmacy'`.
   - Toggle to other categories (e.g. `'Warehouse'`) and verify that the Pharmacy Dashboard placeholder hides immediately.
   - Verify that clicking each tab correctly filters the table below by the respective location type (e.g., only showing `'صيدلية'` locations under the Pharmacy tab).

3. **Responsive Design Verification (Mobile View):**
   - Press `F12` to open DevTools, toggle mobile emulator view, and select a mobile layout width (e.g., 375px or 768px).
   - Verify that the sidebar stacks on top or turns into a horizontal tab layout.
   - Verify that the Category Switcher occupies the full width of the mobile container and buttons scale proportionally.
