function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

/**
 * Vet Monitor — Frontend Logic (Doctor-Centric UX)
 */
const API_BASE = '/api';

const $ = (id) => document.getElementById(id);

var state = {
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

  if (id === 'deductModal' || id === 'crossPharmacyModal' || id === 'adjustModal') {
    const locSelect = $(id).querySelector('.select-location, .select-pharmacy-source, .select-internal');
    if (locSelect) {
      if (state.category === 'Warehouse') {
        const whs = state.locations.filter(l => l.type === 'Warehouse');
        if (whs.length > 0) {
          locSelect.value = whs[0].location_id;
          if (id === 'crossPharmacyModal' || id === 'adjustModal') {
            locSelect.dispatchEvent(new Event('change'));
            locSelect.setAttribute('disabled', 'true');
          }
        }
      } else {
        // Find the active tab in pharmacy dashboard
        const activeTab = document.querySelector('#pharmacy-dashboard .tab-btn.active');
        if (activeTab) {
          const pharmacyId = activeTab.getAttribute('onclick').match(/\d+/);
          if (pharmacyId) {
            locSelect.value = pharmacyId[0];
            if (id === 'crossPharmacyModal' || id === 'adjustModal') {
              locSelect.dispatchEvent(new Event('change'));
              locSelect.setAttribute('disabled', 'true');
            }
          }
        }
      }
    }
  }
}

function closeModal(id) {
  $(id).classList.remove('active');
  const form = $(id).querySelector('form');
  if (form) form.reset();
  
  // Clear dynamic rows
  if (id === 'receiveCompanyModal' && $('receiveCartBody')) $('receiveCartBody').innerHTML = '';
  if (id === 'dispatchPharmacyModal' && $('dispatchCartBody')) $('dispatchCartBody').innerHTML = '';

  // Unlock from_location_id if it was locked
  if (id === 'crossPharmacyModal' || id === 'adjustModal') {
    const locSelect = $(id).querySelector('select[name="location_id"], select[name="from_location_id"]');
    if (locSelect) locSelect.removeAttribute('disabled');
  }
}

function switchTab(tabId) {
  if (tabId === 'pharmacies') switchCategory('Pharmacy');
  if (tabId === 'warehouse') switchCategory('Warehouse');

  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.remove('active');
    if (b.getAttribute('onclick') && b.getAttribute('onclick').includes(`switchTab('${tabId}')`)) {
      b.classList.add('active');
    }
  });
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  
  const tabEl = $(`tab-${tabId}`);
  if (tabEl) tabEl.classList.add('active');

  localStorage.setItem('activeAppTab', tabId);
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
  const sDbEl = $('supplier-dashboard');
  
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
  renderDefinedSuppliers();
}

function renderDefinedSuppliers() {
  const list = $('adminSuppliersList');
  if (!list) return;

  const suppliers = state.locations.filter(l => l.type === 'Supplier');
  if (suppliers.length === 0) {
    list.innerHTML = '<div class="empty-state">لا يوجد موردين معرفين.</div>';
    return;
  }

  list.innerHTML = suppliers.map(s => `
    <div class="row-item">
      <div class="row-item__left">
        <div class="row-item__name">${escapeHTML(s.name)}</div>
        <div class="row-item__meta">⭐ الأهمية: ${s.importance_level} نجوم</div>
      </div>
      <div class="row-item__right" style="display: flex; gap: 0.5rem;">
        <button class="btn-refresh" style="color: var(--primary); border-color: var(--primary); padding: 0.25rem 0.5rem;" onclick="editSupplier(${s.location_id}, '${s.name.replace(/'/g, "\\'")}')">تعديل</button>
        <button class="btn-refresh" style="color: var(--danger); border-color: var(--danger); padding: 0.25rem 0.5rem;" onclick="deleteSupplier(${s.location_id})">حذف</button>
      </div>
    </div>
  `).join('');
}

async function editSupplier(id, oldName) {
  const newName = prompt('تعديل اسم المورد:', oldName);
  if (!newName || newName === oldName) return;
  
  await api(`/locations/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name: newName })
  });
  showToast('تم تعديل المورد بنجاح');
  loadAll();
}

async function deleteSupplier(id) {
  if (!confirm('هل أنت متأكد من حذف هذا المورد؟ لا يمكن التراجع عن هذا الإجراء.')) return;
  
  await api(`/locations/${id}`, { method: 'DELETE' });
  showToast('تم حذف المورد بنجاح');
  loadAll();
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
        <div class="row-item__name">${escapeHTML(p.name)} <span class="badge badge--purple">${p.sku}</span></div>
        <div class="row-item__meta">الفئة: ${escapeHTML(p.category)}</div>
      </div>
      <div class="row-item__right" style="display: flex; gap: 0.5rem;">
        <button class="btn-refresh" style="color: var(--primary); border-color: var(--primary);" onclick="editProduct(${p.product_id})">تعديل</button>
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
        <div class="row-item__name">التشغيلة: ${b.batch_no} <span style="font-size:0.8rem; color:var(--text-muted);">(${escapeHTML(b.product_name)})</span></div>
        <div class="row-item__meta" style="color: ${b.days_until_expiry <= 120 ? 'var(--danger)' : 'inherit'}">انتهاء: ${b.expiry_date} | الكمية الإجمالية: ${b.total_stock}</div>
      </div>
      <div class="row-item__right" style="display: flex; gap: 0.5rem;">
        <button class="btn-refresh" style="color: var(--primary); border-color: var(--primary);" onclick="editBatch('${b.batch_no}')">تعديل</button>
        <button class="btn-refresh" style="color: var(--danger); border-color: var(--danger);" onclick="deleteBatch('${b.batch_no}')">حذف</button>
      </div>
    </div>
  `).join('');
}

function populateDropdowns() {
  const populate = (sel, html) => document.querySelectorAll(sel).forEach(s => s.innerHTML = html);

  const locOptions = `<option value="">اختر الفرع / الموقع</option>` + state.locations.map(l => `<option value="${l.location_id}">${escapeHTML(l.name)}</option>`).join('');
  const phOptionsOnly = `<option value="">اختر الصيدلية المستقبلة</option>` + state.locations.filter(l => l.type === 'Pharmacy').map(l => `<option value="${l.location_id}">${escapeHTML(l.name)}</option>`).join('');
  const phSourceOptions = `<option value="">اختر الصيدلية</option>` + state.locations.filter(l => l.type === 'Pharmacy').map(l => `<option value="${l.location_id}">${escapeHTML(l.name)}</option>`).join('');
  const internalOptions = `<option value="">اختر الفرع / المستودع</option>` + state.locations.filter(l => l.type === 'Pharmacy' || l.type === 'Warehouse').map(l => `<option value="${l.location_id}">${escapeHTML(l.name)}</option>`).join('');
  const prodOptions = `<option value="">اختر الدواء</option>` + state.products.map(p => `<option value="${p.product_id}">${escapeHTML(p.name)} (${p.sku})</option>`).join('');
  
  populate('.select-location', locOptions);
  populate('.select-pharmacy-only', phOptionsOnly);
  populate('.select-pharmacy-source', phSourceOptions);
  populate('.select-internal', internalOptions);
  populate('.select-product', prodOptions);

  const batSelects = document.querySelectorAll('.select-batch, .select-batch-required');

  if ($('globalProductList')) $('globalProductList').innerHTML = state.products.map(p => `<option value="${escapeHTML(p.name)} (${p.sku})" data-id="${p.product_id}"></option>`).join('');
  if ($('globalSupplierList')) $('globalSupplierList').innerHTML = state.locations.filter(l => l.type === 'Supplier').map(l => `<option value="${escapeHTML(l.name)}" data-id="${l.location_id}"></option>`).join('');
  if ($('globalWarehouseList')) $('globalWarehouseList').innerHTML = state.locations.filter(l => l.type === 'Warehouse').map(l => `<option value="${escapeHTML(l.name)}" data-id="${l.location_id}"></option>`).join('');
  if ($('globalPharmacyList')) $('globalPharmacyList').innerHTML = state.locations.filter(l => l.type === 'Pharmacy').map(l => `<option value="${escapeHTML(l.name)}" data-id="${l.location_id}"></option>`).join('');

  // Auto-fill the default warehouse to save time
  const whs = state.locations.filter(l => l.type === 'Warehouse');
  if (whs.length > 0) {
    const defaultWh = whs[0].name;
    if ($('rcvWarehouse') && !$('rcvWarehouse').value) $('rcvWarehouse').value = defaultWh;
    if ($('dispWarehouse') && !$('dispWarehouse').value) $('dispWarehouse').value = defaultWh;
    if ($('retLocation') && !$('retLocation').value) $('retLocation').value = defaultWh;
  }

  // Clear batch selects initially until a product is chosen
  batSelects.forEach(s => {
    s.innerHTML = s.classList.contains('select-batch-required') 
      ? `<option value="">-- اختر التشغيلة --</option>`
      : `<option value="">-- تلقائي (FIFO) --</option>`;
  });

  // Attach dynamic filter to product selects
  document.querySelectorAll('form').forEach(form => {
    let pSelect = form.querySelector('.select-product');
    let bSelect = form.querySelector('.select-batch, .select-batch-required');
    let locSelect = form.querySelector('.select-location');

    if (pSelect && bSelect) {
      pSelect.replaceWith(pSelect.cloneNode(true));
      pSelect = form.querySelector('.select-product');

      if (locSelect) {
        locSelect.replaceWith(locSelect.cloneNode(true));
        locSelect = form.querySelector('.select-location');
      }

      const updateBatches = () => {
        bSelect = form.querySelector('.select-batch, .select-batch-required');
        const pId = parseInt(pSelect.value, 10);
        let locId = null;
        if (locSelect) locId = parseInt(locSelect.value, 10);

        let availableBatches = [];
        if (pId) {
          // If location is selected, filter by inventory that has > 0 stock in that location
          if (locId) {
            const locInv = state.inventory.filter(i => i.location_id === locId && i.product_id === pId && i.quantity > 0);
            availableBatches = locInv.map(i => ({ batch_no: i.batch_no, expiry_date: i.expiry_date }));
          } else {
            // Fallback to all batches if no location context
            availableBatches = state.batches.filter(b => b.product_id === pId);
          }
        }

        const defaultOption = bSelect.classList.contains('select-batch-required') 
          ? `<option value="">-- اختر التشغيلة --</option>`
          : `<option value="">-- تلقائي (FIFO) --</option>`;
        bSelect.innerHTML = defaultOption + availableBatches.map(b => `<option value="${b.batch_no}">${b.batch_no} (ينتهي ${b.expiry_date || ''})</option>`).join('');
      };

      pSelect.addEventListener('change', updateBatches);
      if (locSelect) {
        locSelect.addEventListener('change', updateBatches);
      }
    }
  });

  const suppliers = state.locations.filter(l => l.type === 'Supplier');
  const warehouses = state.locations.filter(l => l.type === 'Warehouse');
  const pharmacies = state.locations.filter(l => l.type === 'Pharmacy');

  const getSupplierStars = (level) => level ? '⭐'.repeat(level) : '';
  const supOptions = `<option value="">اختر الشركة الموردة</option>` + suppliers.map(l => `<option value="${l.location_id}">${escapeHTML(l.name)} ${getSupplierStars(l.importance_level)}</option>`).join('');
  const whOptions = `<option value="">اختر المستودع</option>` + warehouses.map(l => `<option value="${l.location_id}">${escapeHTML(l.name)}</option>`).join('');
  const phOptions = `<option value="">اختر الصيدلية</option>` + pharmacies.map(l => `<option value="${l.location_id}">${escapeHTML(l.name)}</option>`).join('');

  populate('.select-supplier', supOptions);
  populate('.select-warehouse', whOptions);
  populate('.select-pharmacy', phOptions);
}

