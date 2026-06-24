# Handoff Report — Explorer 3 (Milestone 3)

This report outlines the proposed strategy for implementing a visual **Category Switcher** (Pharmacies / Warehouse / Exporters) in the Vet Monitor client dashboard.

---

## 1. Observation

Direct observations from the codebase files:

### A. Location Types
In `public/index.html` (lines 231-238), locations can have one of three types:
```html
<select name="type" required>
  <option value="Pharmacy">صيدلية</option>
  <option value="Warehouse">مستودع مركزي</option>
  <option value="Exporter">مُصدّر خارجي</option>
</select>
```

### B. Current UI Layout
In `public/index.html` (lines 43-62), the main dashboard layout comprises:
- `<main class="main-content">`
- `<header class="topbar">`
- `<div class="content-wrapper">` containing `<div id="tab-inventory" class="tab-content active">`

### C. State Management
In `public/app.js` (lines 8-15), the application state is stored globally:
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

### D. Inventory Loading & Rendering
In `public/app.js` (lines 236-239 & 288-296), inventory is loaded and rendered by:
- `loadInventoryTable()` which calls `api('/inventory')`.
- `renderInventoryTable()` which iterates through `state.inventory` and displays the items, showing the location type badge using `locationBadge(item.location_type)`.

---

## 2. Logic Chain

1. **State Tracking**: To select a specific category and apply it globally, we need to extend the global `state` object with `activeCategory` (defaulting to `'all'`).
2. **Visual Insertion**: The Category Switcher represents a sub-navigation filter. Inserting it at the top of `.content-wrapper` (above the tab contents) or centered inside the `.topbar` provides clear visual alignment. Placing it at the top of the `.content-wrapper` prevents cluttering the global headers and keeps context changes visual and local to the active view.
3. **Data Filtering**:
   - The `/api/inventory` endpoint returns `location_type` as a column (`l.type as location_type`). Therefore, the inventory list can be filtered on the frontend with:
     ```javascript
     if (state.activeCategory !== 'all') {
       inv = inv.filter(item => item.location_type === state.activeCategory);
     }
     ```
   - The `/api/stock/low` endpoint returns rows from the `vw_low_stock` view, which also selects `location_type`. Thus, low-stock lists can be filtered directly.
   - For `/api/alerts`, the database query doesn't select `location_type`. A frontend-only mapping lookup against `state.locations` (matching `location_name`) solves this without database migrations.
4. **Pharmacy Dashboard**: Selecting the "Pharmacies" context should trigger the display of a dedicated overview panel. A conditionally hidden layout (`#pharmacy-dashboard`) inside `public/index.html` can be toggled using JavaScript and populated using aggregate computations from `state.inventory` and `state.locations`.
5. **Responsive Styling**: The current layout defines `.dashboard-layout` as a 260px sidebar next to a grid main area. Media queries are required to stack these elements vertically on smaller viewport sizes (width < 768px).

---

## 3. Caveats

- **Backend Query Limits**: The `/api/alerts` endpoint does not return the location type. Although the lookup can be handled on the frontend using `state.locations`, modifying `getPendingAlerts()` in `workers/expiry-alert.js` to return `l.type AS location_type` is recommended if backend modifications are allowed.
- **Data Completeness**: Filtering is dependent on the data returned from the server. If an item lacks a valid location type in the DB, it will be hidden when filtering by specific categories.

---

## 4. Conclusion & Recommendations

The visual Category Switcher should be implemented using the following changes:

### A. Insert Switcher in `public/index.html`
Place the Category Switcher HTML at the top of `.content-wrapper` (around line 60):

```html
<!-- CATEGORY SWITCHER -->
<div class="category-switcher fade-in">
  <button class="category-btn active" data-category="all" onclick="setCategory('all')">الكل</button>
  <button class="category-btn" data-category="Pharmacy" onclick="setCategory('Pharmacy')">🏥 الصيدليات</button>
  <button class="category-btn" data-category="Warehouse" onclick="setCategory('Warehouse')">📦 المستودعات</button>
  <button class="category-btn" data-category="Exporter" onclick="setCategory('Exporter')">✈️ المصدّرون</button>
</div>
```

### B. Track Category State in `public/app.js`
1. Initialize the category state:
   ```javascript
   let state = {
     locations: [],
     products: [],
     batches: [],
     inventory: [],
     sortCol: 'product_name',
     sortAsc: true,
     activeCategory: 'all' // Added for tracking active category
   };
   ```

