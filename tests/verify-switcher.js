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
  const categories = ['Pharmacy', 'Warehouse', 'Exporter'];
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
test("JS: switchCategory() is implemented, updates state.category, updates active classes, updates dashboard display, and filters inventory", () => {
  const domElements = {};
  
  const mockElement = (id, attrs = {}) => {
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
      addEventListener: () => {},
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
  const exporterBtn = mockElement('btn-exporter', { className: 'category-btn', 'data-category': 'Exporter' });
  const buttons = [pharmacyBtn, warehouseBtn, exporterBtn];
  
  const getElementById = (id) => {
    if (!domElements[id]) {
      if (id === 'pharmacy-dashboard') {
        domElements[id] = mockElement(id, { className: 'pharmacy-only' });
      } else {
        domElements[id] = mockElement(id);
      }
    }
    return domElements[id];
  };
  
  const querySelectorAll = (selector) => {
    if (selector === '.category-btn') return buttons;
    if (selector === '.sort-icon') return [];
    return [];
  };
  
  const context = {
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
    { product_name: 'Med C', location_type: 'Exporter', category: 'Antibiotic', quantity: 30, reorder_point: 5, sku: 'SKU-C', location_name: 'Loc C', batch_no: 'B3', expiry_date: '2026-12-31' }
  ];
  
  // --- Test Switch to Warehouse ---
  context.switchCategory('Warehouse');
  assert.strictEqual(context.state.category, 'Warehouse', "state.category should update to 'Warehouse'");
  assert.ok(!pharmacyBtn.classList.contains('active'), "Pharmacy button should not be active");
  assert.ok(warehouseBtn.classList.contains('active'), "Warehouse button should be active");
  assert.ok(!exporterBtn.classList.contains('active'), "Exporter button should not be active");
  
  const dashboard = getElementById('pharmacy-dashboard');
  assert.strictEqual(dashboard.style.display, 'none', "pharmacy-dashboard should be hidden (display: none) when category is Warehouse");
  
  const tbody = getElementById('inventoryTableBody');
  assert.ok(tbody.innerHTML.includes('Med B'), "Inventory table should contain Med B");
  assert.ok(!tbody.innerHTML.includes('Med A'), "Inventory table should NOT contain Med A");
  assert.ok(!tbody.innerHTML.includes('Med C'), "Inventory table should NOT contain Med C");
  
  // --- Test Switch to Exporter ---
  context.switchCategory('Exporter');
  assert.strictEqual(context.state.category, 'Exporter', "state.category should update to 'Exporter'");
  assert.ok(!pharmacyBtn.classList.contains('active'), "Pharmacy button should not be active");
  assert.ok(!warehouseBtn.classList.contains('active'), "Warehouse button should not be active");
  assert.ok(exporterBtn.classList.contains('active'), "Exporter button should be active");
  assert.strictEqual(dashboard.style.display, 'none', "pharmacy-dashboard should be hidden (display: none) when category is Exporter");
  
  assert.ok(tbody.innerHTML.includes('Med C'), "Inventory table should contain Med C");
  assert.ok(!tbody.innerHTML.includes('Med A'), "Inventory table should NOT contain Med A");
  assert.ok(!tbody.innerHTML.includes('Med B'), "Inventory table should NOT contain Med B");
  
  // --- Test Switch to Pharmacy ---
  context.switchCategory('Pharmacy');
  assert.strictEqual(context.state.category, 'Pharmacy', "state.category should update to 'Pharmacy'");
  assert.ok(pharmacyBtn.classList.contains('active'), "Pharmacy button should be active");
  assert.ok(!warehouseBtn.classList.contains('active'), "Warehouse button should not be active");
  assert.ok(!exporterBtn.classList.contains('active'), "Exporter button should not be active");
  assert.strictEqual(dashboard.style.display, 'block', "pharmacy-dashboard should be visible (display: block) when category is Pharmacy");
  
  assert.ok(tbody.innerHTML.includes('Med A'), "Inventory table should contain Med A");
  assert.ok(!tbody.innerHTML.includes('Med B'), "Inventory table should NOT contain Med B");
  assert.ok(!tbody.innerHTML.includes('Med C'), "Inventory table should NOT contain Med C");
});

if (passed) {
  console.log("\n=== ALL TESTS PASSED ===");
  process.exit(0);
} else {
  console.log("\n=== SOME TESTS FAILED ===");
  process.exit(1);
}