// ─── Form Handlers ──────────────────────────────────────────────────



async function handleDeduct(e) {
  e.preventDefault();
  try {
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
  } catch (err) {
    // Error is handled by api() and displayed via showToast
  }
}

async function handleCrossPharmacy(e) {
  e.preventDefault();
  try {
    const form = e.target;
    // Enable select temporarily to capture value in FormData
    const locSelect = form.querySelector('select[name="from_location_id"]');
    if (locSelect) locSelect.removeAttribute('disabled');
    
    const data = Object.fromEntries(new FormData(form));
    
    // Disable it back immediately
    if (locSelect) locSelect.setAttribute('disabled', 'true');
    
    if (data.from_location_id === data.to_location_id) {
      return showToast('لا يمكن النقل لنفس الصيدلية', 'error');
    }
    
    if (!data.specific_batch_no) {
      delete data.specific_batch_no; // Let backend use FIFO if not provided
    }

    await api('/stock/transfer', { method: 'POST', body: JSON.stringify(data) });
    showToast('تم النقل بين الصيدليات بنجاح');
    closeModal('crossPharmacyModal');
    loadAll();
  } catch (err) {
    showToast(err.message || 'حدث خطأ', 'error');
    console.error(err);
  }
}

async function handleAdjust(e) {
  e.preventDefault();
  try {
    const form = e.target;
    const locSelect = form.querySelector('select[name="location_id"]');
    if (locSelect) locSelect.removeAttribute('disabled');
    
    const data = Object.fromEntries(new FormData(form));
    
    if (locSelect) locSelect.setAttribute('disabled', 'true');
    
    await api('/stock/adjust', { method: 'POST', body: JSON.stringify(data) });
    showToast('تم إتلاف / تسوية المخزون بنجاح');
    closeModal('adjustModal');
    loadAll();
  } catch (err) {
    showToast(err.message || 'حدث خطأ', 'error');
    console.error(err);
  }
}

function getDatalistId(listId, value) {
  const list = document.getElementById(listId);
  if (!list) return null;
  for (let option of list.options) {
    if (option.value === value) return option.getAttribute('data-id');
  }
  return null;
}

function addReceiveRow() {
  const tbody = $('receiveCartBody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input list="globalProductList" class="cart-product-input" required placeholder="بحث عن دواء..." autocomplete="off" style="width:100%"></td>
    <td><input type="text" class="cart-batch-input" required placeholder="مثال: B-001" style="width:100%"></td>
    <td><input type="date" class="cart-expiry-input" required style="width:100%"></td>
    <td><input type="number" class="cart-qty-input" min="1" required style="width:100%"></td>
    <td style="padding:4px"><input type="number" step="0.01" class="cart-price-input" min="0" required style="width:100%" placeholder="سعر الوحدة"></td>
    <td><input type="number" class="cart-reorder-input" min="0" value="0" required style="width:100%"></td>
    <td><button type="button" class="btn-refresh" style="color:var(--danger); border-color:var(--danger);" onclick="this.closest('tr').remove()">حذف</button></td>
  `;
  tbody.appendChild(tr);
}
async function handleReceiveCompanyBulk(e) {
  e.preventDefault();
  try {
    const warehouses = state.locations.filter(l => l.type === 'Warehouse');
    const warehouseId = warehouses.length > 0 ? warehouses[0].location_id : null;
    const supplierId = getDatalistId('globalSupplierList', $('rcvSupplier').value);
    if (!warehouseId || !supplierId) return alert('الرجاء التأكد من صحة المورد وتوفر مستودع.');

    const note = $('rcvNote') ? $('rcvNote').value : '';
    const items = [];
    document.querySelectorAll('#receiveCartBody tr').forEach(tr => {
      const pId = getDatalistId('globalProductList', tr.querySelector('.cart-product-input').value);
      if (pId) {
        items.push({
          productId: parseInt(pId, 10),
          batchNo: tr.querySelector('.cart-batch-input').value,
          expiryDate: tr.querySelector('.cart-expiry-input').value,
          qty: parseInt(tr.querySelector('.cart-qty-input').value, 10),
          price: parseFloat(tr.querySelector('.cart-price-input').value) || 0.0,
          reorderPoint: parseInt(tr.querySelector('.cart-reorder-input').value, 10)
        });
      }
    });

    if (items.length === 0) return alert('السلة فارغة أو الأصناف غير صحيحة.');

    await api('/stock/company-to-warehouse', {
      method: 'POST',
      body: JSON.stringify({ supplier_id: supplierId, warehouse_id: warehouseId, note, items })
    });
    
    showToast('تم الاستلام بنجاح');
    closeModal('receiveCompanyModal');
    loadAll();
  } catch (err) {
    showToast('حدث خطأ أثناء حفظ الفاتورة', 'error');
    console.error(err);
  }
}

function addDispatchRow() {
  const tbody = $('dispatchCartBody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input list="globalProductList" class="cart-product-input" required placeholder="بحث عن دواء..." style="width:100%" onchange="populateDispatchBatchOptions(this)"></td>
    <td>
      <select class="cart-batch-select" style="width:100%">
        <option value="">-- تلقائي (FIFO) --</option>
      </select>
    </td>
    <td><input type="number" class="cart-qty-input" min="1" required style="width:100%"></td>
    <td><button type="button" class="btn-refresh" style="color:var(--danger); border-color:var(--danger);" onclick="this.closest('tr').remove()">حذف</button></td>
  `;
  tbody.appendChild(tr);
}

function populateDispatchBatchOptions(inputElement) {
  const tr = inputElement.closest('tr');
  const batchSelect = tr.querySelector('.cart-batch-select');
  const pIdStr = getDatalistId('globalProductList', inputElement.value);
  
  // reset batch select
  batchSelect.innerHTML = '<option value="">-- تلقائي (FIFO) --</option>';
  
  if (!pIdStr) return;
  const pId = parseInt(pIdStr, 10);
  
  // Find warehouse ID
  const warehouses = state.locations.filter(l => l.type === 'Warehouse');
  if (warehouses.length === 0) return;
  const warehouseId = warehouses[0].location_id;

  // Filter state.inventory for available batches in the warehouse
  const availableBatches = state.inventory.filter(i => 
    i.location_id === warehouseId && 
    i.product_id === pId && 
    i.quantity > 0
  );

  availableBatches.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.batch_no;
    opt.textContent = `التشغيلة: ${b.batch_no} | الانتهاء: ${b.expiry_date} | الكمية: ${b.quantity}`;
    batchSelect.appendChild(opt);
  });
}