2. Add a `setCategory` toggle function:
   ```javascript
   function setCategory(category) {
     state.activeCategory = category;
     
     // Update UI buttons styling
     document.querySelectorAll('.category-btn').forEach(btn => {
       btn.classList.toggle('active', btn.getAttribute('data-category') === category);
     });
     
     // Trigger UI rendering
     renderInventoryTable();
     renderPharmacyDashboard();
     
     // Refresh other dashboards
     loadAlerts();
     loadLowStock();
     loadMovements();
   }
   ```

### C. Filter Inventory and Other Lists
1. **Inventory**: Modify `renderInventoryTable()` to filter by category:
   ```javascript
   function renderInventoryTable() {
     let inv = [...state.inventory];
     
     if (state.activeCategory && state.activeCategory !== 'all') {
       inv = inv.filter(item => item.location_type === state.activeCategory);
     }
     // Sort and render as usual...
   ```

2. **Low Stock**: Filter `loadLowStock()`:
   ```javascript
   async function loadLowStock() {
     let items = await api('/stock/low');
     if (state.activeCategory && state.activeCategory !== 'all') {
       items = items.filter(i => i.location_type === state.activeCategory);
     }
     $('statLowStock').textContent = items.length;
     // render items...
   ```

3. **Alerts**: Filter `loadAlerts()` using frontend-lookup:
   ```javascript
   async function loadAlerts() {
     let alerts = await api('/alerts');
     if (state.activeCategory && state.activeCategory !== 'all') {
       alerts = alerts.filter(a => {
         const loc = state.locations.find(l => l.name === a.location_name);
         return loc && loc.type === state.activeCategory;
       });
     }
     $('statNearExpiry').textContent = alerts.length;
     // render alerts...
   ```

4. **Movements**: Filter `loadMovements()` using frontend-lookup:
   ```javascript
   async function loadMovements() {
     let moves = await api('/movements?limit=10');
     if (state.activeCategory && state.activeCategory !== 'all') {
       moves = moves.filter(m => {
         const fromLoc = state.locations.find(l => l.location_id === m.from_location);
         const toLoc = state.locations.find(l => l.location_id === m.to_location);
         return (fromLoc && fromLoc.type === state.activeCategory) || 
                (toLoc && toLoc.type === state.activeCategory);
       });
     }
     // render movements...
   ```

### D. Prepare Pharmacy Dashboard Placeholder
1. Add the container in `public/index.html` above `#tab-inventory`:
   ```html
   <!-- PHARMACY DASHBOARD OVERVIEW -->
   <div id="pharmacy-dashboard" class="pharmacy-dashboard-container fade-in" style="display: none; margin-bottom: 2rem;">
     <div class="section-header" style="margin-top: 0;">
       <div class="section-header__title">🏥 لوحة تحكم الصيدليات البيطرية</div>
     </div>
     
     <section class="stats">
       <div class="stat-card">
         <div class="stat-card__icon stat-card__icon--blue">🏥</div>
         <div>
           <div class="stat-card__value" id="pharmacy-count">0</div>
           <div class="stat-card__label">الصيدليات النشطة</div>
         </div>
       </div>
       <div class="stat-card">
         <div class="stat-card__icon stat-card__icon--green">📦</div>
         <div>
           <div class="stat-card__value" id="pharmacy-stock-qty">0</div>
           <div class="stat-card__label">إجمالي المخزون</div>
         </div>
       </div>
       <div class="stat-card">
         <div class="stat-card__icon stat-card__icon--red">⚠️</div>
         <div>
           <div class="stat-card__value" id="pharmacy-low-stock">0</div>
           <div class="stat-card__label">أدوية حرجة</div>
         </div>
       </div>
     </section>

     <div class="panels" style="grid-template-columns: 2fr 1fr;">
       <div class="panel">
         <div class="panel__header"><div class="panel__title">💊 صرف الوصفات الطبية (محاكاة)</div></div>
         <div class="panel__body" style="padding: 1.5rem;">
           <p style="color: var(--text-secondary); margin-bottom: 1rem;">سجل الوصفات الطبية المنصرفة حديثاً للحيوانات والحالات البيطرية.</p>
           <div class="empty-state">لا يوجد حركات صرف حالية.</div>
         </div>
       </div>
       <div class="panel">
         <div class="panel__header"><div class="panel__title">📍 قائمة الفروع</div></div>
         <div class="panel__body" id="pharmacies-list-panel">
           <div class="empty-state">جاري التحميل...</div>
         </div>
       </div>
     </div>
   </div>
   ```

