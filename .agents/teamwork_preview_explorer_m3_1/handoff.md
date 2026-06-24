# Handoff Report: Visual Category Switcher Design (Milestone 3)

## 1. Observation
During the read-only exploration of the Vet Monitor codebase, the following files and code patterns were observed:

- **Frontend Layout (`public/index.html`)**:
  - The main container layout uses a two-column grid: sidebar on the right (due to RTL dir) and main content area on the left.
  - The inventory view is defined in the `<div id="tab-inventory" class="tab-content active">` container (lines 62-89).
  - The inventory data table header is structured under `<table class="data-table">` (lines 71-85).

- **Frontend Application Logic (`public/app.js`)**:
  - The state object is initialized at the top of the file (lines 8-15):
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
  - The function `renderInventoryTable()` handles the rendering of inventory items inside `inventoryTableBody` (lines 251-298).
  - The API endpoint `/api/inventory` returns a flat list of stock levels joined with location type information.
  - Location type categorization is mapped to Arabic labels in the UI using `locationBadge` (lines 230-234):
    ```javascript
    function locationBadge(type) {
      const color = { 'Pharmacy': 'blue', 'Warehouse': 'teal', 'Exporter': 'amber' }[type] || 'purple';
      const label = { 'Pharmacy': 'صيدلية', 'Warehouse': 'مستودع', 'Exporter': 'مُصدّر' }[type] || type;
      return `<span class="badge badge--${color}">${label}</span>`;
    }
    ```

- **Backend Database Schema & Views (`db/migrations/001_core_schema.up.sql`)**:
  - The `location` table defines type constraints: `CHECK(type IN ('Pharmacy', 'Warehouse', 'Exporter'))` (line 41).
  - Low stock items view `vw_low_stock` includes the `l.type AS location_type` column (line 116).
  - Near-expiry view `vw_near_expiry` and alert tables are tied to location ids.

---

## 2. Logic Chain
- **Category Selection Placement**: To maintain doctor-centric focus while allowing easy toggling of contexts, the Category Switcher should be placed at the top of the `#tab-inventory` container. This links the filter directly to the active inventory lists and leaves space for context-specific dashboards (like Pharmacies).
- **State Management**: Adding `state.activeCategory = 'Pharmacy'` is the most direct way to track active category state without introducing external state management libraries. Initializing it as `'Pharmacy'` matches the primary doctor-centric persona of the application.
- **Data Filtering**: Since `/api/inventory` returns the `location_type` field (which corresponds to `'Pharmacy'`, `'Warehouse'`, and `'Exporter'`), we can directly filter the array in `renderInventoryTable()` using `state.activeCategory`. Other lists, such as low stock warnings fetched from `/api/stock/low`, also return `location_type` (from `vw_low_stock`), making them natively filterable. For alerts, which lack a direct type in the response, we can map `location_name` to its corresponding type in `state.locations`.
- **Dashboard UI Placeholder**: The 'Pharmacies' dashboard can be implemented as a separate panel within the inventory tab, controlled via CSS `display` depending on whether `state.activeCategory === 'Pharmacy'`. It can aggregate information from `state.locations` and `state.inventory` to display key metrics (e.g. active branch count, total stock qty, low stock warnings).
- **Styling and Responsiveness**: The current styling is desktop-first. Applying a `category-switcher` stylesheet with a flex layout and active status hooks (`.category-btn.active`) will keep alignment with the clean medical design. Media queries targeting screens `<= 768px` will stack the switcher options and widgets into grid columns for mobile usability.

---

## 3. Caveats
- **Background Alerts Data**: The `/api/alerts` endpoint does not natively return `location_type`. The suggested client-side mapping using `state.locations.find(...)` relies on matching names. If location names are non-unique (not a restriction in the DB but a standard practice), this mapping might fail. If naming conflicts occur in the future, the backend `/api/alerts` query should be updated to select `l.type AS location_type`.
- **Read-Only Mode**: This is a read-only investigation. No modifications have been made directly to the source code of the application.

---

## 4. Conclusion & Recommendations
The Category Switcher can be seamlessly integrated into the application using a frontend-driven filtering mechanism. The following changes are proposed:

### Proposed HTML Changes (`public/index.html`)
Insert the category switcher buttons and pharmacy dashboard placeholder under `#tab-inventory` (above the inventory panel):
```html
<<<< BEFORE (Line 61-63)
        <!-- ═══ TAB: INVENTORY (Main Doctor View) ═══ -->
        <div id="tab-inventory" class="tab-content active">
          <div class="panel">
==== AFTER
        <!-- ═══ TAB: INVENTORY (Main Doctor View) ═══ -->
        <div id="tab-inventory" class="tab-content active">
          
          <!-- Category Switcher Tabs -->
          <div class="category-switcher fade-in">
            <button class="category-btn active" data-category="Pharmacy" onclick="selectCategory('Pharmacy')">🏥 الصيدليات</button>
            <button class="category-btn" data-category="Warehouse" onclick="selectCategory('Warehouse')">📦 المستودع المركزي</button>
            <button class="category-btn" data-category="Exporter" data-category-value="Exporter" onclick="selectCategory('Exporter')">🚢 المصدرون</button>
            <button class="category-btn" data-category="all" onclick="selectCategory('all')">🔍 الكل</button>
          </div>
          
          <!-- Pharmacy-Specific Dashboard Area (Placeholder) -->
          <div id="pharmacy-dashboard-panel" class="panel fade-in" style="display: none; margin-bottom: 1.5rem;">
            <div class="panel__header">
              <div class="panel__title">🏥 لوحة تحكم الصيدليات البيطرية</div>
            </div>
            <div class="panel__body" style="padding: 1.5rem;">
              <div class="pharmacy-stats-grid">
                <div class="pharmacy-widget">
                  <div class="widget-title">إجمالي الصيدليات النشطة</div>
                  <div class="widget-value" id="pharmacy-active-branches">—</div>
                </div>
                <div class="pharmacy-widget">
                  <div class="widget-title">إجمالي أدوية الصيدليات</div>
                  <div class="widget-value" id="pharmacy-total-stock">—</div>
                </div>
                <div class="pharmacy-widget">
                  <div class="widget-title">أدوية منخفضة في الصيدليات</div>
                  <div class="widget-value" id="pharmacy-low-stock-count">—</div>
                </div>
              </div>
            </div>
          </div>

          <div class="panel">
>>>>
```