async function handleDispatchBulk(e) {
  e.preventDefault();
  try {
    const warehouses = state.locations.filter(l => l.type === 'Warehouse');
    const warehouseId = warehouses.length > 0 ? warehouses[0].location_id : null;
    const phName = $('dispPharmacy').value;
    const pharmacyId = getDatalistId('globalPharmacyList', phName);

    if (!warehouseId || !pharmacyId) return alert('يرجى التحقق من بيانات المستودع أو الصيدلية.');

    const note = $('dispNote') ? $('dispNote').value : '';
    const items = [];
    document.querySelectorAll('#dispatchCartBody tr').forEach(tr => {
      const pId = getDatalistId('globalProductList', tr.querySelector('.cart-product-input').value);
      if (pId) {
        const batchNo = tr.querySelector('.cart-batch-select').value;
        items.push({
          productId: parseInt(pId, 10),
          qty: parseInt(tr.querySelector('.cart-qty-input').value, 10),
          specificBatchNo: batchNo || null
        });
      }
    });

    if (items.length === 0) return alert('السلة فارغة.');

    await api('/stock/warehouse-to-pharmacy', {
      method: 'POST',
      body: JSON.stringify({ warehouse_id: warehouseId, pharmacy_id: pharmacyId, note, items })
    });

    showToast('تم الصرف للصيدلية بنجاح');
    closeModal('dispatchModal');
    loadAll();
  } catch (err) {
    showToast(err.message || 'حدث خطأ', 'error');
    console.error(err);
  }
}

async function handleReturnToSupplier(e) {
  e.preventDefault();
  try {
    const warehouses = state.locations.filter(l => l.type === 'Warehouse');
    const locationId = warehouses.length > 0 ? warehouses[0].location_id : null;
    const supplierId = getDatalistId('globalSupplierList', $('retSupplier').value);
    const productId = getDatalistId('globalProductList', $('retProduct').value);
    const qty = $('retQty').value;
    
    if (!locationId || !supplierId || !productId) return alert('الرجاء التأكد من صحة البيانات من القائمة.');

    await api('/stock/return-to-supplier', {
      method: 'POST',
      body: JSON.stringify({ location_id: locationId, supplier_id: supplierId, product_id: productId, quantity: parseInt(qty, 10) })
    });
    
    showToast('تم إرجاع البضاعة للمورد بنجاح');
    closeModal('returnSupplierModal');
    loadAll();
  } catch (err) {
    showToast(err.message || 'حدث خطأ', 'error');
    console.error(err);
  }
}

async function handleInterTransfer(e) {
  e.preventDefault();
  const fromId = getDatalistId('globalPharmacyList', $('transFrom').value);
  const toId = getDatalistId('globalPharmacyList', $('transTo').value);
  const productId = getDatalistId('globalProductList', $('transProduct').value);
  const qty = parseInt($('transQty').value, 10);
  
  if (!fromId || !toId || !productId) return alert('الرجاء التأكد من صحة المدخلات من القائمة.');

  await api('/stock/transfer', {
    method: 'POST',
    body: JSON.stringify({ from_location_id: fromId, to_location_id: toId, product_id: productId, quantity: qty })
  });
  showToast('تم التحويل بين الفروع بنجاح');
  e.target.reset();
  closeModal('transferModal');
  loadAll();
}

