const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

console.log("=== CATEGORY SWITCHER VALIDATION SCRIPT ===");

let passed = true;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
    passed = false;
  }
}

// 1. READ AND ASSERT public/index.html
const htmlPath = path.resolve(__dirname, '../public/index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

test("HTML: category-switcher buttons exist with correct attributes", () => {
  // Only count top-level switcher buttons that have a data-category attribute
  const buttonsMatches = [...html.matchAll(/<button[^>]*data-category="[^"]+"[^>]*class="[^"]*category-btn[^"]*"[^>]*>|<button[^>]*class="[^"]*category-btn[^"]*"[^>]*data-category="[^"]+"[^>]*>/gi)];
  assert.strictEqual(buttonsMatches.length, 3, "There should be exactly 3 category switcher buttons");
  
  // Verify data-category and onclick attributes
  const categories = ['Pharmacy', 'Warehouse', 'Supplier'];
  categories.forEach(cat => {
    const regex = new RegExp(`<button[^>]*data-category="${cat}"[^>]*onclick="switchCategory\\('${cat}'\\)"`, 'i');
    assert.ok(regex.test(html), `Button for category ${cat} should have correct attributes`);
  });
  
  // Verify initial active class is on Pharmacy
  const activeRegex = /<button[^>]*class="[^"]*category-btn[^"]*active[^"]*"[^>]*data-category="Pharmacy"/i;
  assert.ok(activeRegex.test(html), "Pharmacy button should initially have the active class");
});

test("HTML: pharmacy-dashboard placeholder container exists", () => {
  const dashboardRegex = /<div[^>]*id="pharmacy-dashboard"[^>]*class="[^"]*pharmacy-only[^"]*"/i;
  assert.ok(dashboardRegex.test(html), "pharmacy-dashboard container should exist with pharmacy-only class");
});

// 2. READ AND ASSERT public/app.js state.category initialization
const appJsPath = path.resolve(__dirname, '../public/app.js');
const appJs = fs.readFileSync(appJsPath, 'utf8');