### Proposed JavaScript Changes (`public/app.js`)
1. **Initialize State (Lines 8-15)**:
   Add `activeCategory: 'Pharmacy'` to the `state` object.
2. **Implement Selection Handlers**:
   Add the following functions to control the category switching logic, update the UI buttons, filter tables, and toggle the dashboard view:
   ```javascript
   function selectCategory(category) {
     state.activeCategory = category;
     
     // Update switcher buttons active class
     document.querySelectorAll('.category-switcher .category-btn').forEach(btn => {
       const isSelected = btn.getAttribute('data-category') === category;
       btn.classList.toggle('active', isSelected);
     });
     
     // Re-render inventory & lists
     renderInventoryTable();
     renderDashboardContext();
     loadAlerts(); // Re-trigger to filter and update counters
     loadLowStock(); // Re-trigger to filter and update counters
   }

   function renderDashboardContext() {
     const panel = $('pharmacy-dashboard-panel');
     if (!panel) return;
     
     if (state.activeCategory === 'Pharmacy') {
       panel.style.display = 'block';
       updatePharmacyDashboardMetrics();
     } else {
       panel.style.display = 'none';
     }
   }

   function updatePharmacyDashboardMetrics() {
     const pharmacyLocations = state.locations.filter(l => l.type === 'Pharmacy');
     $('pharmacy-active-branches').textContent = pharmacyLocations.length;
     
     const pharmacyInventory = state.inventory.filter(item => item.location_type === 'Pharmacy');
     const totalQty = pharmacyInventory.reduce((sum, item) => sum + item.quantity, 0);
     $('pharmacy-total-stock').textContent = totalQty;
     
     const pharmacyLowStock = pharmacyInventory.filter(item => item.quantity <= item.reorder_point);
     $('pharmacy-low-stock-count').textContent = pharmacyLowStock.length;
   }
   ```
3. **Filter Logic in Rendering Functions**:
   Add category filter logic to `renderInventoryTable()`, `loadAlerts()`, and `loadLowStock()`:
   - *In `renderInventoryTable()`*:
     ```javascript
     let inv = [...state.inventory];
     if (state.activeCategory && state.activeCategory !== 'all') {
       inv = inv.filter(item => item.location_type === state.activeCategory);
     }
     ```
   - *In `loadAlerts()`*:
     ```javascript
     let filtered = alerts;
     if (state.activeCategory && state.activeCategory !== 'all') {
       filtered = alerts.filter(a => {
         const loc = state.locations.find(l => l.name === a.location_name);
         return loc && loc.type === state.activeCategory;
       });
     }
     $('statNearExpiry').textContent = filtered.length;
     ```
   - *In `loadLowStock()`*:
     ```javascript
     let filtered = items;
     if (state.activeCategory && state.activeCategory !== 'all') {
       filtered = items.filter(i => i.location_type === state.activeCategory);
     }
     $('statLowStock').textContent = filtered.length;
     ```
4. **Initialize Dashboard on Load**:
   Call `renderDashboardContext()` inside `loadAll()` after references and tables load.

### Proposed CSS Changes (`public/styles.css`)
Append these classes at the bottom of the stylesheet to style the switcher, dashboard widgets, and provide mobile responsiveness:
```css
/* Category Switcher Tabs */
.category-switcher {
  display: inline-flex;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 0.35rem;
  margin-bottom: 1.5rem;
  gap: 0.5rem;
  box-shadow: var(--shadow-sm);
}

.category-btn {
  background: transparent;
  border: none;
  padding: 0.5rem 1.25rem;
  border-radius: var(--radius);
  font-family: var(--font-sans);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: var(--transition);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.category-btn:hover {
  background: var(--bg-body);
  color: var(--text-primary);
}

.category-btn.active {
  background: var(--primary-light);
  color: var(--primary);
  font-weight: 700;
}

/* Pharmacy Dashboard Placeholder Grid */
.pharmacy-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1.25rem;
  margin-top: 0.5rem;
}

.pharmacy-widget {
  background: var(--bg-body);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: transform var(--transition), box-shadow var(--transition);
}

.pharmacy-widget:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.pharmacy-widget .widget-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-secondary);
}

.pharmacy-widget .widget-value {
  font-size: 2rem;
  font-weight: 800;
  color: var(--primary);
}

/* Responsive Overrides */
@media (max-width: 768px) {
  .category-switcher {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    width: 100%;
  }

  .category-btn {
    justify-content: center;
    padding: 0.75rem 0.5rem;
  }
}
```

---

## 5. Verification Method
1. **Source Inspection**: Confirm that layout divs, scripts, and media query tags correctly compile when implemented.
2. **Local Server Run**: Propose to run `npm start` (or standard server run commands) and check the browser console for no JavaScript errors.
3. **Data Integrity Test**: Verify that the total number of elements displayed inside the filtered view equals the exact number of matching `location_type` elements fetched in standard `/api/inventory` payload.