async function reverseTransaction(movementId) {
  if (!confirm('هل أنت متأكد من رغبتك في التراجع عن هذه الحركة وإلغائها؟')) return;
  await api('/stock/reverse', {
    method: 'POST',
    body: JSON.stringify({ movement_id: movementId })
  });
  showToast('تم التراجع عن الحركة بنجاح');
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

async function adminAddSupplier(e) {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  await api('/locations', { method: 'POST', body: JSON.stringify(data) });
  showToast('تم تعريف المورد بنجاح');
  form.reset();
  loadAll();
}

async function loadBestOffers() {
  const tbody = $('bestOffersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="empty-state">جاري التحميل...</td></tr>';
  try {
    const offers = await api('/offers/best');
    if (offers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">لا توجد عروض مسجلة.</td></tr>';
      return;
    }
    const getSupplierStars = (level) => level ? '⭐'.repeat(level) : '';
    tbody.innerHTML = offers.map(o => `
      <tr>
        <td>${escapeHTML(o.supplier_name)} ${getSupplierStars(o.importance_level)}</td>
        <td>${escapeHTML(o.product_name)} <br><small style="color: #888;">${o.sku}</small></td>
        <td><strong>${Number(o.price).toFixed(2)} ر.س</strong></td>
        <td>${o.condition || '—'}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state" style="color:var(--danger)">فشل التحميل</td></tr>';
  }
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

async function editReorderPoint(location_id, batch_no, current_val) {
  const newRp = prompt('أدخل حد الطلب الجديد:', current_val || 0);
  if (newRp === null || newRp === '') return;
  
  try {
    await api('/stock/reorder-point', {
      method: 'PUT',
      body: JSON.stringify({ location_id, batch_no, reorder_point: parseInt(newRp, 10) })
    });
    showToast('تم تعديل حد الطلب بنجاح');
    loadAll();
  } catch (err) {
    showToast(err.message, 'error');
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

async function editProduct(id) {
  const p = state.products.find(x => x.product_id === id);
  if (!p) return;
  const newName = prompt('تعديل اسم الدواء:', p.name);
  if (!newName) return;
  const newCategory = prompt('تعديل الفئة:', p.category) || p.category;
  const newSku = prompt('تعديل الرمز (SKU):', p.sku) || p.sku;
  const newStorage = prompt('تعديل ظروف التخزين:', p.storage_condition) || p.storage_condition;
  
  try {
    await api(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: newName, category: newCategory, sku: newSku, storage_condition: newStorage })
    });
    showToast('تم تعديل الدواء بنجاح');
    loadAll();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function editBatch(batch_no) {
  const b = state.batches.find(x => x.batch_no === batch_no);
  if (!b) return;
  const newExpiry = prompt('تعديل تاريخ الانتهاء (YYYY-MM-DD):', b.expiry_date);
  if (!newExpiry) return;
  const newManufactured = prompt('تعديل تاريخ الصنع (اختياري) (YYYY-MM-DD):', b.manufactured || '');
  
  try {
    await api(`/batches/${batch_no}`, {
      method: 'PUT',
      body: JSON.stringify({ expiry_date: newExpiry, manufactured: newManufactured })
    });
    showToast('تم تعديل التشغيلة بنجاح');
    loadAll();
  } catch (err) {
    showToast(err.message, 'error');
  }
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
    $('inventoryTableBody').innerHTML = `<tr><td colspan="9" class="empty-state">المخزون فارغ حالياً.</td></tr>`;
    return;
  }

  $('inventoryTableBody').innerHTML = inv.map(item => {
    const daysToExpiry = Math.ceil((new Date(item.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
    const isNearExpiry = daysToExpiry <= 120; // 4 months
    const isLow = item.quantity <= item.reorder_point;

    return `
      <tr>
        <td style="font-weight:700;">${escapeHTML(item.product_name)} <br><span style="font-size:0.8rem;color:var(--text-muted)">${item.sku}</span></td>
        <td>${escapeHTML(item.category)}</td>
        <td><span class="badge badge--teal">${escapeHTML(item.cheapest_importer || 'لا يوجد مورد')}</span></td>
        <td style="font-weight:bold; color:var(--success)">${Number(item.unit_cost || 0).toLocaleString()} ر.س</td>
        <td>${escapeHTML(item.location_name)} <br>${locationBadge(item.location_type)}</td>
        <td><span class="badge badge--purple">${item.batch_no}</span></td>
        <td style="color: ${isNearExpiry ? 'var(--danger)' : 'inherit'}; font-weight: ${isNearExpiry ? '700' : 'normal'}">
          ${item.expiry_date}
        </td>
        <td>
          <span class="badge badge--${isLow ? 'red' : 'green'}" style="font-size:1rem; padding: 0.2rem 0.6rem;">
            ${item.quantity}
          </span>
        </td>
        <td>
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
            <span style="font-weight:bold">${item.reorder_point}</span>
            ${item.location_type === 'Warehouse' ? `<button class="btn-refresh" style="color: var(--primary); border-color: var(--primary); padding: 0.15rem 0.4rem; font-size: 0.75rem;" onclick="editReorderPoint(${item.location_id}, '${item.batch_no}', ${item.reorder_point})">✏️</button>` : ''}
          </div>
        </td>
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
        <div class="row-item__name">${escapeHTML(a.product_name)} <span class="badge badge--purple">${a.batch_no}</span></div>
        <div class="row-item__meta">
          📍 ${escapeHTML(a.location_name)} • ينتهي: <b style="color:var(--danger)">${a.expiry_date}</b> (${a.days_until_expiry} أيام)
        </div>
      </div>
      <div class="row-item__right">
        <button class="btn-refresh" onclick="ackAlert(${a.alert_id})">تأكيد الإتلاف/السحب</button>
      </div>
    </div>
  `).join('');
}

let currentLowStock = [];

async function loadLowStock() {
  currentLowStock = await api('/stock/low');
  $('statLowStock').textContent = currentLowStock.length;
  renderLowStock('All');
}

function filterLowStock(type) {
  // Update button styles
  const btns = document.querySelectorAll('#alerts .panel__header button.badge');
  btns.forEach(b => {
    b.classList.remove('badge--purple');
    b.classList.add('badge--gray');
    if (b.textContent.includes(type === 'All' ? 'الكل' : type === 'Warehouse' ? 'مستودع' : 'صيدليات')) {
      b.classList.remove('badge--gray');
      b.classList.add('badge--purple');
    }
  });
  renderLowStock(type);
}

function renderLowStock(filterType = 'All') {
  let items = currentLowStock;
  if (filterType !== 'All') {
    items = items.filter(i => i.location_type === filterType);
  }

  if (items.length === 0) {
    $('lowStockList').innerHTML = `<div class="empty-state"><div class="empty-state__icon">✅</div>لا توجد نواقص في هذه القائمة</div>`;
    return;
  }

  $('lowStockList').innerHTML = items.map(i => {
    const isWh = i.location_type === 'Warehouse';
    return `
    <div class="row-item">
      <div class="row-item__left">
        <div class="row-item__name">${escapeHTML(i.product_name)}</div>
        <div class="row-item__meta"><span class="badge badge--${isWh ? 'blue' : 'amber'}">${isWh ? 'مستودع' : 'صيدلية'}</span> 📍 ${escapeHTML(i.location_name)} • التشغيلة: ${i.batch_no}</div>
      </div>
      <div class="row-item__right" style="text-align: left;">
        <span class="badge badge--red">${i.quantity} متوفر / ${i.reorder_point} الحد</span>
      </div>
    </div>
    `;
  }).join('');
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
      desc = `إضافة إلى ${escapeHTML(m.to_name)}`; 
      movBadge = '➕ إضافة'; 
      movColor = 'success';
    } else if (m.movement === 'OUT') { 
      desc = `صرف من ${escapeHTML(m.from_name)}`; 
      movBadge = '➖ صرف'; 
      movColor = 'danger';
    } else if (m.movement === 'TRANSFER') { 
      desc = `نقل من ${escapeHTML(m.from_name)} ➔ ${escapeHTML(m.to_name)}`; 
      movBadge = '🔄 نقل'; 
      movColor = 'blue';
    }

    return `
      <div class="row-item">
        <div class="row-item__left">
          <div class="row-item__name">${escapeHTML(m.product_name)} <span class="badge badge--${movColor}">${movBadge}</span></div>
          <div class="row-item__meta">${desc} • الكمية: <b>${m.quantity}</b></div>
        </div>
        <div class="row-item__right" style="color: var(--text-muted); font-size: 0.8rem; text-align: left; display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem;">
          ${new Date(m.created_at).toLocaleString('ar-SA')}
          <button class="btn-refresh" style="font-size: 0.75rem; padding: 2px 6px;" onclick="reverseTransaction(${m.movement_id})">↩️ تراجع (إلغاء)</button>
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
              <div class="row-item__name">${escapeHTML(m.product_name)} <span class="badge badge--success">📥 استلام</span></div>
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
              <div class="row-item__name">${escapeHTML(m.product_name)} <span class="badge badge--blue">📤 توزيع</span></div>
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
      loadWarehouseDashboard(),
      loadAnalyticsDashboard(),
      loadAnalyticsPharmacies()
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

// ─── Analytics Logic ────────────────────────────────────────────────
async function loadAnalyticsDashboard() {
  const grid = $('analyticsDashboardGrid');
  if (!grid) return;
  
  try {
    const data = await api('/analytics/dashboard');
    grid.innerHTML = `
      <div class="stat-card fade-in" style="cursor: pointer; border: 2px solid transparent; transition: 0.3s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='transparent'" onclick="analyticsNavigate('pharmacies-list')">
        <div class="stat-card__icon stat-card__icon--teal">🏥</div>
        <div>
          <div class="stat-card__value">${data.pharmacies.active}</div>
          <div class="stat-card__label">صيدليات نشطة</div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">${data.pharmacies.monthlyTransfers} تحويلات (30 يوم)</div>
        </div>
      </div>
      <div class="stat-card fade-in" style="cursor: pointer; border: 2px solid transparent; transition: 0.3s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='transparent'" onclick="loadAnalyticsWarehouseProfile()">
        <div class="stat-card__icon stat-card__icon--blue">🏭</div>
        <div>
          <div class="stat-card__value">${Number(data.warehouse.totalVolume).toLocaleString()}</div>
          <div class="stat-card__label">إجمالي المخزون</div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">${Number(data.warehouse.totalValue).toLocaleString()} ر.س إجمالي القيمة</div>
        </div>
      </div>
      <div class="stat-card fade-in" style="cursor: pointer; border: 2px solid transparent; transition: 0.3s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='transparent'" onclick="loadAnalyticsImportersProfile()">
        <div class="stat-card__icon stat-card__icon--amber">🚢</div>
        <div>
          <div class="stat-card__value">${data.importers.activeSuppliers}</div>
          <div class="stat-card__label">موردين نشطين</div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">
            أفضل مورد: ${data.importers.topImporter}<br>
            📦 يغطي ${data.importers.totalMedicinesCovered}/${data.medicines.totalSKUs} صنف
            ${data.importers.medicinesWithNoImporter > 0 ? `| ⚠️ ${data.importers.medicinesWithNoImporter} بدون مورد` : '| ✅ تغطية كاملة'}
          </div>
        </div>
      </div>
      <div class="stat-card fade-in" style="cursor: pointer; border: 2px solid transparent; transition: 0.3s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='transparent'" onclick="loadAnalyticsMedicinesProfile()">
        <div class="stat-card__icon stat-card__icon--purple">💊</div>
        <div>
          <div class="stat-card__value">${data.medicines.totalSKUs}</div>
          <div class="stat-card__label">صنف دواء (SKU)</div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">
            ⚠️ ${data.medicines.criticalAlerts} تنبيه حرج | 📦 ${data.medicines.atRiskCount} دفعة معرّضة (${Number(data.medicines.atRiskValue).toLocaleString()} ر.س)
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1">فشل تحميل التحليلات</div>';
  }
}

let analyticsPharmacies = [];
async function loadAnalyticsPharmacies() {
  const tbody = $('analyticsPharmaciesListBody');
  if (!tbody) return;
  
  try {
    analyticsPharmacies = await api('/analytics/pharmacies');
    renderAnalyticsPharmacies(analyticsPharmacies);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">فشل تحميل الصيدليات</td></tr>';
  }
}

function renderAnalyticsPharmacies(list) {
  const tbody = $('analyticsPharmaciesListBody');
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">لا يوجد صيدليات</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(p => `
    <tr style="cursor:pointer;" onclick="loadAnalyticsPharmacyProfile(${p.location_id})">
      <td style="font-weight:600; color:var(--primary);">${escapeHTML(p.name)}</td>
      <td>${p.address || '—'}</td>
      <td>${p.is_active ? '<span class="badge badge--green">نشط</span>' : '<span class="badge badge--gray">غير نشط</span>'}</td>
      <td>${p.monthly_transfers}</td>
      <td style="color:var(--text-muted); font-size:0.85rem;">${p.last_active ? new Date(p.last_active).toLocaleString('ar-SA') : '—'}</td>
    </tr>
  `).join('');
}

if ($('analyticsPharmacySearch')) {
  $('analyticsPharmacySearch').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = analyticsPharmacies.filter(p => p.name.toLowerCase().includes(term) || (p.address && p.address.toLowerCase().includes(term)));
    renderAnalyticsPharmacies(filtered);
  });
}

function analyticsNavigate(viewId) {
  document.querySelectorAll('.analytics-view').forEach(v => v.style.display = 'none');
  const view = $(`analytics-view-${viewId}`);
  if (view) view.style.display = 'block';

  // Only save top-level views that don't depend on a specific item ID
  if (['dashboard', 'pharmacies-list', 'warehouse-profile', 'importers-profile', 'medicines-profile'].includes(viewId)) {
    localStorage.setItem('activeAnalyticsView', viewId);
  }
}

async function loadAnalyticsPharmacyProfile(id) {
  try {
    const data = await api(`/analytics/pharmacies/${id}`);
    
    // Header
    $('profilePharmacyName').textContent = '🏥 ' + data.profile.name;
    $('profilePharmacyAddress').textContent = data.profile.address || '—';
    $('profilePharmacyStatus').innerHTML = data.profile.is_active ? '<span class="badge badge--green">نشط</span>' : '<span class="badge badge--gray">غير نشط</span>';
    $('profilePharmacySupervisor').textContent = data.profile.supervisor;

    // Inventory Tab
    const invBody = $('profileInventoryBody');
    if (data.inventory.length === 0) {
      invBody.innerHTML = '<tr><td colspan="5" class="empty-state">المخزون فارغ</td></tr>';
    } else {
      invBody.innerHTML = data.inventory.map(i => `
        <tr>
          <td>${escapeHTML(i.product_name)} <br><small style="color:var(--text-muted)">${i.sku}</small></td>
          <td><span class="badge badge--purple">${i.batch_no}</span></td>
          <td style="font-weight:bold">${i.quantity}</td>
          <td>${i.reorder_point}</td>
          <td>${i.status === 'LOW' ? '<span class="badge badge--red">منخفض</span>' : '<span class="badge badge--green">طبيعي</span>'}</td>
        </tr>
      `).join('');
    }

    // Transfers Tab
    const transBody = $('profileTransfersBody');
    if (data.transfers.length === 0) {
      transBody.innerHTML = '<tr><td colspan="5" class="empty-state">لا يوجد حركات</td></tr>';
    } else {
      transBody.innerHTML = data.transfers.map(t => {
        let movBadge = t.movement === 'IN' ? 'badge--success' : (t.movement === 'OUT' ? 'badge--danger' : 'badge--blue');
        return `
        <tr>
          <td style="font-size:0.85rem">${new Date(t.created_at).toLocaleString('ar-SA')}</td>
          <td><span class="badge ${movBadge}">${t.movement}</span></td>
          <td><span class="badge badge--purple">${t.batch_no}</span></td>
          <td style="font-weight:bold">${t.quantity}</td>
          <td style="font-size:0.85rem">${t.reference_note || '—'}</td>
        </tr>
      `}).join('');
    }

    // Activities Tab
    const acts = data.activities;
    $('profileNotesBody').innerHTML = acts.notes.length ? acts.notes.map(n => `<div class="row-item"><div class="row-item__name">${n.author}</div><div class="row-item__meta">${n.content}</div><div style="font-size:0.75rem; color:gray">${new Date(n.created_at).toLocaleString('ar-SA')}</div></div>`).join('') : '<div class="empty-state">لا يوجد ملاحظات</div>';
    $('profileOrdersBody').innerHTML = acts.orders.length ? acts.orders.map(o => `<div class="row-item"><div class="row-item__name">طلب #${o.request_id} <span class="badge badge--gray">${o.status}</span></div><div style="font-size:0.75rem; color:gray">${new Date(o.created_at).toLocaleString('ar-SA')}</div></div>`).join('') : '<div class="empty-state">لا يوجد طلبات</div>';
    $('profileDiscrepanciesBody').innerHTML = acts.discrepancies.length ? acts.discrepancies.map(d => `<div class="row-item"><div class="row-item__name">تشغيلة ${d.batch_no}</div><div class="row-item__meta">المتوقع: ${d.expected_quantity} | الفعلي: ${d.actual_quantity} <br>${d.reason || ''}</div></div>`).join('') : '<div class="empty-state">لا يوجد تناقضات</div>';

    analyticsNavigate('pharmacy-profile');
    switchProfileTab('inventory');
  } catch (err) {
    showToast('فشل تحميل ملف الصيدلية', 'error');
  }
}

function switchProfileTab(tabId) {
  document.querySelectorAll('#analytics-view-pharmacy-profile .category-btn').forEach(b => b.classList.remove('active'));
  $(`profileTab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}Btn`).classList.add('active');
  
  document.querySelectorAll('.profile-tab-content').forEach(c => c.style.display = 'none');
  $(`profile-tab-${tabId}`).style.display = 'block';
}

let analyticsWhInventoryData = [];
async function loadAnalyticsWarehouseProfile() {
  try {
    const data = await api(`/analytics/warehouse`);
    
    // Header Data
    $('warehouseProfileCapacity').textContent = data.inventory.reduce((sum, i) => sum + i.quantity, 0).toLocaleString() + ' وحدة';
    $('warehouseProfileValue').textContent = '$' + data.inventory.reduce((sum, i) => sum + (i.quantity * (i.unit_cost || 0)), 0).toLocaleString();

    // Section A: Inventory
    analyticsWhInventoryData = data.inventory;
    renderWhInventory();

    // Section B: Activity Log
    analyticsWhActivityData = data.activityLog;
    renderWhActivities();

    // Section C: Alerts
    const expTable = $('whProfileExpiringTable');
    if (data.alerts.expiringSoon.length === 0) {
      expTable.innerHTML = '<tr><td colspan="3" class="empty-state">لا يوجد أدوية تنتهي قريباً</td></tr>';
    } else {
      expTable.innerHTML = data.alerts.expiringSoon.map(e => `
        <tr>
          <td>${escapeHTML(e.product_name)} <br><small style="color:var(--text-muted)">${e.batch_no}</small></td>
          <td style="color:var(--danger); font-weight:bold">${e.expiry_date}</td>
          <td>${e.quantity}</td>
        </tr>
      `).join('');
    }

    const lowTable = $('whProfileLowStockTable');
    if (data.alerts.lowStock.length === 0) {
      lowTable.innerHTML = '<tr><td colspan="3" class="empty-state">لا يوجد أدوية تحت الحد الآمن</td></tr>';
    } else {
      lowTable.innerHTML = data.alerts.lowStock.map(l => `
        <tr>
          <td>${escapeHTML(l.product_name)} <br><small style="color:var(--text-muted)">${l.batch_no}</small></td>
          <td style="color:var(--danger); font-weight:bold">${l.quantity}</td>
          <td>${l.reorder_point}</td>
        </tr>
      `).join('');
    }

    analyticsNavigate('warehouse-profile');
    switchWarehouseTab('inventory');
  } catch (err) {
    showToast('فشل تحميل ملف المستودع', 'error');
  }
}

function renderWhInventory() {
  const tbody = $('whProfileInventoryBody');
  const term = ($('analyticsWhInventorySearch') ? $('analyticsWhInventorySearch').value.toLowerCase() : '');
  const storage = ($('analyticsWhStorageFilter') ? $('analyticsWhStorageFilter').value : '');
  
  let filtered = analyticsWhInventoryData;
  if (term) filtered = filtered.filter(i => i.product_name.toLowerCase().includes(term) || i.batch_no.toLowerCase().includes(term));
  if (storage) filtered = filtered.filter(i => i.storage_condition === storage);

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">لا يوجد مخزون مطابق للبحث</td></tr>';
    return;
  }
  
  tbody.innerHTML = filtered.map(i => `
    <tr>
      <td>${escapeHTML(i.product_name)}</td>
      <td><span class="badge badge--teal">${escapeHTML(i.cheapest_importer || 'لا يوجد مورد')}</span></td>
      <td style="font-weight:bold; color:var(--success)">${Number(i.unit_cost || 0).toLocaleString()} ر.س</td>
      <td><span class="badge badge--purple">${i.batch_no}</span></td>
      <td>${i.expiry_date}</td>
      <td style="font-weight:bold">${i.quantity}</td>
      <td>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
          <span style="font-weight:bold">${i.reorder_point}</span>
          <button class="btn-refresh" style="color: var(--primary); border-color: var(--primary); padding: 0.15rem 0.4rem; font-size: 0.75rem;" onclick="editReorderPoint(${i.location_id}, '${i.batch_no}', ${i.reorder_point})">✏️</button>
        </div>
      </td>
      <td>${i.storage_condition}</td>
    </tr>
  `).join('');
}

if ($('analyticsWhInventorySearch')) {
  $('analyticsWhInventorySearch').addEventListener('input', renderWhInventory);
  $('analyticsWhStorageFilter').addEventListener('change', renderWhInventory);
}

let analyticsWhActivityData = [];
function renderWhActivities() {
  const tbody = $('whProfileActivitiesBody');
  const typeFilter = ($('analyticsWhActivityFilter') ? $('analyticsWhActivityFilter').value : '');
  
  let filtered = analyticsWhActivityData;
  if (typeFilter) {
    filtered = filtered.filter(a => a.type === typeFilter);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">لا يوجد حركات مطابقة للبحث</td></tr>';
    return;
  }
  
  tbody.innerHTML = filtered.map(a => {
    let badgeClass = a.type === 'INBOUND' ? 'badge--success' : (a.type === 'OUTBOUND' ? 'badge--blue' : 'badge--danger');
    let details = a.type === 'INBOUND' ? `من: ${a.source_name}` : (a.type === 'OUTBOUND' ? `إلى: ${a.target_name}` : `السبب: ${a.reason || ''} | متوقع: ${a.expected_quantity}, فعلي: ${a.actual_quantity}`);
    return `
    <tr>
      <td style="font-size:0.85rem">${new Date(a.created_at).toLocaleString('ar-SA')}</td>
      <td><span class="badge ${badgeClass}">${a.type}</span></td>
      <td>${a.product_name || `تشغيلة ${a.batch_no}`}</td>
      <td style="font-weight:bold">${a.quantity || '—'}</td>
      <td style="font-size:0.85rem">${details}</td>
    </tr>
  `}).join('');
}

if ($('analyticsWhActivityFilter')) {
  $('analyticsWhActivityFilter').addEventListener('change', renderWhActivities);
}

function switchWarehouseTab(tabId) {
  document.querySelectorAll('#analytics-view-warehouse-profile .category-btn').forEach(b => b.classList.remove('active'));
  $(`whTab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}Btn`).classList.add('active');
  
  document.querySelectorAll('#analytics-view-warehouse-profile .profile-tab-content').forEach(c => c.style.display = 'none');
  $(`wh-tab-${tabId}`).style.display = 'block';
}

let importersRadarInstance = null;
let importersLineInstance = null;
let allImportersProfiles = [];

async function loadAnalyticsImportersProfile() {
  try {
    const data = await api('/analytics/importers');

    // Section A: Leaderboard
    const lbBody = $('impProfileLeaderboardBody');
    if (data.leaderboard.length === 0) {
      lbBody.innerHTML = '<tr><td colspan="4" class="empty-state">لا يوجد موردين لتقييمهم</td></tr>';
    } else {
      lbBody.innerHTML = data.leaderboard.map((imp, idx) => `
        <tr>
          <td style="font-weight:bold; color:var(--primary); font-size: 1.1rem;">#${idx + 1}</td>
          <td>${escapeHTML(imp.name)}</td>
          <td><span class="badge badge--success">${imp.rank_score} / 100</span></td>
          <td>${imp.avg_accuracy}%</td>
        </tr>
      `).join('');
    }

    // Render Radar Chart
    if ($('importersRadarChart')) {
      if (importersRadarInstance) importersRadarInstance.destroy();
      const ctx = $('importersRadarChart').getContext('2d');
      const labels = data.leaderboard.map(i => i.name);
      const dataAccuracy = data.leaderboard.map(i => i.avg_accuracy);
      const dataDelivery = data.leaderboard.map(i => i.delivery_score);
      const dataPrice = data.leaderboard.map(i => i.price_score);
      
      importersRadarInstance = new Chart(ctx, {
        type: 'radar',
        data: {
          labels: labels,
          datasets: [
            { label: 'دقة الطلبات', data: dataAccuracy, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.2)' },
            { label: 'سرعة التوصيل', data: dataDelivery, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.2)' },
            { label: 'تنافسية السعر', data: dataPrice, borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.2)' }
          ]
        },
        options: {
          scales: { r: { min: 0, max: 100 } },
          plugins: { legend: { position: 'bottom' } }
        }
      });
    }

    // Section B: Pricing Trends & Best Deals
    if ($('importersLineChart')) {
      if (importersLineInstance) importersLineInstance.destroy();
      const ctx = $('importersLineChart').getContext('2d');
      
      const datasets = [];
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
      let cIdx = 0;
      
      let allDates = new Set();
      
      for (const [productName, history] of Object.entries(data.pricingTrends)) {
        history.forEach(h => allDates.add(h.date_val));
      }
      const sortedDates = Array.from(allDates).sort();

      for (const [productName, history] of Object.entries(data.pricingTrends)) {
        // Map history to the sorted dates, filling missing with null
        const dataPoints = sortedDates.map(date => {
          const match = history.find(h => h.date_val === date);
          return match ? match.price : null;
        });

        datasets.push({
          label: productName,
          data: dataPoints,
          borderColor: colors[cIdx % colors.length],
          tension: 0.1,
          spanGaps: true
        });
        cIdx++;
      }

      importersLineInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: sortedDates, datasets: datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top' } },
          scales: { y: { beginAtZero: false } }
        }
      });
    }

    const dealsBody = $('impProfileBestDealsBody');
    if (data.bestDeals.length === 0) {
      dealsBody.innerHTML = '<tr><td colspan="3" class="empty-state">لا توجد عروض حالية أقل من المتوسط</td></tr>';
    } else {
      dealsBody.innerHTML = data.bestDeals.map(d => `
        <tr>
          <td>${escapeHTML(d.product_name)}</td>
          <td><span class="badge badge--purple">${escapeHTML(d.supplier_name)}</span></td>
          <td style="font-weight:bold; color:var(--success)">${d.price} ر.س</td>
        </tr>
      `).join('');
    }

    // Section C: Profiles
    allImportersProfiles = data.all_profiles;
    renderImpProfiles();

    analyticsNavigate('importers-profile');
    switchImportersTab('leaderboard');
  } catch (err) {
    showToast('فشل تحميل ملف الموردين', 'error');
  }
}

function renderImpProfiles() {
  const tbody = $('impProfileAllBody');
  const term = ($('impProfileSearch') ? $('impProfileSearch').value.toLowerCase() : '');
  
  let filtered = allImportersProfiles;
  if (term) filtered = filtered.filter(i => i.name.toLowerCase().includes(term));

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">لا يوجد موردين مطابقين للبحث</td></tr>';
    return;
  }
  
  tbody.innerHTML = filtered.map(i => `
    <tr>
      <td style="font-weight:bold;">${escapeHTML(i.name)}</td>
      <td>${i.total_products} منتج</td>
      <td>${i.total_orders} طلبية</td>
      <td style="color:var(--primary); font-weight:bold;">${Number(i.total_spent).toLocaleString()} ر.س</td>
      <td>
        ${i.medicine_names ? i.medicine_names.split(',').map(m => `<span class="badge badge--gray" style="margin:2px; font-size:0.75rem;">${escapeHTML(m.trim())}</span>`).join('') : '<span class="text-muted">لا يوجد</span>'}
      </td>
      <td>
        ${i.exclusive_medicines > 0 ? `<span class="badge badge--danger" title="يحتكر هذا المورد ${i.exclusive_medicines} أصناف">${i.exclusive_medicines} أصناف حصرية ⚠️</span>` : '<span class="badge badge--success">لا يوجد</span>'}
      </td>
    </tr>
  `).join('');
}