2. Add rendering logic inside `public/app.js`:
   ```javascript
   function renderPharmacyDashboard() {
     const dash = $('pharmacy-dashboard');
     if (!dash) return;

     if (state.activeCategory === 'Pharmacy') {
       dash.style.display = 'block';
       
       const pharmacies = state.locations.filter(l => l.type === 'Pharmacy');
       $('pharmacy-count').textContent = pharmacies.length;
       
       const pharmacyStock = state.inventory.filter(i => i.location_type === 'Pharmacy');
       const totalQty = pharmacyStock.reduce((sum, item) => sum + item.quantity, 0);
       $('pharmacy-stock-qty').textContent = totalQty;
       
       const lowStockCount = pharmacyStock.filter(item => item.quantity <= item.reorder_point).length;
       $('pharmacy-low-stock').textContent = lowStockCount;

       const listPanel = $('pharmacies-list-panel');
       if (listPanel) {
         if (pharmacies.length === 0) {
           listPanel.innerHTML = '<div class="empty-state">لا توجد صيدليات نشطة.</div>';
         } else {
           listPanel.innerHTML = pharmacies.map(p => `
             <div class="row-item">
               <div class="row-item__left">
                 <div class="row-item__name">🏥 ${p.name}</div>
                 <div class="row-item__meta">المعرف: ${p.location_id}</div>
               </div>
             </div>
           `).join('');
         }
       }
     } else {
       dash.style.display = 'none';
     }
   }
   ```

### E. Style Classes and Mobile Responsiveness
Add these rules to `public/styles.css`:

```css
/* ── Category Switcher ── */
.category-switcher {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  background: var(--bg-card);
  padding: 0.5rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  overflow-x: auto;
  white-space: nowrap;
}

.category-btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-secondary);
  font-family: var(--font-sans);
  font-size: 0.95rem;
  font-weight: 600;
  padding: 0.5rem 1.25rem;
  border-radius: var(--radius-md);
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
  border-color: var(--primary);
  box-shadow: var(--shadow-sm);
}

/* ── Mobile Layout Adjustments ── */
@media (max-width: 768px) {
  .dashboard-layout {
    grid-template-columns: 1fr;
  }
  
  .sidebar {
    border-left: none;
    border-bottom: 1px solid var(--border-color);
  }
  
  .sidebar__header {
    padding: 1rem;
    justify-content: center;
  }
  
  .sidebar__nav {
    flex-direction: row;
    justify-content: space-around;
    padding: 0.5rem 0;
    overflow-x: auto;
  }
  
  .tab-btn {
    padding: 0.5rem 1rem;
    border-right: none;
    border-bottom: 3px solid transparent;
    text-align: center;
    font-size: 0.9rem;
    flex-shrink: 0;
  }
  
  .tab-btn.active {
    border-right: none;
    border-bottom: 3px solid var(--primary);
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
  
  .content-wrapper {
    padding: 1rem;
  }
  
  .panels {
    grid-template-columns: 1fr;
  }
  
  .panel__body form {
    padding: 1rem;
  }
  
  #transferForm {
    grid-template-columns: 1fr !important;
  }
  
  .tab-content .panels {
    grid-template-columns: 1fr !important;
  }
}
```

---

## 5. Verification Method

To independently verify the recommendations:
1. Apply the layout changes in `public/index.html`, `public/app.js`, and `public/styles.css`.
2. Start the local server by running `npm start` (or verify using standard node command for this project).
3. Open the browser and toggle the Category Switcher buttons.
4. **Verification Conditions**:
   - Selection of "🏥 الصيدليات" should:
     - Render the `#pharmacy-dashboard` stats correctly based on matching locations and stock levels.
     - Filter the current inventory table to show only items belonging to a "Pharmacy" type location.
     - Filter the low stock, alerts, and recent movements lists to only include pharmacy items.
   - Selection of "الكل" should restore the default, unfiltered dashboard view.
   - Adjust screen width below `768px` to ensure the grid stacks vertically, and the sidebar transforms into a horizontal touch-friendly scrolling nav.