test("JS: state.category is initialized to 'Pharmacy'", () => {
  const stateRegex = /category:\s*['"]Pharmacy['"]/i;
  assert.ok(stateRegex.test(appJs), "state.category should be initialized to 'Pharmacy'");
});

// 3. JS BEHAVIOR TESTS IN VM
let domElements = {};
let mockElement, getElementById, querySelectorAll, context;

test("JS: switchCategory() is implemented, updates state.category, updates active classes, updates dashboard display, and filters inventory", () => {
  domElements = {};
  
  mockElement = (id, attrs = {}) => {
    let classes = new Set((attrs.className || '').split(' ').filter(Boolean));
    const el = {
      id,
      className: attrs.className || '',
      classList: {
        add: (c) => { classes.add(c); el.className = Array.from(classes).join(' '); },
        remove: (c) => { classes.delete(c); el.className = Array.from(classes).join(' '); },
        contains: (c) => classes.has(c)
      },
      style: { display: 'block' },
      attributes: attrs,
      getAttribute: (name) => el.attributes[name] !== undefined ? el.attributes[name] : null,
      setAttribute: (name, val) => { el.attributes[name] = val; },
      removeAttribute: (name) => { delete el.attributes[name]; },
      addEventListener: () => {},
      focus: () => {},
      textContent: '',
      innerHTML: '',
      appendChild: () => {},
      remove: () => {},
      querySelector: (sel) => {
        const childId = `${id}_${sel}`;
        if (!domElements[childId]) domElements[childId] = mockElement(childId);
        return domElements[childId];
      },
      querySelectorAll: () => []
    };
    return el;
  };
  
  const pharmacyBtn = mockElement('btn-pharmacy', { className: 'category-btn active', 'data-category': 'Pharmacy' });
  const warehouseBtn = mockElement('btn-warehouse', { className: 'category-btn', 'data-category': 'Warehouse' });
  const supplierBtn = mockElement('btn-exporter', { className: 'category-btn', 'data-category': 'Supplier' });
  const buttons = [pharmacyBtn, warehouseBtn, supplierBtn];
  
  getElementById = (id) => {
    if (!domElements[id]) {
      if (id === 'pharmacy-dashboard') {
        domElements[id] = mockElement(id, { className: 'pharmacy-only' });
      } else {
        domElements[id] = mockElement(id);
      }
    }
    return domElements[id];
  };
  
  querySelectorAll = (selector) => {
    if (selector === '.category-btn') return buttons;
    if (selector === '.sort-icon') return [];
    return [];
  };
  
  context = {
    document: {
      getElementById,
      querySelectorAll,
      createElement: (tag) => mockElement(`created_${tag}`),
    },
    window: {
      addEventListener: () => {},
    },
    console: {
      log: () => {},
      error: () => {},
    },
    localStorage: {
      _store: {},
      getItem: function(k) { return this._store[k] !== undefined ? this._store[k] : null; },
      setItem: function(k, v) { this._store[k] = v; },
      removeItem: function(k) { delete this._store[k]; },
    },
    setInterval: () => {},
    fetch: async () => ({ ok: true, json: async () => ({}) }),
  };
  
  vm.createContext(context);
  vm.runInContext(appJs, context);
  
  assert.ok(context.state, "Global state object should be defined in app.js");
  assert.strictEqual(context.state.category, 'Pharmacy', "state.category should initially be 'Pharmacy'");
  assert.strictEqual(typeof context.switchCategory, 'function', "switchCategory should be a function");
  
  // Setup mock inventory inside state
  context.state.inventory = [
    { product_name: 'Med A', location_type: 'Pharmacy', category: 'Antiseptic', quantity: 10, reorder_point: 5, sku: 'SKU-A', location_name: 'Loc A', batch_no: 'B1', expiry_date: '2026-12-31' },
    { product_name: 'Med B', location_type: 'Warehouse', category: 'Vaccine', quantity: 20, reorder_point: 5, sku: 'SKU-B', location_name: 'Loc B', batch_no: 'B2', expiry_date: '2026-12-31' },
    { product_name: 'Med C', location_type: 'Supplier', category: 'Antibiotic', quantity: 30, reorder_point: 5, sku: 'SKU-C', location_name: 'Loc C', batch_no: 'B3', expiry_date: '2026-12-31' }
  ];
  
  // --- Test Switch to Warehouse ---
  context.switchCategory('Warehouse');
  assert.strictEqual(context.state.category, 'Warehouse', "state.category should update to 'Warehouse'");
  assert.ok(!pharmacyBtn.classList.contains('active'), "Pharmacy button should not be active");
  assert.ok(warehouseBtn.classList.contains('active'), "Warehouse button should be active");
  assert.ok(!supplierBtn.classList.contains('active'), "Supplier button should not be active");
  
  const dashboard = getElementById('pharmacy-dashboard');
  assert.strictEqual(dashboard.style.display, 'none', "pharmacy-dashboard should be hidden (display: none) when category is Warehouse");
  
  const tbody = getElementById('inventoryTableBody');
  assert.ok(tbody.innerHTML.includes('Med B'), "Inventory table should contain Med B");
  assert.ok(!tbody.innerHTML.includes('Med A'), "Inventory table should NOT contain Med A");
  assert.ok(!tbody.innerHTML.includes('Med C'), "Inventory table should NOT contain Med C");
  
  // --- Test Switch to Supplier ---
  context.switchCategory('Supplier');
  assert.strictEqual(context.state.category, 'Supplier', "state.category should update to 'Supplier'");
  assert.ok(!pharmacyBtn.classList.contains('active'), "Pharmacy button should not be active");
  assert.ok(!warehouseBtn.classList.contains('active'), "Warehouse button should not be active");
  assert.ok(supplierBtn.classList.contains('active'), "Supplier button should be active");
  assert.strictEqual(dashboard.style.display, 'none', "pharmacy-dashboard should be hidden (display: none) when category is Supplier");
  
  const supplierTbody = getElementById('inventorySupplierTableBody');
  assert.ok(supplierTbody.innerHTML.includes('Med C'), "Supplier table should contain Med C");
  
  // --- Test Switch to Pharmacy ---
  context.switchCategory('Pharmacy');
  assert.strictEqual(context.state.category, 'Pharmacy', "state.category should update to 'Pharmacy'");
  assert.ok(pharmacyBtn.classList.contains('active'), "Pharmacy button should be active");
  assert.ok(!warehouseBtn.classList.contains('active'), "Warehouse button should not be active");
  assert.ok(!supplierBtn.classList.contains('active'), "Supplier button should not be active");
  assert.strictEqual(dashboard.style.display, 'block', "pharmacy-dashboard should be visible (display: block) when category is Pharmacy");
  
  assert.ok(tbody.innerHTML.includes('Med A'), "Inventory table should contain Med A");
  assert.ok(!tbody.innerHTML.includes('Med B'), "Inventory table should NOT contain Med B");
  assert.ok(!tbody.innerHTML.includes('Med C'), "Inventory table should NOT contain Med C");
});

test("JS: populateDropdowns attaches stock indicator and updates on change", () => {
  // Reset state and mock DOM
  context.state.inventory = [
    { product_name: 'Med A', product_id: 1, location_id: 10, batch_no: 'B1', quantity: 5, expiry_date: '2026-12-31' },
    { product_name: 'Med A', product_id: 1, location_id: 10, batch_no: 'B2', quantity: 15, expiry_date: '2027-12-31' }
  ];
  context.state.products = [
    { product_id: 1, name: 'Med A', sku: 'SKU-A' }
  ];
  context.state.locations = [
    { location_id: 10, name: 'Pharmacy A', type: 'Pharmacy' }
  ];

  // Mock form elements
  const mockLocSelect = mockElement('select-pharmacy-source');
  mockLocSelect.className = 'select-pharmacy-source';
  mockLocSelect.value = '10';

  const mockProdSelect = mockElement('select-product');
  mockProdSelect.className = 'select-product';
  mockProdSelect.value = '1';

  const mockBatchSelect = mockElement('select-batch');
  mockBatchSelect.className = 'select-batch';
  mockBatchSelect.value = '';

  const mockIndicator = mockElement('stock-indicator');
  mockIndicator.className = 'stock-indicator';
  mockIndicator.style = { display: 'none' };

  const mockAmount = mockElement('stock-amount');
  mockAmount.className = 'stock-amount';
  mockAmount.textContent = '0';

  const mockQtyInput = mockElement('qty-input', { name: 'quantity' });

  const listeners = {};
  const mockForm = {
    querySelector: (sel) => {
      if (sel === '.select-product') return mockProdSelect;
      if (sel === '.select-batch, .select-batch-required') return mockBatchSelect;
      if (sel === '.select-location, .select-pharmacy-source, .select-internal') return mockLocSelect;
      if (sel === '.stock-indicator') return mockIndicator;
      if (sel === '.stock-amount') return mockAmount;
      if (sel === 'input[name="quantity"]') return mockQtyInput;
      return null;
    }
  };

  // Add replaceWith and cloneNode support to mocked selects
  const makeCloneable = (el) => {
    el.replaceWith = (newEl) => {};
    el.cloneNode = () => {
      return el;
    };
    el.addEventListener = (event, cb) => {
      listeners[el.className + '_' + event] = cb;
    };
  };
  makeCloneable(mockLocSelect);
  makeCloneable(mockProdSelect);
  makeCloneable(mockBatchSelect);

  // Mock querySelectorAll for 'form'
  const originalQSA = context.document.querySelectorAll;
  context.document.querySelectorAll = (selector) => {
    if (selector === 'form') return [mockForm];
    if (selector === '.select-batch, .select-batch-required') return [mockBatchSelect];
    return [];
  };

  // Call populateDropdowns
  context.populateDropdowns();

  // Trigger location selection change
  if (listeners['select-pharmacy-source_change']) {
    listeners['select-pharmacy-source_change']();
  }

  // Stock should be 20 (sum of both batches B1 and B2) since batch selection is empty (FIFO)
  assert.strictEqual(Number(mockAmount.textContent), 20);
  assert.strictEqual(mockIndicator.style.display, 'inline');
  assert.strictEqual(Number(mockQtyInput.getAttribute('max')), 20);

  // Trigger batch selection change to B1
  mockBatchSelect.value = 'B1';
  if (listeners['select-batch_change']) {
    listeners['select-batch_change']();
  }

  // Stock should now be 5 for batch B1 specifically
  assert.strictEqual(Number(mockAmount.textContent), 5);
  assert.strictEqual(Number(mockQtyInput.getAttribute('max')), 5);

  // Restore querySelectorAll
  context.document.querySelectorAll = originalQSA;
});

test("JS: Pharmacy inventory filtering on pharmacy selection and medicine selection", () => {
  // Mock elements
  const filterPh = getElementById('filterPharmacySelect');
  const filterMed = getElementById('filterMedicineSelect');
  const tbody = getElementById('inventoryTableBody');

  // Populate state with sample inventory
  context.state.inventory = [
    { product_id: 101, product_name: 'Filter Med A', location_type: 'Pharmacy', location_id: 11, category: 'Antibiotic', quantity: 10, reorder_point: 5, sku: 'SKU-A', location_name: 'Pharmacy Alpha', batch_no: 'B1', expiry_date: '2026-12-31' },
    { product_id: 102, product_name: 'Filter Med B', location_type: 'Pharmacy', location_id: 22, category: 'Antiseptic', quantity: 20, reorder_point: 5, sku: 'SKU-B', location_name: 'Pharmacy Beta', batch_no: 'B2', expiry_date: '2026-12-31' },
    { product_id: 103, product_name: 'Filter Med C', location_type: 'Warehouse', location_id: 33, category: 'Vaccine', quantity: 30, reorder_point: 5, sku: 'SKU-C', location_name: 'Central Warehouse', batch_no: 'B3', expiry_date: '2026-12-31' }
  ];
  
  context.state.category = 'Pharmacy';

  // 1. Initial render (no filter selected) -> should display all pharmacy inventory items
  context.renderInventoryTable();
  assert.ok(tbody.innerHTML.includes('Filter Med A'), "Initial render should contain Filter Med A");
  assert.ok(tbody.innerHTML.includes('Filter Med B'), "Initial render should contain Filter Med B");
  assert.ok(!tbody.innerHTML.includes('Filter Med C'), "Initial render should NOT contain Filter Med C (Warehouse category)");

  // 2. Filter by Pharmacy Alpha (location_id: 11)
  filterPh.value = '11';
  filterMed.value = '';
  context.renderInventoryTable();
  assert.ok(tbody.innerHTML.includes('Filter Med A'), "Filter by Pharmacy Alpha should display Filter Med A");
  assert.ok(!tbody.innerHTML.includes('Filter Med B'), "Filter by Pharmacy Alpha should NOT display Filter Med B");

  // 3. Filter by Filter Med B (product_id: 102)
  filterPh.value = '';
  filterMed.value = '102';
  context.renderInventoryTable();
  assert.ok(!tbody.innerHTML.includes('Filter Med A'), "Filter by Med B should NOT display Filter Med A");
  assert.ok(tbody.innerHTML.includes('Filter Med B'), "Filter by Med B should display Filter Med B");

  // 4. Filter by both Pharmacy Beta and Med B (matching)
  filterPh.value = '22';
  filterMed.value = '102';
  context.renderInventoryTable();
  assert.ok(tbody.innerHTML.includes('Filter Med B'), "Filter by both Beta and Med B should display Filter Med B");

  // 5. Filter by Pharmacy Alpha and Med B (mismatch) -> should display empty list
  filterPh.value = '11';
  filterMed.value = '102';
  context.renderInventoryTable();
  assert.ok(!tbody.innerHTML.includes('Filter Med A'));
  assert.ok(!tbody.innerHTML.includes('Filter Med B'));

  // 6. Switch category to Warehouse and check that filters are reset
  filterPh.value = '11';
  filterMed.value = '102';
  context.switchCategory('Warehouse');
  assert.strictEqual(filterPh.value, '', "Pharmacy filter select should reset when switching category");
  assert.strictEqual(filterMed.value, '', "Medicine filter select should reset when switching category");
});

test("HTML: product category dropdown select element and custom input element exist", () => {
  assert.ok(html.includes('id="productCategorySelect"'), "productCategorySelect element should exist in index.html");
  assert.ok(html.includes('id="newCategoryGroup"'), "newCategoryGroup container should exist in index.html");
  assert.ok(html.includes('id="newCategoryInput"'), "newCategoryInput element should exist in index.html");
});

test("JS: handleCategoryChange() toggles custom category input group display and required status", () => {
  const newCatGroup = getElementById('newCategoryGroup');
  const newCatInput = getElementById('newCategoryInput');
  
  // Initially hidden/not required
  newCatGroup.style.display = 'none';
  newCatInput.required = false;

  // Trigger select value = '__NEW__'
  context.handleCategoryChange({ value: '__NEW__' });
  assert.strictEqual(newCatGroup.style.display, 'block', "Should show newCategoryGroup when value is '__NEW__'");
  assert.strictEqual(newCatInput.required, true, "newCategoryInput should be required when value is '__NEW__'");

  // Trigger select value = 'مضاد حيوي'
  context.handleCategoryChange({ value: 'مضاد حيوي' });
  assert.strictEqual(newCatGroup.style.display, 'none', "Should hide newCategoryGroup when value is not '__NEW__'");
  assert.strictEqual(newCatInput.required, false, "newCategoryInput should not be required when value is not '__NEW__'");
});

test("JS: populateDropdowns() populates category options with defaults and add new option, excluding other db categories", () => {
  const categorySelect = getElementById('productCategorySelect');
  
  // Set products state to include a custom database category
  context.state.products = [
    { name: 'Custom Med', sku: 'CUST-01', category: 'فئة مخصصة' }
  ];
  
  context.populateDropdowns();
  
  const selectHtml = categorySelect.innerHTML;
  assert.ok(selectHtml.includes('مضاد حيوي'), "Should contain default category 'مضاد حيوي'");
  assert.ok(!selectHtml.includes('فئة مخصصة'), "Should NOT contain existing db category 'فئة مخصصة'");
  assert.ok(selectHtml.includes('__NEW__'), "Should contain add new category option '__NEW__'");
});



if (passed) {
  console.log("\n=== ALL TESTS PASSED ===");
  process.exit(0);
} else {
  console.log("\n=== SOME TESTS FAILED ===");
  process.exit(1);
}