if ($('impProfileSearch')) {
  $('impProfileSearch').addEventListener('input', renderImpProfiles);
}

function switchImportersTab(tabId) {
  document.querySelectorAll('#analytics-view-importers-profile .category-btn').forEach(b => b.classList.remove('active'));
  $(`impTab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}Btn`).classList.add('active');
  
  document.querySelectorAll('#analytics-view-importers-profile .profile-tab-content').forEach(c => c.style.display = 'none');
  $(`imp-tab-${tabId}`).style.display = 'block';
}

// ─── Medicines Analytics Logic ──────────────────────────────────────
let medsDonutInstance = null;
let medsFastMoversInstance = null;
let medsPriceHistoryInstance = null;
let allMedsData = [];
let allMedsListData = [];

function getExpiryBadge(daysLeft) {
  if (daysLeft < 0) return '<span class="badge expiry-badge--expired">منتهي</span>';
  if (daysLeft <= 30) return '<span class="badge expiry-badge--warning">أقل من 30 يوم</span>';
  if (daysLeft <= 90) return '<span class="badge expiry-badge--caution">أقل من 90 يوم</span>';
  return '<span class="badge expiry-badge--safe">آمن</span>';
}

function getStockStatusBadge(totalStock) {
  if (totalStock === 0) return '<span class="badge badge--danger">نفاد</span>';
  if (totalStock < 20) return '<span class="badge badge--amber">منخفض</span>';
  return '<span class="badge badge--success">متوفر</span>';
}

