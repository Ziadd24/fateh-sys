/**
 * Vet Monitor — E2E Test Suite
 * Runner: Node.js built-in node:test
 * Executed via: node --test tests/e2e.test.js
 */

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('path');
const net = require('net');
const vm = require('vm');

const TEST_DB_PATH = path.resolve(__dirname, '../data/vet-monitor-test.db');
process.env.TEST_DB_PATH = TEST_DB_PATH;
process.env.NODE_ENV = 'test';

const db = require('../db/connection');

let serverProcess;
let serverPort;
let serverUrl;

// Helper: Find a free TCP port dynamically
function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

// Helper: Clear all tables in a transaction (foreign key safe order)
function clearDatabase() {
  db.transaction(() => {
    db.exec('DELETE FROM stock_movement');
    db.exec('DELETE FROM expiry_alert');
    db.exec('DELETE FROM stock_level');
    db.exec('DELETE FROM batch');
    db.exec('DELETE FROM location');
    db.exec('DELETE FROM product');
  })();
}

// Seeding helpers
function seedProduct(sku, name, category) {
  const result = db.prepare(`
    INSERT INTO product (sku, name, category) VALUES (?, ?, ?)
  `).run(sku, name, category);
  return result.lastInsertRowid;
}

function seedBatch(batchNo, productId, expiryDate) {
  db.prepare(`
    INSERT INTO batch (batch_no, product_id, expiry_date) VALUES (?, ?, ?)
  `).run(batchNo, productId, expiryDate);
}

function seedLocation(name, type) {
  const result = db.prepare(`
    INSERT INTO location (name, type) VALUES (?, ?)
  `).run(name, type);
  return result.lastInsertRowid;
}

function seedStock(locationId, batchNo, quantity, reorderPoint = 0) {
  db.prepare(`
    INSERT INTO stock_level (location_id, batch_no, quantity, reorder_point)
    VALUES (?, ?, ?, ?)
  `).run(locationId, batchNo, quantity, reorderPoint);
}

// Frontend Script Sandboxing
function runFrontendScript(mockGlobals = {}) {
  const appJsPath = path.resolve(__dirname, '../public/app.js');
  const code = fs.readFileSync(appJsPath, 'utf8');

  const domElements = {};
  const htmlElements = new Set([
    'tab-inventory', 'tab-alerts', 'tab-admin', 'toast-container', 'pharmacy-dashboard',
    'statLocations', 'definedProductsList', 'definedBatchesList', 'inventoryTableBody',
    'statsGrid', 'statLowStock', 'statNearExpiry', 'btnScan', 'nearExpiryList',
    'lowStockList', 'movementsList', 'transferForm', 'addProductForm', 'addBatchForm',
    'addLocationForm', 'receiveModal', 'receiveForm', 'deductModal', 'deductForm', 'statusText',
    'tab-pharmacies', 'tab-warehouse', 'tab-exporters', 'tab-btn-pharmacies', 'tab-btn-warehouse', 'tab-btn-exporters'
  ]);

  const mockElement = (id, className = '', attrs = {}) => {
    let classes = new Set(className.split(' ').filter(Boolean));
    const attributes = { ...attrs };
    const element = {
      id,
      className,
      classList: {
        add: (c) => {
          classes.add(c);
          element.className = Array.from(classes).join(' ');
        },
        remove: (c) => {
          classes.delete(c);
          element.className = Array.from(classes).join(' ');
        },
        contains: (c) => classes.has(c),
      },
      style: {
        display: 'block'
      },
      textContent: '',
      innerHTML: '',
      getAttribute: (name) => attributes[name] !== undefined ? attributes[name] : null,
      setAttribute: (name, val) => { attributes[name] = val; },
      reset: () => {
        classes = new Set(className.split(' ').filter(Boolean));
        element.className = className;
        element.textContent = '';
        element.innerHTML = '';
        element.style = { display: 'block' };
      },
      querySelector: (sel) => {
        const childId = `${id}_${sel}`;
        if (!domElements[childId]) domElements[childId] = mockElement(childId);
        return domElements[childId];
      },
      querySelectorAll: () => [],
      appendChild: () => {},
      remove: () => {},
    };
    return element;
  };

  const getElementById = (id) => {
    if (!htmlElements.has(id)) return null;
    if (!domElements[id]) domElements[id] = mockElement(id);
    return domElements[id];
  };

  const querySelectorAll = (selector) => {
    if (selector === '.tab-btn') {
      return [
        getElementById('tab-btn-inventory') || mockElement('dummy-tab-btn-inventory'),
        getElementById('tab-btn-alerts') || mockElement('dummy-tab-btn-alerts'),
        getElementById('tab-btn-admin') || mockElement('dummy-tab-btn-admin'),
        getElementById('tab-btn-pharmacies') || mockElement('dummy-tab-btn-pharmacies'),
        getElementById('tab-btn-warehouse') || mockElement('dummy-tab-btn-warehouse'),
        getElementById('tab-btn-exporters') || mockElement('dummy-tab-btn-exporters')
      ];
    }
    if (selector === '.tab-content') {
      return [
        getElementById('tab-inventory'),
        getElementById('tab-alerts'),
        getElementById('tab-admin'),
        getElementById('tab-pharmacies'),
        getElementById('tab-warehouse'),
        getElementById('tab-exporters')
      ].filter(Boolean);
    }
    if (selector === '.category-btn') {
      return [
        getElementById('cat-btn-pharmacy') || mockElement('dummy-cat-btn-pharmacy'),
        getElementById('cat-btn-warehouse') || mockElement('dummy-cat-btn-warehouse'),
        getElementById('cat-btn-exporter') || mockElement('dummy-cat-btn-exporter')
      ];
    }
    if (selector.startsWith('.select-')) {
      return [getElementById('select-location') || mockElement('dummy-select-location')];
    }
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
    ...mockGlobals,
  };

  vm.createContext(context);
  vm.runInContext(code, context);
  return { context, domElements };
}

