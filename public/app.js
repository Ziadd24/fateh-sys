/**
 * Vet Monitor — Frontend Logic (Doctor-Centric UX)
 */
const API_BASE = '/api';

const $ = (id) => document.getElementById(id);

let state = {
  locations: [],
  products: [],
  batches: [],
  inventory: [],
  sortCol: 'product_name',
  sortAsc: true,
  category: 'Pharmacy'
};

function showToast(message, type = 'success') {
  const container = $('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = type === 'error' ? `❌ ${message}` : `✅ ${message}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function openModal(id) {
  $(id).classList.add('active');
  populateDropdowns();
}

function closeModal(id) {
  $(id).classList.remove('active');
  const form = $(id).querySelector('form');
  if (form) form.reset();
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  event.currentTarget.classList.add('active');
  $(`tab-${tabId}`).classList.add('active');
}

function switchCategory(category) {
  state.category = category;
  
  // Toggle active class on switcher buttons
  document.querySelectorAll('.category-btn').forEach(btn => {
    if (btn.getAttribute('data-category') === category) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Update dashboards visibility
  const pDbEl = $('pharmacy-dashboard');
  const wDbEl = $('warehouse-dashboard');
  
  if (pDbEl) pDbEl.style.display = (category === 'Pharmacy') ? 'block' : 'none';
  if (wDbEl) wDbEl.style.display = (category === 'Warehouse') ? 'block' : 'none';
  
  // Re-render inventory table to filter items matching the location type
  renderInventoryTable();
}

async function api(path, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطأ في الاتصال بالخادم');
    return data;
  } catch (err) {
    showToast(err.message, 'error');
    throw err;
  }
}

async function loadReferenceData() {
  const [locs, prods, bats] = await Promise.all([
    api('/locations'),
    api('/products'),
    api('/batches')
  ]);
  state.locations = locs;
  state.products = prods;
  state.batches = bats;
  
  $('statLocations').textContent = locs.length;
  renderDefinedProducts();
  renderDefinedBatches();
}

function renderDefinedProducts() {
  const list = $('definedProductsList');
  if (!list) return;

  if (state.products.length === 0) {
    list.innerHTML = '<div class="empty-state">لا يوجد أدوية معرفة.</div>';
    return;
  }

  list.innerHTML = state.products.map(p => `
    <div class="row-item" style="padding: 0.75rem 1rem;">
      <div class="row-item__left">
        <div class="row-item__name">${p.name} <span class="badge badge--purple">${p.sku}</span></div>
        <div class="row-item__meta">الفئة: ${p.category}</div>
      </div>
      <div class="row-item__right">
        <button class="btn-refresh" style="color: var(--danger); border-color: var(--danger);" onclick="deleteProduct(${p.product_id})">حذف</button>
      </div>
    </div>
  `).join('');
}

function renderDefinedBatches() {
  const list = $('definedBatchesList');
  if (!list) return;

  if (state.batches.length === 0) {
    list.innerHTML = '<div class="empty-state">لا يوجد تشغيلات معرفة.</div>';
    return;
  }

  list.innerHTML = state.batches.map(b => `
    <div class="row-item" style="padding: 0.75rem 1rem;">
      <div class="row-item__left">
        <div class="row-item__name"><span class="badge badge--purple">${b.batch_no}</span></div>
        <div class="row-item__meta">${b.product_name} • ينتهي: ${b.expiry_date}</div>
      </div>
      <div class="row-item__right">
        <button class="btn-refresh" style="color: var(--danger); border-color: var(--danger);" onclick="deleteBatch('${b.batch_no}')">حذف</button>
      </div>
    </div>
  `).join('');
}

function populateDropdowns() {
  const locSelects = document.querySelectorAll('.select-location');
  const prodSelects = document.querySelectorAll('.select-product');
  const batSelects = document.querySelectorAll('.select-batch, .select-batch-required');

  const locOptions = `<option value="">اختر الفرع / الموقع</option>` + state.locations.map(l => `<option value="${l.location_id}">${l.name}</option>`).join('');
  const prodOptions = `<option value="">اختر الدواء</option>` + state.products.map(p => `<option value="${p.product_id}">${p.name} (${p.sku})</option>`).join('');
  
  locSelects.forEach(s => s.innerHTML = locOptions);
  prodSelects.forEach(s => s.innerHTML = prodOptions);

  // Clear batch selects initially until a product is chosen
  batSelects.forEach(s => {
    s.innerHTML = s.classList.contains('select-batch-required') 
      ? `<option value="">-- اختر التشغيلة --</option>`
      : `<option value="">-- تلقائي (FIFO) --</option>`;
  });

  // Attach dynamic filter to product selects
  document.querySelectorAll('form').forEach(form => {
    const pSelect = form.querySelector('.select-product');
    const bSelect = form.querySelector('.select-batch, .select-batch-required');
    if (pSelect && bSelect) {
      // Remove old listeners to avoid duplicates on re-render
      pSelect.replaceWith(pSelect.cloneNode(true));
      const newPSelect = form.querySelector('.select-product');
      newPSelect.addEventListener('change', (e) => {
        const pId = parseInt(e.target.value, 10);
        const batches = state.batches.filter(b => b.product_id === pId);
        const defaultOption = bSelect.classList.contains('select-batch-required') 
          ? `<option value="">-- اختر التشغيلة --</option>`
          : `<option value="">-- تلقائي (FIFO) --</option>`;
        bSelect.innerHTML = defaultOption + batches.map(b => `<option value="${b.batch_no}">${b.batch_no} (ينتهي ${b.expiry_date})</option>`).join('');
      });
    }
  });

  const suppliers = state.locations.filter(l => l.type === 'Supplier');
  const warehouses = state.locations.filter(l => l.type === 'Warehouse');
  const pharmacies = state.locations.filter(l => l.type === 'Pharmacy');

  const supOptions = `<option value="">اختر الشركة الموردة</option>` + suppliers.map(l => `<option value="${l.location_id}">${l.name}</option>`).join('');
  const whOptions = `<option value="">اختر المستودع</option>` + warehouses.map(l => `<option value="${l.location_id}">${l.name}</option>`).join('');
  const phOptions = `<option value="">اختر الصيدلية</option>` + pharmacies.map(l => `<option value="${l.location_id}">${l.name}</option>`).join('');

  document.querySelectorAll('.select-supplier').forEach(s => s.innerHTML = supOptions);
  document.querySelectorAll('.select-warehouse').forEach(s => s.innerHTML = whOptions);
  document.querySelectorAll('.select-pharmacy').forEach(s => s.innerHTML = phOptions);
}

// ─── Form Handlers ──────────────────────────────────────────────────



async function handleDeduct(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const data = Object.fromEntries(formData);
  data.pharmacy_id = data.location_id;
  
  if (!data.specific_batch_no) {
    delete data.specific_batch_no; // Let backend use FIFO
  }
  
  await api('/stock/pharmacy-sale', { method: 'POST', body: JSON.stringify(data) });
  showToast('تم صرف الدواء بنجاح');
  closeModal('deductModal');
  loadAll();
}

async function handleAdjust(e) {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  await api('/stock/adjust', { method: 'POST', body: JSON.stringify(data) });
  showToast('تم إتلاف / تسوية المخزون بنجاح');
  closeModal('adjustModal');
  loadAll();
}

async function handleReceiveCompany(e) {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  await api('/stock/company-to-warehouse', { method: 'POST', body: JSON.stringify(data) });
  showToast('تم تسجيل استلام البضاعة من الشركة بنجاح');
  closeModal('receiveCompanyModal');
  loadAll();
}

async function handleDispatch(e) {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  await api('/stock/warehouse-to-pharmacy', { method: 'POST', body: JSON.stringify(data) });
  showToast('تم تسجيل صرف البضاعة للصيدلية بنجاح');
  closeModal('dispatchModal');
  loadAll();
}


async function adminAddLocation(e) {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  await api('/locations', { method: 'POST', body: JSON.stringify(data) });
  showToast('تم تعريف الفرع بنجاح');
  form.reset();
  loadAll();
}

async function adminAddProduct(e) {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  await api('/products', { method: 'POST', body: JSON.stringify(data) });
  showToast('تم تعريف الدواء بنجاح');
  form.reset();
  loadAll();
}


async function deleteProduct(id) {
  if (!confirm('هل أنت متأكد من حذف هذا الدواء؟')) return;
  try {
    await api(`/products/${id}`, { method: 'DELETE' });
    showToast('تم الحذف بنجاح');
    loadAll();
  } catch (err) {
    // handled by wrapper
  }
}

async function deleteBatch(batchNo) {
  if (!confirm('هل أنت متأكد من حذف هذه التشغيلة؟')) return;
  try {
    await api(`/batches/${batchNo}`, { method: 'DELETE' });
    showToast('تم الحذف بنجاح');
    loadAll();
  } catch (err) {
    // handled by wrapper
  }
}

async function triggerScan() {
  const res = await api('/alerts/scan', { method: 'POST' });
  showToast(`اكتمل الفحص: ${res.alertsCreated} تنبيهات جديدة.`);
  loadAll();
}

async function ackAlert(id) {
  await api(`/alerts/${id}/acknowledge`, { method: 'PATCH' });
  showToast('تم تأكيد التنبيه');
  loadAll();
}

// ─── Render Logic ──────────────────────────────────────────────────

function locationBadge(type) {
  const color = { 'Pharmacy': 'blue', 'Warehouse': 'teal', 'Supplier': 'amber' }[type] || 'purple';
  const label = { 'Pharmacy': 'صيدلية', 'Warehouse': 'مستودع', 'Supplier': 'مورد' }[type] || type;
  return `<span class="badge badge--${color}">${label}</span>`;
}

async function loadInventoryTable() {
  state.inventory = await api('/inventory');
  renderInventoryTable();
}

function sortInventory(col) {
  if (state.sortCol === col) {
    state.sortAsc = !state.sortAsc;
  } else {
    state.sortCol = col;
    state.sortAsc = true;
  }
  renderInventoryTable();
}

function renderInventoryTable() {
  const filtered = state.inventory.filter(item => !state.category || item.location_type === state.category);
  const inv = [...filtered];
  
  // Sorting logic
  inv.sort((a, b) => {
    let valA = a[state.sortCol];
    let valB = b[state.sortCol];
    
    // Numeric sort for quantity
    if (state.sortCol === 'quantity') {
      return state.sortAsc ? valA - valB : valB - valA;
    }
    
    // String sort for others
    valA = String(valA || '').toLowerCase();
    valB = String(valB || '').toLowerCase();
    if (valA < valB) return state.sortAsc ? -1 : 1;
    if (valA > valB) return state.sortAsc ? 1 : -1;
    return 0;
  });

  // Update headers UI
  document.querySelectorAll('.sort-icon').forEach(icon => icon.textContent = '');
  const activeIcon = document.getElementById(`sort-icon-${state.sortCol}`);
  if (activeIcon) activeIcon.textContent = state.sortAsc ? '▲' : '▼';

  if (inv.length === 0) {
    $('inventoryTableBody').innerHTML = `<tr><td colspan="6" class="empty-state">المخزون فارغ حالياً.</td></tr>`;
    return;
  }

  $('inventoryTableBody').innerHTML = inv.map(item => {
    const daysToExpiry = Math.ceil((new Date(item.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
    const isNearExpiry = daysToExpiry <= 120; // 4 months
    const isLow = item.quantity <= item.reorder_point;

    return `
      <tr>
        <td style="font-weight:700;">${item.product_name} <br><span style="font-size:0.8rem;color:var(--text-muted)">${item.sku}</span></td>
        <td>${item.category}</td>
        <td>${item.location_name} <br>${locationBadge(item.location_type)}</td>
        <td><span class="badge badge--purple">${item.batch_no}</span></td>
        <td style="color: ${isNearExpiry ? 'var(--danger)' : 'inherit'}; font-weight: ${isNearExpiry ? '700' : 'normal'}">${item.expiry_date}</td>
        <td><span class="badge badge--${isLow ? 'red' : 'green'}" style="font-size:1rem; padding: 0.2rem 0.6rem;">${item.quantity}</span></td>
      </tr>
    `;
  }).join('');
}

async function loadAlerts() {
  const alerts = await api('/alerts');
  $('statNearExpiry').textContent = alerts.length;

  if (alerts.length === 0) {
    $('nearExpiryList').innerHTML = `<div class="empty-state"><div class="empty-state__icon">✅</div>لا يوجد أدوية قريبة من الانتهاء</div>`;
    return;
  }

  $('nearExpiryList').innerHTML = alerts.map(a => `
    <div class="row-item">
      <div class="row-item__left">
        <div class="row-item__name">${a.product_name} <span class="badge badge--purple">${a.batch_no}</span></div>
        <div class="row-item__meta">
          📍 ${a.location_name} • ينتهي: <b style="color:var(--danger)">${a.expiry_date}</b> (${a.days_until_expiry} أيام)
        </div>
      </div>
      <div class="row-item__right">
        <button class="btn-refresh" onclick="ackAlert(${a.alert_id})">تأكيد الإتلاف/السحب</button>
      </div>
    </div>
  `).join('');
}

async function loadLowStock() {
  const items = await api('/stock/low');
  $('statLowStock').textContent = items.length;

  if (items.length === 0) {
    $('lowStockList').innerHTML = `<div class="empty-state"><div class="empty-state__icon">✅</div>الكميات المتوفرة كافية</div>`;
    return;
  }

  $('lowStockList').innerHTML = items.map(i => `
    <div class="row-item">
      <div class="row-item__left">
        <div class="row-item__name">${i.product_name}</div>
        <div class="row-item__meta">📍 ${i.location_name} • التشغيلة: ${i.batch_no}</div>
      </div>
      <div class="row-item__right" style="text-align: left;">
        <span class="badge badge--red">${i.quantity} متوفر / ${i.reorder_point} الحد</span>
      </div>
    </div>
  `).join('');
}

async function loadMovements() {
  const moves = await api('/movements?limit=10');
  if (moves.length === 0) {
    $('movementsList').innerHTML = '<div class="empty-state">لا توجد حركات أخيرة</div>';
    return;
  }

  $('movementsList').innerHTML = moves.map(m => {
    let desc = '';
    let movBadge = '';
    let movColor = '';
    
    if (m.movement === 'IN') { 
      desc = `إضافة إلى ${m.to_name}`; 
      movBadge = '➕ إضافة'; 
      movColor = 'success';
    } else if (m.movement === 'OUT') { 
      desc = `صرف من ${m.from_name}`; 
      movBadge = '➖ صرف'; 
      movColor = 'danger';
    } else if (m.movement === 'TRANSFER') { 
      desc = `نقل من ${m.from_name} ➔ ${m.to_name}`; 
      movBadge = '🔄 نقل'; 
      movColor = 'blue';
    }

    return `
      <div class="row-item">
        <div class="row-item__left">
          <div class="row-item__name">${m.product_name} <span class="badge badge--${movColor}">${movBadge}</span></div>
          <div class="row-item__meta">${desc} • الكمية: <b>${m.quantity}</b></div>
        </div>
        <div class="row-item__right" style="color: var(--text-muted); font-size: 0.8rem; text-align: left;">
          ${new Date(m.created_at).toLocaleString('ar-SA')}
        </div>
      </div>
    `;
  }).join('');
}

async function loadPharmacyDashboard() {
  try {
    const data = await api('/reports/pharmacy-dashboard');
    const lowEl = $('pharmacyLowStockCount');
    const expEl = $('pharmacyExpiryCount');
    const salesEl = $('pharmacySalesTotal');
    
    if (lowEl) lowEl.textContent = data.insufficientProductsCount;
    if (expEl) expEl.textContent = data.nearExpiryBatchesCount;
    if (salesEl) salesEl.textContent = data.totalMonthlySales + ' وحدة';
  } catch (err) {
    console.error('Failed to load pharmacy dashboard stats', err);
  }
}

async function loadWarehouseDashboard() {
  try {
    const data = await api('/reports/warehouse-dashboard');
    const lowEl = $('warehouseLowStockCount');
    const expEl = $('warehouseExpiryCount');
    
    if (lowEl) lowEl.textContent = data.insufficientProductsCount;
    if (expEl) expEl.textContent = data.nearExpiryBatchesCount;
    
    const inList = $('warehouseIncomingList');
    if (inList) {
      if (data.incomingDeliveries.length === 0) {
        inList.innerHTML = '<div class="empty-state">لا يوجد استلامات أخيرة</div>';
      } else {
        inList.innerHTML = data.incomingDeliveries.map(m => `
          <div class="row-item">
            <div class="row-item__left">
              <div class="row-item__name">${m.product_name} <span class="badge badge--success">📥 استلام</span></div>
              <div class="row-item__meta">من: ${m.from_supplier} • الكمية: <b>${m.quantity}</b></div>
            </div>
            <div class="row-item__right" style="color: var(--text-muted); font-size: 0.8rem; text-align: left;">
              ${new Date(m.created_at).toLocaleString('ar-SA')}
            </div>
          </div>
        `).join('');
      }
    }

    const outList = $('warehouseOutgoingList');
    if (outList) {
      if (data.outgoingShipments.length === 0) {
        outList.innerHTML = '<div class="empty-state">لا يوجد توزيع أخير</div>';
      } else {
        outList.innerHTML = data.outgoingShipments.map(m => `
          <div class="row-item">
            <div class="row-item__left">
              <div class="row-item__name">${m.product_name} <span class="badge badge--blue">📤 توزيع</span></div>
              <div class="row-item__meta">إلى: ${m.to_pharmacy} • الكمية: <b>${m.quantity}</b></div>
            </div>
            <div class="row-item__right" style="color: var(--text-muted); font-size: 0.8rem; text-align: left;">
              ${new Date(m.created_at).toLocaleString('ar-SA')}
            </div>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load warehouse dashboard stats', err);
  }
}

async function loadAll() {
  $('statusText').textContent = 'جاري التحديث...';
  try {
    await loadReferenceData();
    populateDropdowns();
    
    await Promise.all([
      loadInventoryTable(),
      loadAlerts(),
      loadLowStock(),
      loadMovements(),
      loadPharmacyDashboard(),
      loadWarehouseDashboard()
    ]);
    
    // Trigger filter and toggle dashboard state based on current category
    switchCategory(state.category);

    $('statusText').textContent = 'متصل';
    $('statusText').style.color = 'var(--success)';
  } catch (err) {
    switchCategory(state.category);
    $('statusText').textContent = 'غير متصل';
    $('statusText').style.color = 'var(--danger)';
  }
}

// Init
window.addEventListener('DOMContentLoaded', loadAll);
setInterval(loadAll, 60000); // Poll every minute