async function loadAnalyticsMedicinesProfile() {
  try {
    const data = await api('/analytics/medicines');
    allMedsData = data;
    allMedsListData = data.allMedicines;

    // ── Summary KPIs Row ──
    const kpiGrid = $('medsSummaryKPIs');
    const chart = data.expiryChartData;
    const totalBatches = chart.expired.batches + chart.under30.batches + chart.under90.batches + chart.safe.batches;
    const totalUnits = chart.expired.count + chart.under30.count + chart.under90.count + chart.safe.count;

    kpiGrid.innerHTML = `
      <div class="stat-card fade-in">
        <div class="stat-card__icon stat-card__icon--red">🚨</div>
        <div>
          <div class="stat-card__value">${chart.expired.batches}</div>
          <div class="stat-card__label">دفعات منتهية الصلاحية</div>
          <div style="font-size:0.8rem; color:var(--danger); margin-top:0.25rem;">${chart.expired.count} وحدة (${Number(chart.expired.value).toLocaleString()} ر.س)</div>
        </div>
      </div>
      <div class="stat-card fade-in">
        <div class="stat-card__icon stat-card__icon--amber">⏰</div>
        <div>
          <div class="stat-card__value">${chart.under30.batches + chart.under90.batches}</div>
          <div class="stat-card__label">دفعات معرّضة للانتهاء</div>
          <div style="font-size:0.8rem; color:var(--warning); margin-top:0.25rem;">${chart.under30.count + chart.under90.count} وحدة (${Number(chart.under30.value + chart.under90.value).toLocaleString()} ر.س)</div>
        </div>
      </div>
      <div class="stat-card fade-in">
        <div class="stat-card__icon stat-card__icon--purple">📊</div>
        <div>
          <div class="stat-card__value">${data.fastMovers.length > 0 ? data.fastMovers[0].name : '—'}</div>
          <div class="stat-card__label">أعلى دواء طلباً</div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">${data.fastMovers.length > 0 ? data.fastMovers[0].total_moved + ' وحدة (90 يوم)' : 'لا يوجد بيانات'}</div>
        </div>
      </div>
      <div class="stat-card fade-in">
        <div class="stat-card__icon stat-card__icon--teal">🔮</div>
        <div>
          <div class="stat-card__value">${data.shortageRisks.length}</div>
          <div class="stat-card__label">أدوية تحت الحد الآمن</div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">${data.deadStock.length} صنف راكد</div>
        </div>
      </div>
    `;

    // ── Section A: Expiry Donut Chart ──
    if ($('medsExpiryDonutChart')) {
      if (medsDonutInstance) medsDonutInstance.destroy();
      const ctx = $('medsExpiryDonutChart').getContext('2d');
      medsDonutInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['منتهي الصلاحية', 'أقل من 30 يوم', 'أقل من 90 يوم', 'آمن'],
          datasets: [{
            data: [chart.expired.count, chart.under30.count, chart.under90.count, chart.safe.count],
            backgroundColor: ['#dc2626', '#f59e0b', '#3b82f6', '#10b981'],
            borderColor: '#ffffff',
            borderWidth: 3,
            hoverOffset: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          cutout: '60%',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(ctx) {
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                  return `${ctx.label}: ${ctx.parsed.toLocaleString()} وحدة (${pct}%)`;
                }
              }
            }
          }
        }
      });

      // Custom legend below chart
      const legendEl = $('medsExpiryLegend');
      const colors = ['#dc2626', '#f59e0b', '#3b82f6', '#10b981'];
      const labels = ['منتهي', '<30 يوم', '<90 يوم', 'آمن'];
      const counts = [chart.expired.count, chart.under30.count, chart.under90.count, chart.safe.count];
      legendEl.innerHTML = labels.map((l, i) => `
        <div style="display:flex; align-items:center; gap:0.35rem; font-size:0.85rem;">
          <span style="width:12px; height:12px; border-radius:3px; background:${colors[i]}; display:inline-block;"></span>
          <span>${l}: <strong>${counts[i].toLocaleString()}</strong></span>
        </div>
      `).join('');
    }

    // Urgent expiry table (expired + under 30 days)
    const urgentRows = [...data.expiryBreakdown.expired, ...data.expiryBreakdown.under30];
    const urgentBody = $('medsExpiryUrgentBody');
    if (urgentRows.length === 0) {
      urgentBody.innerHTML = '<tr><td colspan="6" class="empty-state">لا يوجد تشغيلات عاجلة — ممتاز! ✅</td></tr>';
    } else {
      urgentBody.innerHTML = urgentRows.map(r => `
        <tr>
          <td style="cursor:pointer; color:var(--primary); font-weight:bold;" onclick="loadMedicineDetail(${r.product_id})">${escapeHTML(r.product_name)}</td>
          <td><span class="badge badge--purple">${r.batch_no}</span></td>
          <td style="font-weight:bold; color:var(--danger)">${r.expiry_date}</td>
          <td style="font-weight:bold">${r.quantity}</td>
          <td>${escapeHTML(r.location_name)}</td>
          <td>${getExpiryBadge(r.days_until_expiry)}</td>
        </tr>
      `).join('');
    }

    // ── Section B: Fast Movers Bar Chart ──
    if ($('medsFastMoversChart')) {
      if (medsFastMoversInstance) medsFastMoversInstance.destroy();
      const ctx = $('medsFastMoversChart').getContext('2d');
      
      const barColors = ['#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#6d28d9', '#5b21b6', '#4c1d95', '#9333ea', '#a855f7'];
      
      medsFastMoversInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.fastMovers.map(m => m.name),
          datasets: [{
            label: 'الكمية المنقولة',
            data: data.fastMovers.map(m => m.total_moved),
            backgroundColor: data.fastMovers.map((_, i) => barColors[i % barColors.length]),
            borderRadius: 6,
            borderSkipped: false,
            barThickness: 28
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(ctx) {
                  return `${ctx.parsed.x.toLocaleString()} وحدة`;
                }
              }
            }
          },
          scales: {
            x: { beginAtZero: true, grid: { display: false } },
            y: { grid: { display: false } }
          }
        }
      });
    }

    // Dead Stock table
    const deadBody = $('medsDeadStockBody');
    if (data.deadStock.length === 0) {
      deadBody.innerHTML = '<tr><td colspan="3" class="empty-state">لا يوجد مخزون راكد — ممتاز! ✅</td></tr>';
    } else {
      deadBody.innerHTML = data.deadStock.map(d => {
        const lastDate = d.last_movement ? new Date(d.last_movement).toLocaleDateString('ar-SA') : 'لم يُنقل أبداً';
        const daysSince = d.last_movement ? Math.floor((Date.now() - new Date(d.last_movement)) / 86400000) : '∞';
        return `
          <tr style="cursor:pointer;" onclick="loadMedicineDetail(${d.product_id})">
            <td style="font-weight:bold; color:var(--primary)">${escapeHTML(d.name)} <br><small style="color:var(--text-muted)">${d.sku}</small></td>
            <td>${d.total_stock} وحدة</td>
            <td><span class="badge badge--danger">${lastDate}</span><br><small style="color:var(--text-muted)">${daysSince} يوم</small></td>
          </tr>
        `;
      }).join('');
    }

    // ── Section C: Shortage Predictor ──
    const shortageBody = $('medsShortageBody');
    if (data.shortageRisks.length === 0) {
      shortageBody.innerHTML = '<tr><td colspan="6" class="empty-state">جميع الأدوية فوق الحد الآمن — ممتاز! ✅</td></tr>';
    } else {
      shortageBody.innerHTML = data.shortageRisks.map(s => {
        const pct = s.reorder_point > 0 ? Math.round((s.total_stock / s.reorder_point) * 100) : 0;
        const meterColor = pct < 25 ? 'var(--danger)' : pct < 60 ? 'var(--warning)' : 'var(--success)';
        const supplierInfo = s.cheapest_supplier 
          ? `<span class="badge badge--purple">${s.cheapest_supplier}</span><br><small style="color:var(--success); font-weight:bold;">${s.cheapest_price} ر.س</small>`
          : '<span class="badge badge--gray">لا يوجد مورد</span>';
        return `
          <tr style="cursor:pointer;" onclick="loadMedicineDetail(${s.product_id})">
            <td style="font-weight:bold; color:var(--primary)">${escapeHTML(s.name)} <br><small style="color:var(--text-muted)">${s.sku}</small></td>
            <td style="font-weight:bold; color:var(--danger)">${s.total_stock}</td>
            <td>${s.reorder_point}</td>
            <td style="color:var(--danger); font-weight:bold">${s.deficit}</td>
            <td>
              <div class="shortage-meter">
                <div class="shortage-meter__fill" style="width:${Math.min(pct, 100)}%; background:${meterColor};"></div>
              </div>
              <small style="color:var(--text-muted)">${pct}%</small>
            </td>
            <td>${supplierInfo}</td>
          </tr>
        `;
      }).join('');
    }

    // ── Section D: Medicine Master List ──
    // Populate category filter
    const categories = [...new Set(data.allMedicines.map(m => m.category).filter(Boolean))];
    const catFilter = $('medsCategoryFilter');
    if (catFilter) {
      catFilter.innerHTML = '<option value="">جميع الفئات</option>' + categories.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    const importersSet = new Set();
    data.allMedicines.forEach(m => {
        if (m.importer_names) {
            m.importer_names.split(',').forEach(imp => importersSet.add(imp.trim()));
        }
    });
    const impFilter = $('medsImporterFilter');
    if (impFilter) {
      impFilter.innerHTML = '<option value="">جميع الموردين</option>' + [...importersSet].sort().map(i => `<option value="${i}">${i}</option>`).join('');
    }

    renderMedsMasterList();

    analyticsNavigate('medicines-profile');
    switchMedicinesTab('expiry');
  } catch (err) {
    showToast('فشل تحميل تحليلات الأدوية', 'error');
  }
}