// Global Hooks
before(async () => {
  const dataDir = path.dirname(TEST_DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Delete test database if exists to ensure fresh start
  if (fs.existsSync(TEST_DB_PATH)) {
    try {
      fs.unlinkSync(TEST_DB_PATH);
    } catch (e) {}
  }

  // Run migrations
  const { execSync } = require('child_process');
  execSync('node db/migrate.js', { env: { ...process.env } });

  serverPort = await getFreePort();
  serverUrl = `http://localhost:${serverPort}`;

  serverProcess = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(serverPort) }
  });

  // Wait for server health response
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${serverUrl}/api/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 100));
  }

  if (!ready) {
    throw new Error('Express test server failed to start');
  }
});

after(async () => {
  if (serverProcess) {
    serverProcess.kill('SIGINT');
  }
  // Try to remove test DB file after tests are done
  setTimeout(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      try {
        fs.unlinkSync(TEST_DB_PATH);
      } catch (e) {}
    }
  }, 1000);
});

beforeEach(async () => {
  clearDatabase();
});

// ─── TIER 1 TESTS ─────────────────────────────────────────────────────

// F1-T1: Check tab elements for Pharmacies context in HTML
test('F1-T1: Check tab elements for Pharmacies context in HTML', async () => {
  const res = await fetch(`${serverUrl}/`);
  const html = await res.text();
  assert.match(html, /switchTab\(['"]pharmacies['"]\)/, "HTML should contain a tab button switching to 'pharmacies' context");
});

// F1-T2: Check tab elements for Warehouse context in HTML
test('F1-T2: Check tab elements for Warehouse context in HTML', async () => {
  const res = await fetch(`${serverUrl}/`);
  const html = await res.text();
  assert.match(html, /switchTab\(['"]warehouse['"]\)/, "HTML should contain a tab button switching to 'warehouse' context");
});

// F1-T3: Check tab elements for Exporters context in HTML
test('F1-T3: Check tab elements for Exporters context in HTML', async () => {
  const res = await fetch(`${serverUrl}/`);
  const html = await res.text();
  assert.match(html, /switchTab\(['"]exporters['"]\)/, "HTML should contain a tab button switching to 'exporters' context");
});

// F1-T4: Check category select handlers in app.js
test('F1-T4: Check category select handlers in app.js', () => {
  const appJsPath = path.resolve(__dirname, '../public/app.js');
  const code = fs.readFileSync(appJsPath, 'utf8');
  assert.ok(code.includes('function switchTab') || code.includes('switchTab('), "app.js should contain a switchTab handler");
});

// F1-T5: Verify tab switching CSS classes changes context state
test('F1-T5: Verify tab switching CSS classes changes context state', () => {
  const currentTarget = {
    classList: {
      add: (c) => addedClasses.add(c),
      remove: (c) => addedClasses.delete(c)
    }
  };
  const addedClasses = new Set();
  const { context, domElements } = runFrontendScript({
    event: { currentTarget }
  });

  context.switchTab('warehouse');
  const warehouseTab = domElements['tab-warehouse'];
  assert.ok(warehouseTab && warehouseTab.classList.contains('active'), "Warehouse tab should have 'active' class");
});

// F2-T6: Verify API returns correct keys for low stock items
test('F2-T6: Verify API returns correct keys for low stock items', async () => {
  const pId = seedProduct('VET-LOW', 'Amoxicillin', 'Pharmacy');
  seedBatch('B-LOW', pId, '2026-12-31');
  const locId = seedLocation('Pharmacy North', 'Pharmacy');
  seedStock(locId, 'B-LOW', 2, 5);

  const res = await fetch(`${serverUrl}/api/reports/pharmacy-dashboard`);
  assert.strictEqual(res.status, 200, "Dashboard API should return status 200");
  const data = await res.json();
  assert.ok(data.hasOwnProperty('insufficientProducts'), "Response should have key 'insufficientProducts'");
  assert.ok(data.hasOwnProperty('insufficientProductsCount'), "Response should have key 'insufficientProductsCount'");
});

// F2-T7: Verify API returns correct keys for near-expiry items
test('F2-T7: Verify API returns correct keys for near-expiry items', async () => {
  const pId = seedProduct('VET-EXP', 'Amoxicillin', 'Pharmacy');
  const twoMonthsLater = new Date();
  twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2);
  const dateStr = twoMonthsLater.toISOString().split('T')[0];
  seedBatch('B-EXP', pId, dateStr);
  const locId = seedLocation('Pharmacy North', 'Pharmacy');
  seedStock(locId, 'B-EXP', 10, 0);

  const res = await fetch(`${serverUrl}/api/reports/pharmacy-dashboard`);
  assert.strictEqual(res.status, 200, "Dashboard API should return status 200");
  const data = await res.json();
  assert.ok(data.hasOwnProperty('nearExpiryBatches'), "Response should have key 'nearExpiryBatches'");
  assert.ok(data.hasOwnProperty('nearExpiryBatchesCount'), "Response should have key 'nearExpiryBatchesCount'");
});

// F2-T8: Verify API returns correct keys for monthly sales
test('F2-T8: Verify API returns correct keys for monthly sales', async () => {
  const res = await fetch(`${serverUrl}/api/reports/pharmacy-dashboard`);
  assert.strictEqual(res.status, 200, "Dashboard API should return status 200");
  const data = await res.json();
  assert.ok(data.hasOwnProperty('totalMonthlySales'), "Response should have key 'totalMonthlySales'");
});

// F2-T9: Verify frontend renders low stock list
test('F2-T9: Verify frontend renders low stock list', async () => {
  const mockLowStockData = [
    { product_name: 'Product Low A', location_name: 'Pharmacy North', batch_no: 'B-LOW-A', quantity: 2, reorder_point: 5 }
  ];
  
  const { context, domElements } = runFrontendScript({
    fetch: async (url) => {
      if (url.endsWith('/api/stock/low')) {
        return { ok: true, json: async () => mockLowStockData };
      }
      return { ok: true, json: async () => [] };
    }
  });

  await context.loadLowStock();
  const lowStockListHtml = domElements['lowStockList'].innerHTML;
  assert.ok(lowStockListHtml.includes('Product Low A'), "HTML should contain product name");
  assert.ok(lowStockListHtml.includes('Pharmacy North'), "HTML should contain location name");
  assert.ok(lowStockListHtml.includes('2 متوفر / 5 الحد'), "HTML should contain quantity details");
});

// F2-T10: Verify frontend renders near-expiry list
test('F2-T10: Verify frontend renders near-expiry list', async () => {
  const mockAlertsData = [
    { alert_id: 42, product_name: 'Product Exp A', batch_no: 'B-EXP-A', location_name: 'Pharmacy South', expiry_date: '2026-08-15', days_until_expiry: 45 }
  ];

  const { context, domElements } = runFrontendScript({
    fetch: async (url) => {
      if (url.endsWith('/api/alerts')) {
        return { ok: true, json: async () => mockAlertsData };
      }
      return { ok: true, json: async () => [] };
    }
  });

  await context.loadAlerts();
  const nearExpiryListHtml = domElements['nearExpiryList'].innerHTML;
  assert.ok(nearExpiryListHtml.includes('Product Exp A'), "HTML should contain product name");
  assert.ok(nearExpiryListHtml.includes('Pharmacy South'), "HTML should contain location name");
  assert.ok(nearExpiryListHtml.includes('45 أيام'), "HTML should contain days until expiry");
});

// F3-T11: Verify GET /api/health returns status ok
test('F3-T11: Verify GET /api/health returns status ok', async () => {
  const res = await fetch(`${serverUrl}/api/health`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.status, 'ok');
  assert.ok(data.hasOwnProperty('timestamp'));
});

// F3-T12: Verify existing API endpoints like GET /api/products work unchanged
test('F3-T12: Verify existing API endpoints like GET /api/products work unchanged', async () => {
  seedProduct('SKU-1', 'Product One', 'Category A');
  seedProduct('SKU-2', 'Product Two', 'Category B');

  const res = await fetch(`${serverUrl}/api/products`);
  assert.strictEqual(res.status, 200);
  const products = await res.json();
  
  const skus = products.map(p => p.sku);
  assert.ok(skus.includes('SKU-1'), "Should contain product one SKU");
  assert.ok(skus.includes('SKU-2'), "Should contain product two SKU");
});

// F3-T13: Verify database migrations run and seed works
test('F3-T13: Verify database migrations run and seed works', () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  assert.ok(tables.includes('product'), "Product table should exist");
  assert.ok(tables.includes('batch'), "Batch table should exist");
  assert.ok(tables.includes('location'), "Location table should exist");
  assert.ok(tables.includes('stock_level'), "Stock level table should exist");
});

// F3-T14: Verify dashboard API rejects invalid request types
test('F3-T14: Verify dashboard API rejects invalid request types', async () => {
  const res = await fetch(`${serverUrl}/api/reports/pharmacy-dashboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.strictEqual(res.status, 404, "Unimplemented endpoint POST should return 404");
});

// F3-T15: Verify standard inventory route /api/inventory is intact
test('F3-T15: Verify standard inventory route /api/inventory is intact', async () => {
  const pId = seedProduct('SKU-INV', 'Inventory Item', 'Category C');
  seedBatch('B-INV', pId, '2026-10-10');
  const locId = seedLocation('Central Warehouse', 'Warehouse');
  seedStock(locId, 'B-INV', 50, 10);

  const res = await fetch(`${serverUrl}/api/inventory`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data), "Response should be an array");
  
  const item = data.find(x => x.batch_no === 'B-INV');
  assert.ok(item, "Should find the seeded item");
  assert.strictEqual(item.product_name, 'Inventory Item');
  assert.strictEqual(item.location_name, 'Central Warehouse');
  assert.strictEqual(item.quantity, 50);
});

// F3-T16: Auto-removal of a batch when stock is fully deducted to zero
test('F3-T16: Batch is auto-removed when its total stock reaches zero', async () => {
  const pId = seedProduct('SKU-AUTO-DEL', 'Auto Delete Med', 'Category D');
  const locId = seedLocation('Pharmacy Auto', 'Pharmacy');
  // Seed a batch with stock of 5
  seedBatch('B-AUTO', pId, '2027-01-01');
  seedStock(locId, 'B-AUTO', 5, 0);

  // Deduct all 5 units via the stock API
  const res = await fetch(`${serverUrl}/api/stock/deduct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location_id: locId, product_id: pId, quantity: 5 })
  });
  assert.strictEqual(res.status, 200, 'Deduction should succeed');

  // The batch should no longer exist in the database
  const batch = db.prepare('SELECT * FROM batch WHERE batch_no = ?').get('B-AUTO');
  assert.strictEqual(batch, undefined, 'Batch should be auto-deleted after stock reaches 0');

  // The stock_level row should also be gone
  const sl = db.prepare('SELECT * FROM stock_level WHERE batch_no = ?').get('B-AUTO');
  assert.strictEqual(sl, undefined, 'stock_level row should be removed with the batch');
});

// F3-T17: Delete a finished medicine (all batches zero-stock) succeeds; active medicine is blocked
test('F3-T17: Finished medicine can be deleted; active medicine deletion is blocked', async () => {
  // Finished medicine: product with one batch that has 0 stock
  const pIdFinished = seedProduct('SKU-FINISHED', 'Finished Med', 'Category E');
  seedBatch('B-FINISHED', pIdFinished, '2025-01-01');
  const locF = seedLocation('Pharmacy Fin', 'Pharmacy');
  seedStock(locF, 'B-FINISHED', 0, 0);

  const delFinished = await fetch(`${serverUrl}/api/products/${pIdFinished}`, { method: 'DELETE' });
  assert.strictEqual(delFinished.status, 200, 'Finished medicine should be deletable');
  const body = await delFinished.json();
  assert.strictEqual(body.success, true, 'Should return success:true');

  // Confirm the product is gone by fetching it — server should return 404
  const checkGone = await fetch(`${serverUrl}/api/products/${pIdFinished}`);
  assert.strictEqual(checkGone.status, 404, 'Finished product should return 404 after deletion');

  // Active medicine: product with a batch that still has stock
  const pIdActive = seedProduct('SKU-ACTIVE', 'Active Med', 'Category E');
  seedBatch('B-ACTIVE', pIdActive, '2027-06-01');
  const locA = seedLocation('Pharmacy Act', 'Pharmacy');
  seedStock(locA, 'B-ACTIVE', 20, 5);

  const delActive = await fetch(`${serverUrl}/api/products/${pIdActive}`, { method: 'DELETE' });
  assert.strictEqual(delActive.status, 400, 'Active medicine deletion should be blocked (400)');
  const errBody = await delActive.json();
  assert.ok(errBody.error, 'Should return an error message');
});