function renderMedsMasterList() {
  const tbody = $('medsMasterListBody');
  if (!tbody) return;

  const term = ($('medsSearchInput') ? $('medsSearchInput').value.toLowerCase() : '');
  const cat = ($('medsCategoryFilter') ? $('medsCategoryFilter').value : '');
  const imp = ($('medsImporterFilter') ? $('medsImporterFilter').value : '');

  let filtered = allMedsListData;
  if (term) filtered = filtered.filter(m => m.name.toLowerCase().includes(term) || m.sku.toLowerCase().includes(term));
  if (cat) filtered = filtered.filter(m => m.category === cat);
  if (imp) filtered = filtered.filter(m => m.importer_names && m.importer_names.split(',').map(s=>s.trim()).includes(imp));

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">لا يوجد أدوية مطابقة للبحث</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(m => {
    const importerCell = m.importer_count > 0 
      ? `<span class="badge badge--teal" title="${escapeHTML(m.importer_names)}">${escapeHTML(m.cheapest_importer)}</span>
         ${m.importer_count > 1 ? `<br><small style="color:var(--text-muted)">+${m.importer_count - 1} مورد آخر</small>` : ''}`
      : '<span class="badge badge--danger">لا يوجد مورد ⚠️</span>';

    return `
    <tr style="cursor:pointer;" onclick="loadMedicineDetail(${m.product_id})">
      <td><span class="badge badge--purple">${m.sku}</span></td>
      <td style="font-weight:bold; color:var(--primary)">${escapeHTML(m.name)}</td>
      <td>${m.category || '—'}</td>
      <td>${importerCell}</td>
      <td style="font-weight:bold; color:var(--success)">${Number(m.unit_cost).toLocaleString()} ر.س</td>
      <td style="font-weight:bold">${m.total_stock}</td>
      <td>${m.warehouse_stock}</td>
      <td>${m.batch_count}</td>
      <td>${getStockStatusBadge(m.total_stock)}</td>
    </tr>
    `;
  }).join('');
}

if ($('medsSearchInput')) {
  $('medsSearchInput').addEventListener('input', renderMedsMasterList);
}
if ($('medsCategoryFilter')) {
  $('medsCategoryFilter').addEventListener('change', renderMedsMasterList);
}
if ($('medsImporterFilter')) {
  $('medsImporterFilter').addEventListener('change', renderMedsMasterList);
}

function switchMedicinesTab(tabId) {
  document.querySelectorAll('#analytics-view-medicines-profile .category-btn').forEach(b => b.classList.remove('active'));
  const btnMap = { expiry: 'medsTabExpiryBtn', demand: 'medsTabDemandBtn', shortage: 'medsTabShortageBtn', search: 'medsTabSearchBtn' };
  if ($(btnMap[tabId])) $(btnMap[tabId]).classList.add('active');
  
  document.querySelectorAll('#analytics-view-medicines-profile .profile-tab-content').forEach(c => c.style.display = 'none');
  $(`meds-tab-${tabId}`).style.display = 'block';
}

// ─── Medicine Detail Profile ────────────────────────────────────────
async function loadMedicineDetail(productId) {
  try {
    const data = await api(`/analytics/medicines/${productId}`);

    // Header
    $('medDetailTitle').textContent = `💊 ${data.product.name}`;
    $('medDetailMeta').innerHTML = `
      الرمز: <strong>${data.product.sku}</strong> | 
      الفئة: <strong>${data.product.category || '—'}</strong> | 
      سعر الوحدة: <strong>${data.product.unit_cost || 0} ر.س</strong> | 
      ظروف التخزين: <strong>${data.product.storage_condition || '—'}</strong> | 
      المخزون الكلي: <strong style="color:var(--primary)">${data.totalStock} وحدة</strong> | 
      مخزون المستودع: <strong style="color:var(--teal)">${data.warehouseStock} وحدة</strong>
    `;

    // Pharmacy Distribution
    const distBody = $('medDetailDistBody');
    if (data.pharmacyDistribution.length === 0) {
      distBody.innerHTML = '<tr><td colspan="2" class="empty-state">لا يوجد مخزون في الصيدليات</td></tr>';
    } else {
      const maxQty = Math.max(...data.pharmacyDistribution.map(p => p.quantity));
      distBody.innerHTML = data.pharmacyDistribution.map(p => {
        const pct = maxQty > 0 ? Math.round((p.quantity / maxQty) * 100) : 0;
        return `
          <tr>
            <td style="font-weight:bold">${p.pharmacy_name}</td>
            <td>
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <div class="shortage-meter" style="flex:1;">
                  <div class="shortage-meter__fill" style="width:${pct}%; background:var(--primary);"></div>
                </div>
                <strong>${p.quantity}</strong>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    // Batches
    const batchBody = $('medDetailBatchesBody');
    if (data.batches.length === 0) {
      batchBody.innerHTML = '<tr><td colspan="5" class="empty-state">لا يوجد تشغيلات نشطة</td></tr>';
    } else {
      batchBody.innerHTML = data.batches.map(b => `
        <tr>
          <td><span class="badge badge--purple">${b.batch_no}</span></td>
          <td style="${b.days_until_expiry < 30 ? 'color:var(--danger); font-weight:bold' : ''}">${b.expiry_date}</td>
          <td style="font-weight:bold">${b.quantity}</td>
          <td>${escapeHTML(b.location_name)}</td>
          <td>${getExpiryBadge(b.days_until_expiry)}</td>
        </tr>
      `).join('');
    }

    // Price History Chart
    if ($('medDetailPriceChart')) {
      if (medsPriceHistoryInstance) medsPriceHistoryInstance.destroy();
      const ctx = $('medDetailPriceChart').getContext('2d');
      
      if (data.priceHistory.length === 0) {
        medsPriceHistoryInstance = null;
        ctx.font = '14px Tajawal';
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.fillText('لا يوجد بيانات أسعار', ctx.canvas.width / 2, ctx.canvas.height / 2);
      } else {
        // Group by supplier for multi-line chart
        const suppliers = {};
        const allDates = new Set();
        for (const h of data.priceHistory) {
          if (!suppliers[h.supplier_name]) suppliers[h.supplier_name] = [];
          suppliers[h.supplier_name].push(h);
          allDates.add(h.date_val);
        }
        const sortedDates = Array.from(allDates).sort();
        const colors = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#dc2626'];
        const datasets = [];
        let ci = 0;
        for (const [name, history] of Object.entries(suppliers)) {
          datasets.push({
            label: name,
            data: sortedDates.map(d => { const m = history.find(h => h.date_val === d); return m ? m.price : null; }),
            borderColor: colors[ci % colors.length],
            tension: 0.2,
            spanGaps: true,
            pointRadius: 4,
            pointHoverRadius: 6
          });
          ci++;
        }

        medsPriceHistoryInstance = new Chart(ctx, {
          type: 'line',
          data: { labels: sortedDates, datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' } },
            scales: { y: { beginAtZero: false } }
          }
        });
      }
    }

    // Supplier Offers
    const offersBody = $('medDetailOffersBody');
    if (data.currentOffers.length === 0) {
      offersBody.innerHTML = '<tr><td colspan="3" class="empty-state">لا يوجد عروض حالية</td></tr>';
    } else {
      offersBody.innerHTML = data.currentOffers.map((o, i) => `
        <tr${i === 0 ? ' style="background:var(--success-light)"' : ''}>
          <td style="font-weight:bold">${escapeHTML(o.supplier_name)}${i === 0 ? ' 🏆' : ''}</td>
          <td style="font-weight:bold; color:${i === 0 ? 'var(--success)' : 'var(--text-primary)'}">${o.price} ر.س</td>
          <td>${o.condition || '—'}</td>
        </tr>
      `).join('');
    }

    // Movement Log
    const movBody = $('medDetailMovementsBody');
    if (data.movementHistory.length === 0) {
      movBody.innerHTML = '<tr><td colspan="7" class="empty-state">لا يوجد حركات مسجلة</td></tr>';
    } else {
      movBody.innerHTML = data.movementHistory.map(m => {
        const typeMap = { 'IN': 'استلام', 'OUT': 'صرف', 'TRANSFER': 'نقل', 'ADJUSTMENT': 'تعديل' };
        const badgeMap = { 'IN': 'badge--success', 'OUT': 'badge--danger', 'TRANSFER': 'badge--blue', 'ADJUSTMENT': 'badge--amber' };
        return `
          <tr>
            <td style="font-size:0.85rem">${new Date(m.created_at).toLocaleString('ar-SA')}</td>
            <td><span class="badge ${badgeMap[m.movement] || ''}">${typeMap[m.movement] || m.movement}</span></td>
            <td><span class="badge badge--purple">${m.batch_no}</span></td>
            <td style="font-weight:bold">${m.quantity}</td>
            <td>${m.from_name || '—'}</td>
            <td>${m.to_name || '—'}</td>
            <td style="font-size:0.85rem">${m.reference_note || '—'}</td>
          </tr>
        `;
      }).join('');
    }

    analyticsNavigate('medicine-detail');
  } catch (err) {
    showToast('فشل تحميل ملف الدواء', 'error');
  }
}

// ─── Export Utilities ───────────────────────────────────────────────
function exportTableToCSV(tableEl, filename = 'export.csv') {
  if (!tableEl) return;
  const rows = Array.from(tableEl.querySelectorAll('tr'));
  const csvContent = rows.map(row => {
    const cols = Array.from(row.querySelectorAll('th, td'));
    return cols.map(c => `"${c.innerText.replace(/"/g, '""')}"`).join(',');
  }).join('\n');

  // Add BOM for UTF-8 Excel compatibility (Arabic text)
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Init
window.addEventListener('DOMContentLoaded', async () => {
  const savedTab = localStorage.getItem('activeAppTab');
  if (savedTab) {
    switchTab(savedTab);
  }
  
  await loadAll();

  if (savedTab === 'analytics') {
    const savedAnalyticsView = localStorage.getItem('activeAnalyticsView');
    if (savedAnalyticsView && savedAnalyticsView !== 'dashboard') {
      if (savedAnalyticsView === 'warehouse-profile') loadAnalyticsWarehouseProfile();
      else if (savedAnalyticsView === 'importers-profile') loadAnalyticsImportersProfile();
      else if (savedAnalyticsView === 'medicines-profile') loadAnalyticsMedicinesProfile();
      else analyticsNavigate(savedAnalyticsView); 
    }
  }
});
