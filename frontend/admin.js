import { API_BASE } from './config.js';

/* ===========================
   Utilidades de Sesi?n / Auth
=========================== */
const TOKENS = {
  get access() { return localStorage.getItem('accessToken') || ''; },
  get refresh() { return localStorage.getItem('refreshToken') || ''; },
  set(access, refresh) {
    if (access) localStorage.setItem('accessToken', access);
    if (refresh) localStorage.setItem('refreshToken', refresh);
    localStorage.setItem('loggedIn', 'true');
  },
  clear() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('loggedIn');
    localStorage.removeItem('userData');
  }
};

function requireSessionOrRedirect() {
  try {
    const ok = localStorage.getItem('loggedIn') === 'true' && !!TOKENS.access;
    if (!ok) window.location.href = 'login.html';
  } catch (_) {
    window.location.href = 'login.html';
  }
}

async function refreshAccessToken() {
  const refreshToken = TOKENS.refresh;
  if (!refreshToken) return false;
  const resp = await fetch(`${API_BASE}/refresh-token`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ refreshToken })
  });
  if (!resp.ok) return false;
  const data = await resp.json().catch(() => ({}));
  if (data?.accessToken) {
    TOKENS.set(data.accessToken, data.refreshToken || refreshToken);
    return true;
  }
  return false;
}

function getCookie(name){
  try {
    return document.cookie
      .split(';')
      .map(v=>v.trim())
      .filter(Boolean)
      .map(v=>v.split('='))
      .reduce((acc,[k,...rest])=>{ acc[decodeURIComponent(k)]=decodeURIComponent(rest.join('=')); return acc; }, {})[name] || '';
  } catch { return ''; }
}

async function fetchWithAuth(url, opt = {}, retry = true) {
  const headers = new Headers(opt.headers || {});
  if (!headers.has('Content-Type') && opt.body) headers.set('Content-Type', 'application/json');
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (TOKENS.access) headers.set('Authorization', `Bearer ${TOKENS.access}`);
  // CSRF: if server uses cookie-based CSRF protection, send token if present in cookies
  const csrfCandidates = ['XSRF-TOKEN','CSRF-TOKEN','xsrf-token','csrf-token'];
  if (![...headers.keys()].some(k => k.toLowerCase()==='x-csrf-token')){
    for (const ck of csrfCandidates){ const v=getCookie(ck); if (v){ headers.set('X-CSRF-Token', v); break; } }
  }
  const resp = await fetch(url, { credentials: 'include', ...opt, headers });

  if ((resp.status === 401 || resp.status === 403) && retry) {
    const ok = await refreshAccessToken();
    if (ok) return fetchWithAuth(url, opt, false);
    TOKENS.clear();
    window.location.href = 'login.html';
    return new Response(null, { status: resp.status });
  }
  return resp;
}

/* ===========================
   Rutas de API (ajustables)
=========================== */
const ROUTES = {
  categories: () => `${API_BASE}/categorias`,
  category: (id) => `${API_BASE}/categorias/${encodeURIComponent(id)}`,
  categoryPriceAdjust: (id) => `${API_BASE}/categorias/${encodeURIComponent(id)}/ajustar-precios`,
  products: () => `${API_BASE}/productos`,
  product: (id) => `${API_BASE}/productos/${encodeURIComponent(id)}`,
  productDiscount: (id) => `${API_BASE}/productos/${encodeURIComponent(id)}/descuento`,
  stock: (id) => `${API_BASE}/productos/${encodeURIComponent(id)}/stock`, // PATCH {delta, reason}
  messages: () => `${API_BASE}/mensajes`,
  messagesFallback: () => `${API_BASE}/messages`, // fallback si backend usa ingl?s
  message: (id) => `${API_BASE}/mensajes/${encodeURIComponent(id)}`,
  backup: () => `${API_BASE}/backup`,             // POST
  migrate: () => `${API_BASE}/migraciones/run`,   // POST (opcional)
  analyticsOverview: (qs = '') => `${API_BASE}/analytics/overview${qs ? ('?' + qs) : ''}`,
  financeAnalytics: (qs = '') => `${API_BASE}/analytics/finance${qs ? ('?' + qs) : ''}`,
  salesBySeller: (qs = '') => `${API_BASE}/analytics/sales-by-seller${qs ? ('?' + qs) : ''}`,
  salesBySellerDetail: (id, qs = '') => `${API_BASE}/analytics/sales-by-seller/${encodeURIComponent(id)}/detail${qs ? ('?' + qs) : ''}`,
  extraExpenses: (qs = '') => `${API_BASE}/extra-expenses${qs ? ('?' + qs) : ''}`,
  extraExpense: (id) => `${API_BASE}/extra-expenses/${encodeURIComponent(id)}`,
  purchases: () => `${API_BASE}/purchases`,
  purchase: (id) => `${API_BASE}/purchases/${encodeURIComponent(id)}`,
  purchaseStatus: (id) => `${API_BASE}/purchases/${encodeURIComponent(id)}`,
  // Clientes
  clients: (qs = '') => `${API_BASE}/clients${qs ? ('?' + qs) : ''}`,
  client: (id) => `${API_BASE}/clients/${encodeURIComponent(id)}`,
  clientUser: (id) => `${API_BASE}/clients/${encodeURIComponent(id)}/user`,
  // ABM Usuarios
  users: (qs = '') => `${API_BASE}/users${qs ? ('?' + qs) : ''}`,
  user: (id) => `${API_BASE}/users/${encodeURIComponent(id)}`,
  userStatus: (id) => `${API_BASE}/users/${encodeURIComponent(id)}/status`,
  userResetPwd: (id) => `${API_BASE}/users/${encodeURIComponent(id)}/reset-password`,
  userSessionsRevoke: (id) => `${API_BASE}/users/${encodeURIComponent(id)}/sessions/revoke`,
  userAudit: (id) => `${API_BASE}/users/${encodeURIComponent(id)}/audit`,
  userCommission: (id) => `${API_BASE}/users/${encodeURIComponent(id)}/commission`,
  usersCommissionBulk: () => `${API_BASE}/users/commission/bulk`,
  profiles: () => `${API_BASE}/profiles`,
  roles: () => `${API_BASE}/roles`,
  userAssignProfile: (id) => `${API_BASE}/users/${encodeURIComponent(id)}/profiles`,
  userAssignRole: (id) => `${API_BASE}/users/${encodeURIComponent(id)}/roles`,
  userAssignPrimaryRole: (id) => `${API_BASE}/users/${encodeURIComponent(id)}/roles/primary`,
};

/* ===========================
   UI: Message Box (coincide con tu estilo)
=========================== */
function showMessageBox(message, type = 'info') {
  let container = document.getElementById('message-box-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'message-box-container';
    document.body.appendChild(container);
  }

  const existing = container.querySelector('.message-box-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'message-box-overlay show';

  const content = document.createElement('div');
  content.className = 'message-box-content';

  const map = {
    success: { cls: 'bg-green-600', icon: 'fas fa-check-circle' },
    error:   { cls: 'bg-red-600',   icon: 'fas fa-times-circle' },
    warning: { cls: 'bg-yellow-600',icon: 'fas fa-exclamation-triangle' },
    info:    { cls: 'bg-blue-600',  icon: 'fas fa-info-circle' }
  };
  const sty = map[type] || map.info;

  content.innerHTML = `
    <div class="p-6 rounded-lg shadow-xl text-center ${sty.cls}">
      <i class="${sty.icon} text-3xl mb-3"></i>
      <p class="text-xl font-semibold mb-4 text-white">${message}</p>
      <button class="bg-white text-gray-800 font-bold py-2 px-5 rounded-md mt-4 hover:bg-gray-100 transition">Cerrar</button>
    </div>
  `;
  content.querySelector('button')?.addEventListener('click', () => overlay.remove());
  overlay.appendChild(content);
  container.appendChild(overlay);

  if (type !== 'error') {
    setTimeout(() => {
      overlay.classList.remove('show');
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    }, 2500);
  }
}

/* ===========================
   Navegaci?n de secciones
=========================== */
const navButtons = document.querySelectorAll('.nav-button');

function showSection(sectionId) {
  if (sectionId === 'reports') {
    try { ensureReportsSection(); } catch (e) { console.error('ensureReportsSection error', e); }
  }
  const sections = document.querySelectorAll('.section-content');
  sections.forEach(s => s.classList.add('hidden'));
  document.getElementById(sectionId)?.classList.remove('hidden');

  navButtons.forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-button[data-section="${sectionId}"]`)?.classList.add('active');

  // Cargas perezosas por secci?n
  if (sectionId === 'editCategory') {
      try { ensureDeleteButtons('category'); } catch {}
      try { initCategoryPriceAdjustUI(); } catch {}
      loadCategoriesForEdit();
  } else if (sectionId === 'createProduct' || sectionId === 'editProduct') {
    loadCategoriesForProductForms();
    // Asegurar detecci?n de mapeo de claves del backend para crear/editar
    // (inicializa productApiMap para usar snake_case si aplica)
    try { loadProductsForEdit(); } catch {}
    if (sectionId === 'editProduct') { try { ensureDeleteButtons('product'); } catch {} }
  } else if (sectionId === 'manageStock') {
    loadProductsForStockManagement();
  } else if (sectionId === 'messages') {
    loadContactMessages();
  } else if (sectionId === 'orders') {
    loadOrdersAdminServer2();
  } else if (sectionId === 'supplierPurchases') {
    loadPurchases();
  } else if (sectionId === 'customers') {
    try { initCustomersUiOnce(); } catch {}
    loadCustomersAdmin();
  } else if (sectionId === 'finance') {
    loadFinanceDashboard();
  } else if (sectionId === 'reports') {
    loadSalesReportsOverview();
  } else if (sectionId === 'users') {
    try { initUsersUiOnce(); } catch {}
    loadProfilesAndRoles();
    loadUsersList();
  }
}

function bindNav() {
  navButtons.forEach(btn => {
    const id = btn.getAttribute('data-section');
    if (!id) return;
    btn.addEventListener('click', () => showSection(id));
  });
}

/* ===========================
   Referencias del DOM (coinciden con tu HTML)
=========================== */
const logoutButton = document.getElementById('logoutButton');
const migrateDataButton = document.getElementById('migrateDataButton');
const sendVerificationEmailButton = document.getElementById('sendVerificationEmailButton'); // Placeholder (si lo us?s desde backend)

const createCategoryForm = document.getElementById('createCategoryForm');
const selectCategoryToEdit = document.getElementById('selectCategoryToEdit');
const searchCategoryToEditInput = document.getElementById('searchCategoryToEdit');
const editedCategoryNameInput = document.getElementById('editedCategoryName');
const editedCategoryImageUrlInput = document.getElementById('editedCategoryImageUrl');
const saveCategoryChangesButton = document.getElementById('saveCategoryChangesButton');
let deleteCategoryButton = document.getElementById('deleteCategoryButton');

const createProductForm = document.getElementById('createProductForm');
const productCategorySelect = document.getElementById('productCategory');
const productStatusSelect = document.getElementById('productStatus');
const productSpecificationsTextarea = document.getElementById('productSpecifications');
const productWarrantyInput = document.getElementById('productWarranty');

const selectProductToEdit = document.getElementById('selectProductToEdit');
const searchProductToEditInput = document.getElementById('searchProductToEdit');
const editedProductNameInput = document.getElementById('editedProductName');
const editedProductPriceInput = document.getElementById('editedProductPrice');
const editedProductImageUrlInput = document.getElementById('editedProductImageUrl');
const editedProductCategorySelect = document.getElementById('editedProductCategory');
const editedProductDescriptionInput = document.getElementById('editedProductDescription');
const editedProductStockInput = document.getElementById('editedProductStock');
const editedProductComponentsUrlInput = document.getElementById('editedProductComponentsUrl');
const editedProductVideoUrlInput = document.getElementById('editedProductVideoUrl');
const editedProductStatusSelect = document.getElementById('editedProductStatus');
const editedProductSpecificationsTextarea = document.getElementById('editedProductSpecifications');
const editedProductWarrantyInput = document.getElementById('editedProductWarranty');
const editedProductDiscountPercentInput = document.getElementById('editedProductDiscountPercent');
const editedProductDiscountDaysInput = document.getElementById('editedProductDiscountDays');
const editedProductDiscountStartInput = document.getElementById('editedProductDiscountStart');
const editedProductDiscountEndInput = document.getElementById('editedProductDiscountEnd');
const editedProductDiscountSummary = document.getElementById('editedProductDiscountSummary');
const applyProductDiscountButton = document.getElementById('applyProductDiscountButton');
const clearProductDiscountButton = document.getElementById('clearProductDiscountButton');
const saveProductChangesButton = document.getElementById('saveProductChangesButton');
let deleteProductButton = document.getElementById('deleteProductButton');

const selectProductToManageStock = document.getElementById('selectProductToManageStock');
const currentProductStockInput = document.getElementById('currentProductStock');
const stockChangeAmountInput = document.getElementById('stockChangeAmount');
const increaseStockButton = document.getElementById('increaseStockButton');
const decreaseStockButton = document.getElementById('decreaseStockButton');
// Mejoras de stock: tablas de inventario y tránsito
const inventoryTableBody = document.getElementById('inventoryTableBody');
const inventoryCountEl = document.getElementById('inventoryCount');
const transitTableBody = document.getElementById('transitTableBody');
const addTransitProductSelect = document.getElementById('addTransitProductSelect');
const addTransitQtyInput = document.getElementById('addTransitQtyInput');
const addTransitButton = document.getElementById('addTransitButton');
const inventorySearchInput = document.getElementById('inventorySearch');
let stockProductsCache = [];
function normalizeStockText(s) {
  try {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    return String(s || '').toLowerCase();
  }
}

function applyStockSearchFilter() {
  const base = Array.isArray(stockProductsCache) ? stockProductsCache : [];
  const qRaw = inventorySearchInput ? inventorySearchInput.value : '';
  const q = normalizeStockText(qRaw);
  const filtered = q ? base.filter(p => normalizeStockText(p.name).includes(q)) : base;
  try { renderInventoryTable(filtered); } catch {}
  if (addTransitProductSelect) {
    addTransitProductSelect.innerHTML = '<option value="">-- Selecciona un producto --</option>';
    filtered.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      addTransitProductSelect.appendChild(opt);
    });
  }
  try { renderTransitTable(filtered); } catch {}
}

if (inventorySearchInput) {
  inventorySearchInput.addEventListener('input', () => applyStockSearchFilter());
}

// Finanzas
const financeRevenueEl = document.getElementById('financeRevenue');
const financePurchasesEl = document.getElementById('financePurchases');
// Clientes
const customersSearchInput = document.getElementById('customersSearch');
const customersTaxIdInput = document.getElementById('customersTaxId');
  const customersStatusSelect = document.getElementById('customersStatus');
  const customersTypeSelect = document.getElementById('customersType');
  const customersTableBody = document.getElementById('customersTableBody');
  const customersDetailBox = document.getElementById('customersDetail');
  const customersDetailContent = document.getElementById('customersDetailContent');
  // Reportes de ventas por vendedor (se inicializa lazy desde JS)
  let reportsPeriodEl = document.getElementById('reportsPeriod');
  let reportsDateEl = document.getElementById('reportsDate');
  let reportsCommissionEl = document.getElementById('reportsCommission');
  let reportsRefreshBtn = document.getElementById('reportsRefreshBtn');
  let reportsStatusEl = document.getElementById('reportsStatus');
  let reportsTableBody = document.getElementById('reportsTableBody');

/* ===========================
   Gestion de Usuarios (ABM)
=========================== */
let usersUiBound = false;
function initUsersUiOnce(){
  if (usersUiBound) return;
  usersUiBound = true;
  const btnToggle = document.getElementById('newUserToggle');
  const form = document.getElementById('createUserForm');
  const btnCancel = document.getElementById('cancelCreateUser');
  const btnSearch = document.getElementById('searchUsersButton');
  const btnSave = document.getElementById('saveUserChanges');
  const btnAssignPrimary = document.getElementById('assignPrimaryRole');
  const btnAssignSecondary = document.getElementById('assignSecondaryRole');
  const btnAssignRole = document.getElementById('assignRole');
  const btnResetPwd = document.getElementById('resetPasswordBtn');
  const btnRevoke = document.getElementById('revokeSessionsBtn');

  btnToggle?.addEventListener('click', ()=>{ form?.classList.toggle('hidden'); });
  btnCancel?.addEventListener('click', ()=>{ form?.classList.add('hidden'); });
  btnSearch?.addEventListener('click', ()=> loadUsersList());
  form?.addEventListener('submit', onCreateUserSubmit);
  btnSave?.addEventListener('click', onSaveUserChanges);
  btnAssignPrimary?.addEventListener('click', onAssignPrimaryRole);
  btnAssignSecondary?.addEventListener('click', onAssignSecondaryRole);
  btnAssignRole?.addEventListener('click', onAssignRole);
  btnResetPwd?.addEventListener('click', onResetPassword);
  btnRevoke?.addEventListener('click', onRevokeSessions);
}

/* ===========================
   Clientes (Listado / consulta)
=========================== */
let customersUiBound = false;
function initCustomersUiOnce(){
  if (customersUiBound) return;
  customersUiBound = true;
  const btnSearch = document.getElementById('searchCustomersButton');
  const btnReset = document.getElementById('resetCustomersButton');
  btnSearch?.addEventListener('click', () => loadCustomersAdmin());
  btnReset?.addEventListener('click', () => {
    if (customersSearchInput) customersSearchInput.value = '';
    if (customersTaxIdInput) customersTaxIdInput.value = '';
    if (customersStatusSelect) customersStatusSelect.value = '';
    if (customersTypeSelect) customersTypeSelect.value = '';
    loadCustomersAdmin();
  });
  // Delegación de clicks en la tabla de clientes (ver detalle / activar / historial)
  if (customersTableBody) {
    customersTableBody.addEventListener('click', onCustomersTableClick);
  }
}

function readCustomersFilters(){
  const params = new URLSearchParams();
  const q = customersSearchInput?.value.trim() || '';
  const taxId = customersTaxIdInput?.value.trim().replace(/\\D+/g,'') || '';
  const status = customersStatusSelect?.value || '';
  const clientType = customersTypeSelect?.value || '';
  if (q) params.set('q', q);
  if (taxId) params.set('taxId', taxId);
  if (status) params.set('status', status);
  if (clientType) params.set('clientType', clientType);
  return params.toString();
}

async function loadCustomersAdmin(){
  if (!customersTableBody) return;
  try {
    const qs = readCustomersFilters();
    const resp = await fetchWithAuth(ROUTES.clients(qs));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const rows = await resp.json();
    customersTableBody.innerHTML = '';
    (rows || []).forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="px-3 py-2 font-mono text-xs text-gray-300">${escapeHtml(c.code||'')}</td>
        <td class="px-3 py-2">${escapeHtml(c.name||'')}</td>
        <td class="px-3 py-2">${escapeHtml(c.tax_id||'')}</td>
        <td class="px-3 py-2 text-gray-300">${escapeHtml(c.email||'')}</td>
        <td class="px-3 py-2">${escapeHtml(c.phone||'')}</td>
        <td class="px-3 py-2">
          <span class="px-2 py-1 rounded-full text-xs ${c.status==='ACTIVE' ? 'bg-green-700 text-green-100' : 'bg-gray-700 text-gray-200'}">
            ${escapeHtml(c.status||'')}
          </span>
        </td>
        <td class="px-3 py-2 text-center">
          <div class="flex flex-wrap gap-2 justify-center">
            <button class="action-button bg-sky-600 hover:bg-sky-700 text-xs" data-act="detail" data-id="${c.id}">Ver detalle</button>
            <button class="action-button ${c.status==='ACTIVE'?'bg-red-600 hover:bg-red-700':'bg-green-600 hover:bg-green-700'} text-xs" data-act="toggle" data-id="${c.id}">
              ${c.status==='ACTIVE' ? 'Desactivar' : 'Activar'}
            </button>
            <button class="action-button bg-indigo-600 hover:bg-indigo-700 text-xs" data-act="orders" data-id="${c.id}">Historial</button>
          </div>
        </td>`;
      customersTableBody.appendChild(tr);
    });
  } catch (err) {
    console.error('loadCustomersAdmin', err);
    showMessageBox('No se pudieron cargar clientes', 'error');
  }
}

async function onCustomersTableClick(e){
  const btn = e.target?.closest('button[data-act]');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  const act = btn.getAttribute('data-act');
  if (!id) return;
  if (act === 'detail') {
    return loadCustomerDetail(id);
  }
  if (act === 'toggle') {
    return toggleCustomerStatus(id);
  }
  if (act === 'orders') {
    return loadCustomerOrders(id);
  }
}

async function loadCustomerDetail(id){
  try {
    const resp = await fetchWithAuth(ROUTES.client(id));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const c = await resp.json();
    if (!customersDetailBox || !customersDetailContent) return;
    customersDetailContent.innerHTML = `
      <div><span class="font-semibold">Código:</span> ${escapeHtml(c.code||'')}</div>
      <div><span class="font-semibold">Nombre:</span> ${escapeHtml(c.name||'')}</div>
      <div><span class="font-semibold">Nombre fantasía:</span> ${escapeHtml(c.fantasy_name||'')}</div>
      <div><span class="font-semibold">Tipo:</span> ${escapeHtml(c.client_type||'')}</div>
      <div><span class="font-semibold">Documento:</span> ${escapeHtml(c.tax_id||'')} ${escapeHtml(c.tax_id_type||'')}</div>
      <div><span class="font-semibold">Condición IVA:</span> ${escapeHtml(c.iva_condition||'')}</div>
      <div><span class="font-semibold">Email:</span> ${escapeHtml(c.email||'')}</div>
      <div><span class="font-semibold">Teléfono:</span> ${escapeHtml(c.phone||'')}</div>
      <div><span class="font-semibold">Dirección:</span> ${escapeHtml(c.address||'')}</div>
      <div><span class="font-semibold">Localidad:</span> ${escapeHtml(c.locality||'')}</div>
      <div><span class="font-semibold">Provincia:</span> ${escapeHtml(c.province||'')}</div>
      <div><span class="font-semibold">Código Postal:</span> ${escapeHtml(c.postal_code||'')}</div>
      <div><span class="font-semibold">Contacto:</span> ${escapeHtml(c.contact_name||'')}</div>
      <div><span class="font-semibold">Límite de crédito:</span> ${c.credit_limit != null ? ('$' + Number(c.credit_limit).toFixed(2)) : '-'}</div>
      <div><span class="font-semibold">Estado:</span> ${escapeHtml(c.status||'')}</div>
      <div><span class="font-semibold">Fecha alta:</span> ${c.created_at ? escapeHtml(new Date(c.created_at).toLocaleString()) : '-'}</div>
      <div><span class="font-semibold">Notas:</span> ${escapeHtml(c.notes||'')}</div>
    `;
    customersDetailBox.classList.remove('hidden');

    // Cargar panel de usuario asociado
    try { await loadCustomerUserPanel(id); } catch (e) { console.error('loadCustomerUserPanel', e); }
  } catch (err) {
    console.error('loadCustomerDetail', err);
    showMessageBox('No se pudo cargar el detalle del cliente', 'error');
  }
}

async function loadCustomerUserPanel(clientId){
  if (!customersDetailContent) return;
  try {
    const resp = await fetchWithAuth(ROUTES.clientUser(clientId));
    if (!resp.ok) {
      // Si no hay endpoint o no autorizado, no bloquear detalle
      return;
    }
    const data = await resp.json().catch(() => null);
    if (!data) return;

    let html = '<hr class="my-3 border-slate-700" />';
    html += '<div class="mt-2">';
    html += '<div class="font-semibold mb-2 text-blue-300">Usuario de acceso del cliente</div>';

    if (!data.user) {
      const email = escapeHtml(data.clientEmail || '');
      html += `<div class="text-xs text-gray-400 mb-2">Este cliente aún no tiene un usuario para iniciar sesión. Podés crearlo desde aquí.</div>`;
      html += `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
          <div>
            <label class="block text-xs mb-1">Email de usuario</label>
            <input id="customerUserEmail" type="email" class="input-field py-1.5 px-2 text-xs" placeholder="email@cliente.com" value="${email}">
          </div>
          <div>
            <label class="block text-xs mb-1">Contraseña</label>
            <input id="customerUserPassword" type="password" class="input-field py-1.5 px-2 text-xs" placeholder="Mínimo 8 caracteres">
          </div>
          <div>
            <label class="block text-xs mb-1">Repetir contraseña</label>
            <input id="customerUserPassword2" type="password" class="input-field py-1.5 px-2 text-xs" placeholder="Repetir contraseña">
          </div>
        </div>
        <div class="flex justify-end">
          <button id="customerUserCreateBtn" class="action-button bg-emerald-600 hover:bg-emerald-700 text-xs">Crear usuario</button>
        </div>
      `;
    } else {
      const u = data.user;
      html += `
        <div class="mb-2 text-sm">
          <div><span class="font-semibold">Usuario:</span> ${escapeHtml(u.email || '')}</div>
          <div><span class="font-semibold">Estado:</span> ${escapeHtml(u.status || '')}</div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
          <div>
            <label class="block text-xs mb-1">Nueva contraseña</label>
            <input id="customerUserNewPassword" type="password" class="input-field py-1.5 px-2 text-xs" placeholder="Mínimo 8 caracteres">
          </div>
          <div>
            <label class="block text-xs mb-1">Repetir contraseña</label>
            <input id="customerUserNewPassword2" type="password" class="input-field py-1.5 px-2 text-xs" placeholder="Repetir contraseña">
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <button id="customerUserResetPwdBtn" class="action-button bg-indigo-600 hover:bg-indigo-700 text-xs" data-user-id="${u.id}">Cambiar contraseña</button>
        </div>
      `;
    }

    html += '</div>';

    // Append panel (no borrar detalle existente)
    customersDetailContent.insertAdjacentHTML('beforeend', html);

    // Bind create user
    const createBtn = document.getElementById('customerUserCreateBtn');
    if (createBtn && !createBtn.dataset.bound) {
      createBtn.dataset.bound = '1';
      createBtn.addEventListener('click', async () => {
        const emailInput = document.getElementById('customerUserEmail');
        const pwdInput = document.getElementById('customerUserPassword');
        const pwd2Input = document.getElementById('customerUserPassword2');
        const email = emailInput?.value.trim() || '';
        const pwd = pwdInput?.value || '';
        const pwd2 = pwd2Input?.value || '';
        if (!email || !/.+@.+\..+/.test(email)) {
          showMessageBox('Ingresá un email válido', 'warning');
          return;
        }
        if (!pwd || pwd.length < 8) {
          showMessageBox('La contraseña debe tener al menos 8 caracteres', 'warning');
          return;
        }
        if (pwd !== pwd2) {
          showMessageBox('Las contraseñas no coinciden', 'warning');
          return;
        }
        try {
          const resp = await fetchWithAuth(ROUTES.clientUser(clientId), {
            method: 'POST',
            body: JSON.stringify({ email, password: pwd }),
          });
          if (!resp.ok) {
            let msg = 'No se pudo crear el usuario del cliente';
            try {
              const dataErr = await resp.json();
              if (dataErr && dataErr.error) msg = dataErr.error;
            } catch {}
            showMessageBox(msg, 'error');
            return;
          }
          showMessageBox('Usuario creado y vinculado al cliente', 'success');
          // Recargar detalle para mostrar el panel de cambio de contraseña
          loadCustomerDetail(clientId);
        } catch (err) {
          console.error('create client user', err);
          showMessageBox('No se pudo crear el usuario del cliente', 'error');
        }
      });
    }

    const resetBtn = document.getElementById('customerUserResetPwdBtn');
    if (resetBtn && !resetBtn.dataset.bound) {
      resetBtn.dataset.bound = '1';
      resetBtn.addEventListener('click', async () => {
        const userId = resetBtn.getAttribute('data-user-id');
        const pwdInput = document.getElementById('customerUserNewPassword');
        const pwd2Input = document.getElementById('customerUserNewPassword2');
        const pwd = pwdInput?.value || '';
        const pwd2 = pwd2Input?.value || '';
        if (!pwd || pwd.length < 8) {
          showMessageBox('La contraseña debe tener al menos 8 caracteres', 'warning');
          return;
        }
        if (pwd !== pwd2) {
          showMessageBox('Las contraseñas no coinciden', 'warning');
          return;
        }
        try {
          const resp = await fetchWithAuth(ROUTES.userResetPwd(userId), {
            method: 'POST',
            body: JSON.stringify({ tempPassword: pwd }),
          });
          if (!resp.ok) {
            let msg = 'No se pudo cambiar la contraseña del usuario';
            try {
              const dataErr = await resp.json();
              if (dataErr && dataErr.error) msg = dataErr.error;
            } catch {}
            showMessageBox(msg, 'error');
            return;
          }
          showMessageBox('Contraseña actualizada para el usuario del cliente', 'success');
        } catch (err) {
          console.error('reset client user password', err);
          showMessageBox('No se pudo cambiar la contraseña del usuario', 'error');
        }
      });
    }
  } catch (err) {
    console.error('loadCustomerUserPanel', err);
  }
}

async function toggleCustomerStatus(id){
  try {
    const resp = await fetchWithAuth(`${ROUTES.client(id)}/status`, { method: 'PATCH' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json().catch(()=>({}));
    showMessageBox(`Cliente ${data.status === 'ACTIVE' ? 'activado' : 'desactivado'}`, 'success');
    loadCustomersAdmin();
  } catch (err) {
    console.error('toggleCustomerStatus', err);
    showMessageBox('No se pudo cambiar el estado del cliente', 'error');
  }
}

async function loadCustomerOrders(id){
  try {
    const resp = await fetchWithAuth(`${ROUTES.client(id)}/orders`);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    if (!customersDetailBox || !customersDetailContent) return;

    const orders = Array.isArray(data.orders) ? data.orders : [];
    let html = `
      <div class="mb-2">
        <div><span class="font-semibold">Cliente:</span> ${escapeHtml(data.client?.code || '')} - ${escapeHtml(data.client?.name || '')}</div>
        <div><span class="font-semibold">Documento:</span> ${escapeHtml(data.client?.tax_id || '')}</div>
        <div><span class="font-semibold">Total de compras:</span> ${orders.length}</div>
      </div>
    `;
    if (!orders.length) {
      html += '<div class="text-gray-400">Este cliente aún no tiene compras registradas.</div>';
    } else {
      html += '<div class="mt-2 space-y-3 max-h-64 overflow-auto">';
      for (const o of orders){
        const when = o.order_date ? new Date(o.order_date).toLocaleString() : '-';
        const items = Array.isArray(o.items) ? o.items : [];
        html += `
          <div class="border border-slate-700 rounded-md p-2">
            <div class="flex justify-between text-sm">
              <div><span class="font-semibold">Nº orden:</span> ${escapeHtml(o.order_number || String(o.id || ''))}</div>
              <div><span class="font-semibold">Fecha:</span> ${escapeHtml(when)}</div>
            </div>
            <div class="text-sm"><span class="font-semibold">Estado:</span> ${escapeHtml(o.status || '')}</div>
            <div class="text-sm mb-1"><span class="font-semibold">Total:</span> $${o.total_amount != null ? Number(o.total_amount).toFixed(2) : '-'}</div>
            <div class="text-xs text-gray-300">
              <div class="font-semibold mb-1">Productos:</div>
              ${items.map(it => `
                <div class="flex justify-between">
                  <span>${escapeHtml(it.product_name || '')}</span>
                  <span>x${it.quantity} @ $${Number(it.unit_price || 0).toFixed(2)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
      html += '</div>';
    }

    customersDetailContent.innerHTML = html;
    customersDetailBox.classList.remove('hidden');
  } catch (err) {
    console.error('loadCustomerOrders', err);
    showMessageBox('No se pudo cargar el historial de compras del cliente', 'error');
  }
}

async function loadProfilesAndRoles(){
  try {
    const rResp = await fetchWithAuth(ROUTES.roles());
    let roles = [];
    if (!rResp.ok) {
      let details = '';
      try { details = await rResp.text(); } catch {}
      console.error('Roles fetch error', rResp.status, details);
      showMessageBox(`Error cargando roles (HTTP ${rResp.status}). Inicia sesión con un usuario con permisos de administración.`, 'error');
    } else {
      try { roles = await rResp.json(); } catch { roles = []; }
    }
    const roleSelects = ['usrPrimaryRole','usrSecondaryRole','editPrimaryRole','editSecondaryRole','usrRoles','editRole']
      .map(id => document.getElementById(id)).filter(Boolean);
    for (const sel of roleSelects){
      sel.innerHTML = sel.multiple ? '' : '<option value="">-- Seleccionar --</option>';
      roles.forEach(r => { const opt = document.createElement('option'); opt.value = r.id; opt.textContent = r.name; sel.appendChild(opt); });
    }
    if (!roles.length) {
      console.warn('No hay roles configurados. Ejecuta npm run seed-rbac');
      showMessageBox('No hay roles configurados. Ejecuta el seed en el servidor (npm run seed-rbac).', 'warning');
    }
  } catch (err) {
    console.error('loadProfilesAndRoles', err);
    showMessageBox('No se pudieron cargar roles', 'error');
  }
}

/* ===========================
   Permisos y gating de UI
=========================== */
let __perms = new Set();
function hasPerm(p){
  if (__perms.has(p)) return true;
  const parts = String(p||'').split('.');
  for (let i = parts.length; i > 0; i--) {
    const ns = parts.slice(0,i).join('.') + '.*';
    if (__perms.has(ns)) return true;
  }
  return false;
}

function setHiddenBySelector(sel, hidden){
  document.querySelectorAll(sel).forEach(el => {
    if (hidden) el.classList.add('hidden'); else el.classList.remove('hidden');
  });
}

async function initPermissionsGates(){
  try {
    const resp = await fetchWithAuth(`${API_BASE}/me`);
    if (resp.ok) {
      const data = await resp.json();
      __perms = new Set(Array.isArray(data.permissions) ? data.permissions : []);
    }
  } catch {}

  // Map secciones -> permiso m�nimo de visibilidad
  const gates = [
    { section: 'createCategory', perm: 'logistica.read' },
    { section: 'editCategory', perm: 'logistica.read' },
    { section: 'createProduct', perm: 'logistica.read' },
    { section: 'editProduct', perm: 'logistica.read' },
    { section: 'manageStock', perm: 'logistica.read' },
    { section: 'orders', perm: 'ventas.read' },
    { section: 'supplierPurchases', perm: 'compras.read' },
    // Clientes: por ahora se controla con administracion.read hasta que definamos permisos clientes.*
    { section: 'customers', perm: 'administracion.read' },
    { section: 'finance', perm: 'administracion.read' },
    { section: 'users', perm: 'administracion.users.read' }
  ];
  gates.forEach(g => {
    const show = hasPerm(g.perm);
    const btn = document.querySelector(`.nav-button[data-section="${g.section}"]`);
    if (btn) btn.classList.toggle('hidden', !show);
    const sec = document.getElementById(g.section);
    if (sec && !show) sec.classList.add('hidden');
  });
  // Regla especial: reports visible si tiene ventas.read O administracion.read
  const canSeeReports = hasPerm('ventas.read') || hasPerm('administracion.read');
  const repBtn = document.querySelector('.nav-button[data-section="reports"]');
  if (repBtn) repBtn.classList.toggle('hidden', !canSeeReports);
  const repSec = document.getElementById('reports');
  if (repSec && !canSeeReports) repSec.classList.add('hidden');

  // Limitar acciones de edici�n si no hay logistica.write
  if (!hasPerm('logistica.write')){
    ['saveCategoryChangesButton','saveProductChangesButton','increaseStockButton','decreaseStockButton'].forEach(id=>{
      const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });
    const createCategoryForm = document.getElementById('createCategoryForm');
    if (createCategoryForm) createCategoryForm.classList.add('hidden');
    const createProductForm = document.getElementById('createProductForm');
    if (createProductForm) createProductForm.classList.add('hidden');
  }

  // Elegir primera secci�n visible como activa
  const firstVisible = Array.from(document.querySelectorAll('.nav-button[data-section]')).find(b => !b.classList.contains('hidden'));
  if (firstVisible) {
    const id = firstVisible.getAttribute('data-section');
    showSection(id);
  }
}

// Inicializar gating al cargar
try { initPermissionsGates(); } catch {}

function readUsersFilters(){
  const q = document.getElementById('usersSearch')?.value.trim() || '';
  const status = document.getElementById('usersStatus')?.value || '';
  const dept = document.getElementById('usersDeptFilter')?.value.trim() || '';
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  if (dept) params.set('dept', dept);
  return params.toString();
}

async function loadUsersList(){
  try {
    const qs = readUsersFilters();
    const resp = await fetchWithAuth(ROUTES.users(qs));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const rows = await resp.json();
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';
    (rows || []).forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="px-3 py-2">${escapeHtml(u.name||'')}</td>
        <td class="px-3 py-2 text-gray-300">${escapeHtml(u.email||'')}</td>
        <td class="px-3 py-2">${escapeHtml(u.username||'')}</td>
        <td class="px-3 py-2">${escapeHtml(u.department||'')}</td>
        <td class="px-3 py-2">${escapeHtml(u.position||'')}</td>
        <td class="px-3 py-2">${escapeHtml(u.status||'')}</td>
        <td class="px-3 py-2 flex flex-wrap gap-2">
          <button class="action-button bg-sky-600 hover:bg-sky-700" data-act="edit" data-id="${u.id}">Editar</button>
          <button class="action-button bg-yellow-600 hover:bg-yellow-700" data-act="audit" data-id="${u.id}">Historial</button>
          <button class="action-button ${u.status==='ACTIVE'?'bg-red-600 hover:bg-red-700':'bg-green-600 hover:bg-green-700'}" data-act="toggle" data-id="${u.id}">${u.status==='ACTIVE'?'Desactivar':'Activar'}</button>
          <button class="action-button bg-red-800 hover:bg-red-900" data-act="delete" data-id="${u.id}">Eliminar</button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.addEventListener('click', onUsersTableClick, { once: true });
  } catch (err) {
    console.error('loadUsersList', err);
    showMessageBox('No se pudo cargar usuarios', 'error');
  }
}

function onUsersTableClick(e){
  const btn = e.target?.closest('button[data-act]');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  const act = btn.getAttribute('data-act');
  if (act === 'edit') loadUserForEdit(id);
  else if (act === 'toggle') toggleUserStatus(id);
  else if (act === 'audit') loadUserAudit(id);
  else if (act === 'delete') deleteUser(id);
  // rebind for next clicks
  document.getElementById('usersTableBody')?.addEventListener('click', onUsersTableClick, { once: true });
}



async function onCreateUserSubmit(ev){
  ev.preventDefault();
  try {
    const name = document.getElementById('usrName')?.value.trim();
    const email = document.getElementById('usrEmail')?.value.trim();
    if (!name || !email) { showMessageBox('Completa nombre y email', 'warning'); return; }
    const payload = {
      name,
      email,
      username: document.getElementById('usrUsername')?.value.trim() || null,
      department: document.getElementById('usrDept')?.value.trim() || null,
      position: document.getElementById('usrPos')?.value.trim() || null,
      status: document.getElementById('usrStatus')?.value || 'ACTIVE',
      tempPassword: document.getElementById('usrTempPwd')?.value || 'Temp#2025',
      roles: [...document.getElementById('usrRoles')?.selectedOptions || []].map(o=>Number(o.value)).filter(n=>n>0),
    };
    const exp = document.getElementById('usrExpiresAt')?.value;
    if (exp) payload.expiresAt = exp;
    const primaryRole = Number(document.getElementById('usrPrimaryRole')?.value||0) || null;
    const secondaryRole = Number(document.getElementById('usrSecondaryRole')?.value||0) || null;

    const resp = await fetchWithAuth(ROUTES.users(), { method: 'POST', body: JSON.stringify(payload) });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const id = data?.id;
    if (id && primaryRole) {
      await fetchWithAuth(ROUTES.userAssignPrimaryRole(id), { method: 'POST', body: JSON.stringify({ roleId: primaryRole }) });
    }
    if (id && secondaryRole){
      await fetchWithAuth(ROUTES.userAssignRole(id), { method: 'POST', body: JSON.stringify({ roleId: secondaryRole }) });
    }
    showMessageBox('Usuario creado', 'success');
    document.getElementById('createUserForm')?.classList.add('hidden');
    loadUsersList();
  } catch (err) {
    console.error('create user', err);
    showMessageBox('No se pudo crear el usuario', 'error');
  }
}

async function loadUserForEdit(id){
  try {
    const resp = await fetchWithAuth(ROUTES.user(id));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const u = await resp.json();
    document.getElementById('editUserPanel')?.classList.remove('hidden');
    document.getElementById('editUserId').value = u.id;
    document.getElementById('editName').value = u.name||'';
    document.getElementById('editEmail').value = u.email||'';
    document.getElementById('editUsername').value = u.username||'';
    document.getElementById('editDept').value = u.department||'';
    document.getElementById('editPos').value = u.position||'';
    document.getElementById('editStatus').value = u.status||'ACTIVE';
    if (u.expires_at) {
      const d = new Date(u.expires_at); const y=d.getFullYear(); const m=(d.getMonth()+1+'').padStart(2,'0'); const day=(''+d.getDate()).padStart(2,'0');
      document.getElementById('editExpiresAt').value = `${y}-${m}-${day}`;
    } else {
      document.getElementById('editExpiresAt').value = '';
    }
    // preload audit
    loadUserAudit(id);
  } catch (err) {
    console.error('load user', err);
    showMessageBox('No se pudo cargar el usuario', 'error');
  }
}

async function onSaveUserChanges(){
  try {
    const id = document.getElementById('editUserId').value;
    const payload = {
      name: document.getElementById('editName').value,
      email: document.getElementById('editEmail').value,
      username: document.getElementById('editUsername').value,
      department: document.getElementById('editDept').value,
      position: document.getElementById('editPos').value,
      status: document.getElementById('editStatus').value,
      expiresAt: document.getElementById('editExpiresAt').value || null,
    };
    const resp = await fetchWithAuth(ROUTES.user(id), { method: 'PUT', body: JSON.stringify(payload) });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    showMessageBox('Cambios guardados', 'success');
    loadUsersList();
  } catch (err) {
    console.error('save user', err);
    showMessageBox('No se pudo guardar', 'error');
  }
}

async function toggleUserStatus(id){
  try {
    // Fetch current row status from table text if needed; alternatively, retrieve user and invert
    const respUser = await fetchWithAuth(ROUTES.user(id));
    if (!respUser.ok) throw new Error('HTTP ' + respUser.status);
    const u = await respUser.json();
    const active = String(u.status||'') !== 'ACTIVE';
    const resp = await fetchWithAuth(ROUTES.userStatus(id), { method: 'PATCH', body: JSON.stringify({ active }) });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    showMessageBox(active ? 'Usuario activado' : 'Usuario desactivado', 'success');
    loadUsersList();
  } catch (err) {
    console.error('toggle user', err);
    showMessageBox('No se pudo cambiar el estado', 'error');
  }
}

async function deleteUser(id){
  try {
    if (!id) return;
    const ok = window.confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.');
    if (!ok) return;
    const resp = await fetchWithAuth(ROUTES.user(id), { method: 'DELETE' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    showMessageBox('Usuario eliminado', 'success');
    loadUsersList();
  } catch (err) {
    console.error('delete user', err);
    showMessageBox('No se pudo eliminar el usuario', 'error');
  }
}

async function onAssignPrimaryRole(){
  try {
    const id = document.getElementById('editUserId').value;
    const rid = Number(document.getElementById('editPrimaryRole')?.value||0);
    if (!rid) { showMessageBox('Selecciona un rol', 'warning'); return; }
    const resp = await fetchWithAuth(ROUTES.userAssignPrimaryRole(id), { method: 'POST', body: JSON.stringify({ roleId: rid }) });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    showMessageBox('Rol principal asignado', 'success');
  } catch (err) {
    console.error('assign primary role', err);
    showMessageBox('No se pudo asignar el rol', 'error');
  }
}

async function onAssignSecondaryRole(){
  try {
    const id = document.getElementById('editUserId').value;
    const rid = Number(document.getElementById('editSecondaryRole')?.value||0);
    if (!rid) { showMessageBox('Selecciona un rol', 'warning'); return; }
    const resp = await fetchWithAuth(ROUTES.userAssignRole(id), { method: 'POST', body: JSON.stringify({ roleId: rid }) });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    showMessageBox('Rol secundario agregado', 'success');
  } catch (err) {
    console.error('assign secondary role', err);
    showMessageBox('No se pudo asignar el rol', 'error');
  }
}

async function onAssignRole(){
  try {
    const id = document.getElementById('editUserId').value;
    const rid = Number(document.getElementById('editRole')?.value||0);
    if (!rid) { showMessageBox('Selecciona un rol', 'warning'); return; }
    const resp = await fetchWithAuth(ROUTES.userAssignRole(id), { method: 'POST', body: JSON.stringify({ roleId: rid }) });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    showMessageBox('Rol asignado', 'success');
  } catch (err) {
    console.error('assign role', err);
    showMessageBox('No se pudo asignar', 'error');
  }
}

async function onResetPassword(){
  try {
    const id = document.getElementById('editUserId').value;
    const temp = document.getElementById('editTempPwd')?.value || 'Temp#2025';
    const resp = await fetchWithAuth(ROUTES.userResetPwd(id), { method: 'POST', body: JSON.stringify({ tempPassword: temp }) });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    showMessageBox('Contrase1a reseteada', 'success');
  } catch (err) {
    console.error('reset pwd', err);
    showMessageBox('No se pudo resetear', 'error');
  }
}

async function onRevokeSessions(){
  try {
    const id = document.getElementById('editUserId').value;
    const resp = await fetchWithAuth(ROUTES.userSessionsRevoke(id), { method: 'POST', body: JSON.stringify({ all: true }) });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    showMessageBox('Sesiones revocadas', 'success');
  } catch (err) {
    console.error('revoke sessions', err);
    showMessageBox('No se pudo revocar', 'error');
  }
}

async function loadUserAudit(id){
  try {
    const resp = await fetchWithAuth(ROUTES.userAudit(id));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const rows = await resp.json();
    const box = document.getElementById('userAuditList');
    box.innerHTML = '';
    (rows||[]).forEach(r => {
      const div = document.createElement('div');
      const t = new Date(r.created_at || r.createdAt || Date.now()).toLocaleString();
      div.textContent = `[${t}] ${r.action} ${r.entity_type||''}#${r.entity_id||''}`;
      box.appendChild(div);
    });
  } catch (err) {
    console.error('audit', err);
    showMessageBox('No se pudo cargar el historial', 'error');
  }
}
const financeGrossEl = document.getElementById('financeGross');
const financeFromEl = document.getElementById('financeFrom');
const financeToEl = document.getElementById('financeTo');
const financeRefreshBtn = document.getElementById('financeRefreshBtn');
const financeStatusEl = document.getElementById('financeStatus');
const financeTodayBtn = document.getElementById('financeTodayBtn');
const financeWeekBtn = document.getElementById('financeWeekBtn');
const financeMonthBtn = document.getElementById('financeMonthBtn');

/* ===========================
   Helpers
=========================== */
function currency(n){ try { return new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', minimumFractionDigits:0, maximumFractionDigits:0 }).format(Number(n||0)); } catch { return `$${n}`; } }
const ORDERS_KEY = 'ens_orders_v1';
function loadLocalOrders(){ try { const raw = localStorage.getItem(ORDERS_KEY); const arr = JSON.parse(raw||'[]'); return Array.isArray(arr)?arr:[]; } catch { return []; } }
function saveLocalOrders(list){ try { localStorage.setItem(ORDERS_KEY, JSON.stringify(list||[])); } catch {} }
// Ocultaci?n local de ?rdenes (para cuando el backend no permite DELETE)
const HIDDEN_ORDERS_KEY = 'ens_orders_hidden_v1';
function loadHiddenOrders(){ try { const raw = localStorage.getItem(HIDDEN_ORDERS_KEY); const arr = JSON.parse(raw||'[]'); return Array.isArray(arr)?arr:[]; } catch { return []; } }
function saveHiddenOrders(list){ try { localStorage.setItem(HIDDEN_ORDERS_KEY, JSON.stringify(list||[])); } catch {} }
// Helper para obtener ventas por vendedor desde backend (reportes)
async function fetchSalesBySeller(fromIso, toIso){
  const params = new URLSearchParams();
  if (fromIso) params.set('from', fromIso);
  if (toIso) params.set('to', toIso);
  const qs = params.toString();
  const resp = await fetchWithAuth(ROUTES.salesBySeller(qs));
  if (!resp || !resp.ok) {
    const status = resp ? resp.status : 'NO_RESPONSE';
    throw new Error('salesBySeller HTTP ' + status);
  }
  const data = await resp.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

function parseDateInputToRange(value, endOfDay) {
  if (!value) return null;
  // value esperado: 'YYYY-MM-DD' proveniente de <input type="date">
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  // Normalizamos en UTC para alinear front y backend al filtrar por fecha.
  const d = endOfDay
    ? new Date(Date.UTC(year, month, day, 23, 59, 59, 999))
    : new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  return isNaN(d.getTime()) ? null : d;
}

// Crea dinámicamente la sección de reportes si no existe aún
let __reportsSectionReady = false;
function ensureReportsSection(){
  if (__reportsSectionReady) return;
  const container = document.getElementById('sectionsContainer');
  if (!container) return;

  let section = document.getElementById('reports');
  if (!section) {
    section = document.createElement('div');
    section.id = 'reports';
    section.className = 'section-content hidden';
    section.innerHTML = `
      <h2 class="text-3xl font-bold text-center mb-6 text-blue-300">Reportes de Ventas por Vendedor</h2>
      <p class="text-center text-gray-400 mb-6">
        Consulta las ventas totales por vendedor en un rango de fechas y calcula la comisión según un porcentaje.
      </p>
      <div class="grid md:grid-cols-4 gap-4 items-end mb-6">
        <div>
          <label class="block text-sm text-gray-400 mb-1">Período</label>
          <select id="reportsPeriod" class="input-field">
            <option value="day">Hoy / Día</option>
            <option value="week">Semana</option>
            <option value="month" selected>Mes</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-1">Fecha base</label>
          <input id="reportsDate" type="date" class="input-field">
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-1">% Comisión</label>
          <input id="reportsCommission" type="number" step="0.01" min="0" class="input-field" value="1">
        </div>
        <div class="md:col-span-1 flex gap-3">
          <button id="reportsRefreshBtn" class="action-button bg-sky-600 hover:bg-sky-700 flex-1">Actualizar</button>
          <span id="reportsStatus" class="text-gray-400 self-center text-sm"></span>
        </div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4 text-xs md:text-sm">
        <div class="text-gray-400">
          Edita la comision por vendedor o aplica un mismo porcentaje a varios seleccionados.
        </div>
        <div class="flex items-center gap-2">
          <span class="text-gray-300">% para seleccionados:</span>
          <input id="reportsBulkCommission" type="number" step="0.01" min="0" class="input-field w-24 py-1 px-2 text-xs" placeholder="5">
          <button id="reportsBulkApplyBtn" class="action-button bg-emerald-600 hover:bg-emerald-700 text-xs px-3 py-1">Aplicar</button>
        </div>
      </div>
      <div class="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
        <table class="min-w-full text-sm">
          <thead class="bg-white/10 text-gray-300">
            <tr>
              <th class="px-2 py-2 text-center">
                <input id="reportsSelectAll" type="checkbox" class="h-4 w-4 text-sky-500 bg-slate-800 border-slate-600 rounded">
              </th>
              <th class="px-4 py-2 text-left">Vendedor</th>
              <th class="px-4 py-2 text-right">Cant. ventas</th>
              <th class="px-4 py-2 text-right">Productos vendidos</th>
              <th class="px-4 py-2 text-right">Total vendido</th>
              <th class="px-4 py-2 text-right">Comisión %</th>
              <th class="px-4 py-2 text-right">Total recibido</th>
            </tr>
          </thead>
          <tbody id="reportsTableBody" class="divide-y divide-white/10">
            <tr>
              <td colspan="7" class="px-4 py-3 text-center text-gray-400">
                No hay datos para el rango seleccionado.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    container.appendChild(section);
  }

  // Re-resolver referencias a elementos ahora que existen
  reportsPeriodEl = document.getElementById('reportsPeriod');
  reportsDateEl = document.getElementById('reportsDate');
  reportsCommissionEl = document.getElementById('reportsCommission');
  reportsRefreshBtn = document.getElementById('reportsRefreshBtn');
  reportsStatusEl = document.getElementById('reportsStatus');
  reportsTableBody = document.getElementById('reportsTableBody');

  if (reportsRefreshBtn && !reportsRefreshBtn.__bound) {
    reportsRefreshBtn.addEventListener('click', (e) => {
      e.preventDefault();
      loadSalesReportsOverview();
    });
    reportsRefreshBtn.__bound = true;
  }

  const bulkBtn = document.getElementById('reportsBulkApplyBtn');
  if (bulkBtn && !bulkBtn.__bound) {
    bulkBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await applyBulkCommissionToSelected();
    });
    bulkBtn.__bound = true;
  }

  const selectAll = document.getElementById('reportsSelectAll');
  if (selectAll && !selectAll.__bound) {
    selectAll.addEventListener('change', () => {
      const checked = !!selectAll.checked;
      if (!reportsTableBody) return;
      reportsTableBody.querySelectorAll('.reports-row-checkbox').forEach(cb => {
        if (cb instanceof HTMLInputElement) cb.checked = checked;
      });
    });
    selectAll.__bound = true;
  }

  if (reportsTableBody && !reportsTableBody.__boundCommission) {
    reportsTableBody.addEventListener('change', onReportsTableChange);
    reportsTableBody.__boundCommission = true;
  }
  if (reportsTableBody && !reportsTableBody.__boundClick) {
    reportsTableBody.addEventListener('click', onReportsTableClick);
    reportsTableBody.__boundClick = true;
  }

  __reportsSectionReady = true;
}

async function loadSalesReportsOverview(){
  ensureReportsSection();
  if (!reportsTableBody) return;
  try {
    if (reportsStatusEl) reportsStatusEl.textContent = 'Cargando...';
    const { from, to } = computeReportsRange();
    const baseCommissionPct = Number(reportsCommissionEl?.value || 0) || 0;
    const rows = await fetchSalesBySeller(from, to);
    reportsTableBody.innerHTML = '';
    if (!rows.length){
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 7;
      td.className = 'px-4 py-3 text-center text-gray-400';
      td.textContent = 'No hay datos para el rango seleccionado.';
      tr.appendChild(td);
      reportsTableBody.appendChild(tr);
      return;
    }
    const maxTotal = rows.reduce((m, r) => {
      const t = Number(r.totalAmount || 0);
      return t > m ? t : m;
    }, 0);

    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.dataset.sellerId = String(r.sellerId || '');
      const displayName = (r.sellerUsername && String(r.sellerUsername).trim())
        || (r.sellerName && String(r.sellerName).trim())
        || (`#${r.sellerId}`);
      const ordersCount = Number(r.ordersCount || 0);
      const productsSold = Number(r.productsSold || 0);
      const totalAmount = Number(r.totalAmount || 0);
      const customRate = (r.commissionRate != null && Number.isFinite(Number(r.commissionRate)))
        ? Number(r.commissionRate) : null;
      const effectiveRate = customRate != null ? customRate : (baseCommissionPct / 100);
      const effectivePct = effectiveRate * 100;
      const commissionAmount = totalAmount * effectiveRate;
      const ratio = maxTotal > 0 ? (totalAmount / maxTotal) : 0;

      if (ratio >= 0.8) {
        tr.classList.add('bg-emerald-900/40');
      } else if (ratio > 0 && ratio <= 0.3) {
        tr.classList.add('bg-red-900/30');
      }

      // Selecci�n
      const tdSel = document.createElement('td');
      tdSel.className = 'px-2 py-2 text-center';
      tdSel.innerHTML = '<input type="checkbox" class="reports-row-checkbox h-4 w-4 text-sky-500 bg-slate-800 border-slate-600 rounded">';
      tr.appendChild(tdSel);

      // Vendedor
      const tdName = document.createElement('td');
      tdName.className = 'px-4 py-2 text-left cursor-pointer hover:text-blue-200';
      tdName.dataset.role = 'seller-detail';
      tdName.textContent = displayName;
      tr.appendChild(tdName);

      // Cant. ventas
      const tdOrders = document.createElement('td');
      tdOrders.className = 'px-4 py-2 text-right';
      tdOrders.textContent = ordersCount.toString();
      tr.appendChild(tdOrders);

      // Productos vendidos
      const tdProducts = document.createElement('td');
      tdProducts.className = 'px-4 py-2 text-right';
      tdProducts.textContent = productsSold.toString();
      tr.appendChild(tdProducts);

      // Total vendido
      const tdTotal = document.createElement('td');
      tdTotal.className = 'px-4 py-2 text-right';
      tdTotal.textContent = currency(totalAmount);
      const spark = document.createElement('div');
      spark.className = 'mt-1 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden';
      const sparkInner = document.createElement('div');
      sparkInner.className = 'h-full bg-emerald-500';
      sparkInner.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
      spark.appendChild(sparkInner);
      tdTotal.appendChild(spark);
      tr.appendChild(tdTotal);

      // Comisi�n % (editable)
      const tdComm = document.createElement('td');
      tdComm.className = 'px-4 py-2 text-right';
      const input = document.createElement('input');
      input.type = 'number';
      input.step = '0.01';
      input.min = '0';
      input.value = effectivePct.toFixed(2);
      input.dataset.prevValue = effectivePct.toFixed(2);
      input.dataset.sellerId = String(r.sellerId || '');
      input.className = 'reports-commission-input w-24 text-right bg-transparent border border-white/20 rounded px-1 py-0.5 text-xs';
      tdComm.appendChild(input);
      tr.appendChild(tdComm);

      // Total recibido
      const tdReceived = document.createElement('td');
      tdReceived.className = 'px-4 py-2 text-right';
      tdReceived.textContent = currency(commissionAmount);
      tr.appendChild(tdReceived);

      reportsTableBody.appendChild(tr);
    });
  } catch (err) {
    console.error('loadSalesReportsOverview error', err);
    if (reportsTableBody) {
      reportsTableBody.innerHTML = '';
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 7;
      td.className = 'px-4 py-3 text-center text-red-400';
      td.textContent = 'No se pudieron cargar los reportes.';
      tr.appendChild(td);
      reportsTableBody.appendChild(tr);
    }
  } finally {
    if (reportsStatusEl) reportsStatusEl.textContent = '';
  }
}
// Calcula rango [from,to] seg�n periodo y fecha base (local a reports)
function computeReportsRange(){
  const period = reportsPeriodEl?.value || 'month';
  const baseStr = reportsDateEl?.value || '';
  const base = baseStr ? new Date(baseStr + 'T00:00:00') : new Date();
  if (isNaN(base.getTime())) return { from: null, to: null };

  let from;
  let to;
  if (period === 'day'){
    // Todo el d�a de la fecha base (o de hoy si no hay fecha)
    from = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0);
    to = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59, 999);
  } else if (period === 'week'){
    // Semana completa (lunes-domingo) que contiene la fecha base
    const day = base.getDay() || 7; // lunes=1 ... domingo=7
    const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - (day - 1), 0, 0, 0, 0);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 23, 59, 59, 999);
    from = monday;
    to = sunday;
  } else if (period === 'month'){
    // Mes calendario completo de la fecha base
    from = new Date(base.getFullYear(), base.getMonth(), 1, 0, 0, 0, 0);
    to = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (period === 'custom'){
    // Desde el inicio de la fecha elegida en adelante (sin l�mite superior)
    from = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0);
    to = null;
  } else {
    // Fallback: usar mes
    from = new Date(base.getFullYear(), base.getMonth(), 1, 0, 0, 0, 0);
    to = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  const fromIso = from.toISOString();
  const toIso = to ? to.toISOString() : null;
  return { from: fromIso, to: toIso };
}

async function applyBulkCommissionToSelected(){
  ensureReportsSection();
  const bulkInput = document.getElementById('reportsBulkCommission');
  if (!reportsTableBody || !bulkInput) return;
  const pct = Number(bulkInput.value || 0);
  if (!Number.isFinite(pct) || pct < 0) {
    showMessageBox('Ingresá un porcentaje válido para aplicar en masa', 'warning');
    return;
  }
  const ids = Array.from(reportsTableBody.querySelectorAll('tr'))
    .map(tr => {
      const cb = tr.querySelector('.reports-row-checkbox');
      if (!cb || !(cb instanceof HTMLInputElement) || !cb.checked) return null;
      const sid = tr.getAttribute('data-seller-id');
      return sid || null;
    })
    .filter(Boolean);
  if (!ids.length) {
    showMessageBox('Seleccioná al menos un vendedor', 'warning');
    return;
  }
  try {
    const resp = await fetchWithAuth(ROUTES.usersCommissionBulk(), {
      method: 'POST',
      body: JSON.stringify({ userIds: ids, commissionPercent: pct }),
    });
    if (!resp.ok) {
      let msg = 'No se pudieron actualizar las comisiones';
      try {
        const data = await resp.json();
        if (data && data.error) msg = data.error;
      } catch {}
      showMessageBox(msg, 'error');
      return;
    }
    showMessageBox('Comisión actualizada para los vendedores seleccionados', 'success');
    await loadSalesReportsOverview();
  } catch (err) {
    console.error('applyBulkCommissionToSelected', err);
    showMessageBox('Error al actualizar comisiones en masa', 'error');
  }
}

async function onReportsTableChange(e){
  const target = e.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (!target.classList.contains('reports-commission-input')) return;
  const tr = target.closest('tr');
  const sellerId = tr ? tr.getAttribute('data-seller-id') : null;
  if (!sellerId) return;
  const pct = Number(target.value || 0);
  const prev = Number(target.dataset.prevValue || 0);
  if (!Number.isFinite(pct) || pct < 0) {
    showMessageBox('Ingresá un porcentaje válido', 'warning');
    target.value = prev.toFixed(2);
    return;
  }
  try {
    const resp = await fetchWithAuth(ROUTES.userCommission(sellerId), {
      method: 'PATCH',
      body: JSON.stringify({ commissionPercent: pct }),
    });
    if (!resp.ok) {
      let msg = 'No se pudo actualizar la comisión';
      try {
        const data = await resp.json();
        if (data && data.error) msg = data.error;
      } catch {}
      showMessageBox(msg, 'error');
      target.value = prev.toFixed(2);
      return;
    }
    target.dataset.prevValue = pct.toFixed(2);
    showMessageBox('Comisión actualizada', 'success');
    await loadSalesReportsOverview();
  } catch (err) {
    console.error('onReportsTableChange', err);
    showMessageBox('Error al actualizar la comisión', 'error');
    target.value = prev.toFixed(2);
  }
}

async function onReportsTableClick(e){
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  // Ignorar clicks en inputs (checkbox / number) dentro de la tabla
  if (target.closest('input')) return;
  const cell = target.closest('td[data-role="seller-detail"]');
  if (!cell) return;
  const tr = cell.closest('tr');
  if (!tr || !reportsTableBody || !reportsTableBody.contains(tr)) return;
  const sellerId = tr.getAttribute('data-seller-id');
  if (!sellerId) return;

  const next = tr.nextElementSibling;
  if (next && next.classList.contains('reports-detail-row')) {
    next.remove();
    tr.dataset.expanded = '0';
    return;
  }

  const detailTr = document.createElement('tr');
  detailTr.className = 'reports-detail-row bg-slate-900/60';
  const td = document.createElement('td');
  td.colSpan = 7;
  td.className = 'px-6 py-3 text-xs text-gray-200';
  td.textContent = 'Cargando detalle del vendedor...';
  detailTr.appendChild(td);
  tr.after(detailTr);
  tr.dataset.expanded = '1';

  try {
    const { from, to } = computeReportsRange();
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    const resp = await fetchWithAuth(ROUTES.salesBySellerDetail(sellerId, qs));
    if (!resp.ok) {
      let msg = 'No se pudo cargar el detalle del vendedor';
      try {
        const data = await resp.json();
        if (data && data.error) msg = data.error;
      } catch {}
      td.textContent = msg;
      td.className = 'px-6 py-3 text-xs text-red-300';
      return;
    }
    const data = await resp.json().catch(() => null);
    if (!data) {
      td.textContent = 'Sin datos de detalle para este vendedor.';
      return;
    }
    const topProducts = Array.isArray(data.topProducts) ? data.topProducts : [];
    const recentOrders = Array.isArray(data.recentOrders) ? data.recentOrders : [];

    let html = '<div class="grid md:grid-cols-2 gap-4">';
    html += '<div>';
    html += '<div class="font-semibold text-sm text-blue-200 mb-2">Top productos (últimos 5)</div>';
    if (!topProducts.length) {
      html += '<div class="text-gray-400 text-xs">Sin productos en el rango seleccionado.</div>';
    } else {
      html += '<ul class="space-y-1 text-xs">';
      topProducts.forEach(p => {
        const name = (p.productName || '').toString();
        const qty = Number(p.quantity || 0);
        const total = Number(p.totalAmount || 0);
        html += `<li class="flex justify-between gap-2"><span class="text-gray-200 truncate max-w-[60%]">${escapeHtml(name)}</span><span class="text-gray-400">x${qty} · ${currency(total)}</span></li>`;
      });
      html += '</ul>';
    }
    html += '</div>';

    html += '<div>';
    html += '<div class="font-semibold text-sm text-blue-200 mb-2">Órdenes recientes</div>';
    if (!recentOrders.length) {
      html += '<div class="text-gray-400 text-xs">Sin órdenes en el rango seleccionado.</div>';
    } else {
      html += '<ul class="space-y-1 text-xs">';
      recentOrders.forEach(o => {
        const num = o.orderNumber || (`#${o.orderId}`);
        const when = o.orderDate ? new Date(o.orderDate).toLocaleString() : '';
        const st = o.status || '';
        const total = Number(o.totalAmount || 0);
        html += `<li class="flex justify-between gap-2"><span class="text-gray-200 truncate max-w-[60%]">${escapeHtml(String(num))}</span><span class="text-gray-400 text-right">${escapeHtml(st)} · ${escapeHtml(when)} · ${currency(total)}</span></li>`;
      });
      html += '</ul>';
    }
    html += '</div>';
    html += '</div>';

    td.innerHTML = html;
  } catch (err) {
    console.error('onReportsTableClick', err);
    td.textContent = 'Error al cargar el detalle del vendedor';
    td.className = 'px-6 py-3 text-xs text-red-300';
  }
}

function isOrderHidden(id){ try { return loadHiddenOrders().some(x => String(x) === String(id)); } catch { return false; } }
function hideOrderId(id){ const arr = loadHiddenOrders(); if (!arr.some(x => String(x)===String(id))) { arr.push(String(id)); saveHiddenOrders(arr); } }

// Stock helpers using backend stock endpoint (PATCH /productos/:id/stock)
async function fetchProductRaw(id){
  const resp = await fetchWithAuth(ROUTES.product(id));
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const p = await resp.json();
  return p;
}

async function updateProductStockAbsolute(id, newStock){
  // Mantener compatibilidad: convertir a delta y usar PATCH /stock
  const p = await fetchProductRaw(id);
  const current = Number(p.stock_quantity || 0) || 0;
  const target = Math.max(0, Number(newStock || 0) || 0);
  const delta = target - current;
  if (!delta) return true;
  const resp = await fetchWithAuth(ROUTES.stock(id), {
    method: 'PATCH',
    body: JSON.stringify({ delta, reason: 'ajuste de stock (absoluto)' })
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return true;
}

async function applyStockDeltaViaPut(id, delta){
  const d = Number(delta || 0);
  if (!d) return true;
  const resp = await fetchWithAuth(ROUTES.stock(id), {
    method: 'PATCH',
    body: JSON.stringify({ delta: d, reason: 'ajuste de stock (admin)' })
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return true;
}
function ensureDeleteButtons(kind){
  if (kind === 'category') {
    const section = document.getElementById('editCategory');
    if (!section) return;
    if (!deleteCategoryButton) {
      deleteCategoryButton = document.createElement('button');
      deleteCategoryButton.id = 'deleteCategoryButton';
      deleteCategoryButton.className = 'action-button w-full bg-red-600 hover:bg-red-700 mt-3';
      deleteCategoryButton.textContent = 'Eliminar Categoria';
      section.appendChild(deleteCategoryButton);
      deleteCategoryButton.addEventListener('click', onDeleteCategory);
    }
  } else if (kind === 'product') {
    const section = document.getElementById('editProduct');
    if (!section) return;
    if (!deleteProductButton) {
      deleteProductButton = document.createElement('button');
      deleteProductButton.id = 'deleteProductButton';
      deleteProductButton.className = 'action-button w-full bg-red-600 hover:bg-red-700 mt-3';
      deleteProductButton.textContent = 'Eliminar Producto';
      section.appendChild(deleteProductButton);
      deleteProductButton.addEventListener('click', onDeleteProduct);
    }
  }
}
function parseSpecifications(raw) {
  if (!raw) return [];
  return raw.split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const [k, ...rest] = line.split(':');
      return { key: (k || '').trim(), value: rest.join(':').trim() };
    });
}

async function onDeleteCategory(){
  const id = selectCategoryToEdit?.value || '';
  if (!id) { showMessageBox('Elegi una categoria a eliminar', 'warning'); return; }
  const ok = window.confirm('?Eliminar esta categoria? Tambienn se archivaran sus productos.');
  if (!ok) return;
  try {
    const resp = await fetchWithAuth(ROUTES.category(id), { method: 'DELETE' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    showMessageBox('Categoria eliminada', 'success');
    await loadCategoriesForEdit();
    await loadCategoriesForProductForms();
  } catch (err) {
    console.error('delete category error', err);
    showMessageBox('No se pudo eliminar la categoria', 'error');
  }
}

async function onDeleteProduct(){
  const id = selectProductToEdit?.value || '';
  if (!id) { showMessageBox('Elegi? un producto a eliminar', 'warning'); return; }
  const ok = window.confirm('?Eliminar este producto?');
  if (!ok) return;
  try {
    const resp = await fetchWithAuth(ROUTES.product(id), { method: 'DELETE' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    showMessageBox('Producto eliminado', 'success');
    await loadProductsForEdit();
    populateProductEditForm(null);
  } catch (err) {
    console.error('delete product error', err);
    showMessageBox('No se pudo eliminar el producto', 'error');
  }
}

function toNumberOr(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

// Money parsing tolerant to ES/US formats. Clamps to NUMERIC(10,2) range.
const MONEY_MAX = 99999999.99; // NUMERIC(10,2)
function parseMoneyOr(val, fallback = 0) {
  if (val == null) return fallback;
  if (typeof val === 'number') {
    const n = Number.isFinite(val) ? val : fallback;
    const clamped = Math.min(MONEY_MAX, Math.max(0, n));
    return Number(clamped.toFixed(2));
  }
  try {
    let s = String(val).trim();
    if (!s) return fallback;
    // Keep digits, separators and sign
    s = s.replace(/[^0-9,.-]/g, '');
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma !== -1 && (lastDot === -1 || lastComma > lastDot)) {
      // ES style: thousand '.' and decimal ','
      s = s.replace(/\./g, '');
      s = s.replace(/,/g, '.');
    } else {
      // US style: decimal '.'; remove ',' thousands
      s = s.replace(/,/g, '');
    }
    let n = parseFloat(s);
    if (!Number.isFinite(n)) return fallback;
    if (n < 0) n = 0;
    if (n > MONEY_MAX) n = MONEY_MAX;
    return Number(n.toFixed(2));
  } catch {
    return fallback;
  }
}

/* ===========================
   Categorias
=========================== */
let categoriesCache = [];

async function loadCategoriesForProductForms() {
  try {
    const resp = await fetchWithAuth(ROUTES.categories());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const categories = await resp.json();
    categoriesCache = Array.isArray(categories) ? categories : [];

    // Rellenar selects
    if (productCategorySelect) {
      productCategorySelect.innerHTML = '<option value="">-- Selecciona una categoria --</option>';
      categoriesCache.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id || c._id || c.uuid || '';
        opt.textContent = c.name || c.nombre || '';
        productCategorySelect.appendChild(opt);
      });
    }
    if (editedProductCategorySelect) {
      editedProductCategorySelect.innerHTML = '<option value="">-- Selecciona una categoria --</option>';
      categoriesCache.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id || c._id || c.uuid || '';
        opt.textContent = c.name || c.nombre || '';
        editedProductCategorySelect.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('loadCategoriesForProductForms error', err);
    showMessageBox('Error al cargar categorias', 'error');
  }
}

async function loadCategoriesForEdit() {
  try {
    const resp = await fetchWithAuth(ROUTES.categories());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const list = await resp.json();
    const items = (Array.isArray(list) ? list : [])
      .map(c => ({ id: c.id || c._id || c.uuid, name: c.name || c.nombre || '', imageUrl: c.image_url || c.imageUrl || c.imagen || '', description: c.description || c.descripcion || '' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

    // Filtro + render
    const filterText = (searchCategoryToEditInput?.value || '').trim().toLowerCase();
    const filtered = filterText
      ? items.filter(c => (c.name || '').toLowerCase().includes(filterText))
      : items;

    if (selectCategoryToEdit) {
      selectCategoryToEdit.innerHTML = '<option value="">-- Selecciona una categoria --</option>';
      filtered.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        selectCategoryToEdit.appendChild(opt);
      });
    }

    // Auto-select si hay filtro
    if (filterText && filtered[0]) {
      selectCategoryToEdit.value = filtered[0].id;
      populateCategoryEditForm(filtered[0]);
    }
  } catch (err) {
    console.error('loadCategoriesForEdit error', err);
    showMessageBox('Error al cargar categorias', 'error');
  }
}

function populateCategoryEditForm(category) {
  if (!editedCategoryNameInput || !editedCategoryImageUrlInput) return;
  const name = category?.name || '';
  const img = category?.imageUrl || '';
  const desc = category?.description || '';
  editedCategoryNameInput.value = name;
  editedCategoryImageUrlInput.value = img;
  const prev = document.getElementById('editedCategoryImageUrl__preview');
  if (prev) prev.src = img || '';
  const descEl = document.getElementById('editedCategoryDescription');
  if (descEl) descEl.value = desc;
}

// Inicializar UI para ajuste de precios por categoria (crea input y boton si no existen)
function initCategoryPriceAdjustUI(){
  const container = document.getElementById('editCategory');
  if (!container) return;
  if (document.getElementById('categoryPriceAdjustBlock')) return;

  const block = document.createElement('div');
  block.id = 'categoryPriceAdjustBlock';
  block.className = 'mt-6 border-t border-white/10 pt-4';
  block.innerHTML = `
    <h3 class="text-xl font-semibold mb-2 text-blue-200">Ajustar precios por porcentaje</h3>
    <p class="text-sm text-gray-400 mb-3">
      Ingresa un porcentaje para aumentar o disminuir los precios de todos los productos de esta categoria.
      Por ejemplo, 5 aumenta los precios un 5%, -5 los baja un 5%.
    </p>
    <div class="flex flex-col sm:flex-row gap-3 items-center">
      <input type="number" step="0.01" id="categoryPriceAdjustPercent" class="input-field sm:flex-grow" placeholder="Porcentaje (ej: 5 o -5)">
      <button type="button" id="applyCategoryPriceAdjustButton" class="action-button w-full sm:w-auto">
        Aplicar a precios de la categoria
      </button>
    </div>
    <p class="text-xs text-gray-500 mt-2">
      Rango permitido: entre -90% y 200%. Esta acci&oacute;n afecta solo productos activos de la categoria seleccionada.
    </p>
  `;

  const space = container.querySelector('.space-y-4') || container;
  space.appendChild(block);

  const btn = document.getElementById('applyCategoryPriceAdjustButton');
  if (!btn) return;
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    const catId = selectCategoryToEdit?.value || '';
    if (!catId) { showMessageBox('Eleg&iacute; una categoria primero.', 'warning'); return; }
    const percentInput = document.getElementById('categoryPriceAdjustPercent');
    const raw = percentInput ? percentInput.value : '';
    const percent = Number(raw);
    if (!Number.isFinite(percent)) {
      showMessageBox('Porcentaje inv&aacute;lido.', 'error');
      return;
    }
    if (percent < -90 || percent > 200) {
      showMessageBox('El porcentaje debe estar entre -90 y 200.', 'warning');
      return;
    }
    const catName = editedCategoryNameInput?.value?.trim() || 'la categoria seleccionada';
    const ok = window.confirm(`Vas a ajustar los precios de ${catName} en ${percent}%.\nEsta acci&oacute;n afecta todos los productos activos de esa categoria.\n\n&iquest;Confirmas?`);
    if (!ok) return;
    try {
      const resp = await fetchWithAuth(ROUTES.categoryPriceAdjust(catId), {
        method: 'POST',
        body: JSON.stringify({ percent })
      });
      if (!resp.ok) {
        let details = '';
        try { details = await resp.text(); } catch {}
        console.error('category price adjust failed', resp.status, details);
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = await resp.json().catch(() => ({}));
      const affected = Number(data.affectedProducts || data.affected || 0) || 0;
      showMessageBox(`Precios actualizados correctamente (${affected} productos afectados).`, 'success');
    } catch (err) {
      console.error('category price adjust error', err);
      showMessageBox('No se pudieron ajustar los precios de la categoria', 'error');
    }
  });
}

selectCategoryToEdit?.addEventListener('change', async () => {
  const id = selectCategoryToEdit.value;
  if (!id) { populateCategoryEditForm({}); return; }
  // Buscar en cache local
  const cat = categoriesCache.find(c => (c.id || c._id || c.uuid) === id);
  if (cat) populateCategoryEditForm({
    id,
    name: cat.name || cat.nombre,
    imageUrl: cat.imageUrl || cat.imagen,
    description: cat.description || cat.descripcion || ''
  });
});

searchCategoryToEditInput?.addEventListener('input', () => loadCategoriesForEdit());

saveCategoryChangesButton?.addEventListener('click', async (e) => {
  e.preventDefault();
  const id = selectCategoryToEdit?.value || '';
  const name = editedCategoryNameInput?.value?.trim() || '';
  const imageUrl = editedCategoryImageUrlInput?.value?.trim() || '';
  if (!id || !name) return showMessageBox('Selecciona? una categoria y completa? el nombre.', 'warning');

  try {
    const description = document.getElementById('editedCategoryDescription')?.value?.trim() || '';
    const resp = await fetchWithAuth(ROUTES.category(id), {
      method: 'PUT',
      body: JSON.stringify({ name, description, image_url: imageUrl })
    });
    if (!resp.ok) {
      let details = '';
      try { details = await resp.text(); } catch {}
      console.error('update category failed', resp.status, details);
      throw new Error(`HTTP ${resp.status}`);
    }
    showMessageBox('Categoria actualizada', 'success');
    await loadCategoriesForEdit();
    await loadCategoriesForProductForms();
  } catch (err) {
    console.error('update category error', err);
    showMessageBox('No se pudo actualizar la categoria', 'error');
  }
});

createCategoryForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('categoryName')?.value?.trim() || '';
  const imageUrl = document.getElementById('categoryImageUrl')?.value?.trim() || '';
  if (!name) return showMessageBox('El nombre es obligatorio', 'warning');

  try {
    const description = document.getElementById('categoryDescription')?.value?.trim() || '';
    const resp = await fetchWithAuth(ROUTES.categories(), {
      method: 'POST',
      body: JSON.stringify({ name, description, image_url: imageUrl })
    });
    if (!resp.ok) {
      let details = '';
      try { details = await resp.text(); } catch {}
      console.error('create category failed', resp.status, details);
      throw new Error(`HTTP ${resp.status}`);
    }
    showMessageBox('Categoria creada', 'success');
    (document.getElementById('categoryName')).value = '';
    (document.getElementById('categoryImageUrl')).value = '';
    document.getElementById('categoryImageUrl__preview')?.setAttribute('src','');
    await loadCategoriesForEdit();
    await loadCategoriesForProductForms();
  } catch (err) {
    console.error('create category error', err);
    showMessageBox('No se pudo crear la categoria', 'error');
  }
});

/* ===========================
   Productos
=========================== */
let productsCache = [];
let productApiMap = null; // mapping de claves esperado por el backend

function detectProductApiMapping(rawList){
  try {
    const sample = (Array.isArray(rawList) ? rawList : []).find(x => x && typeof x === 'object') || {};
    const present = new Set(Object.keys(sample || {}));
    const types = {};
    try { Object.keys(sample || {}).forEach(k => { types[k] = typeof sample[k]; }); } catch {}
    const pick = (...keys) => keys.find(k => k in sample) || keys[0];
    // Resolver cada campo a la clave m?s probable del backend
    return {
      id: pick('id','_id','uuid'),
      name: pick('name','nombre'),
      price: pick('price','precio'),
      imageUrl: pick('image_url','imagen','imageUrl'),
      categoryId: pick('category_id','categoriaId','categoryId'),
      description: pick('description','descripcion'),
      stock: pick('stock_quantity','stock'),
      componentsUrl: pick('components_url','componentesUrl','componentsUrl'),
      videoUrl: pick('video_url','videoUrl'),
      status: pick('status'),
      specifications: pick('specifications','especificaciones','specs'),
      warranty: pick('warranty','garantia'),
      __present: present,
      __types: types
    };
  } catch { return null; }
}

function specsToString(specs){
  try {
    if (!specs) return '';
    if (typeof specs === 'string') return specs;
    if (Array.isArray(specs)) {
      return specs.map(it => {
        if (!it) return '';
        if (typeof it === 'string') return it;
        const k = it.key ?? it.clave ?? it.nombre ?? '';
        const v = it.value ?? it.valor ?? it.val ?? '';
        const line = `${String(k).trim()}: ${String(v).trim()}`.trim();
        return line;
      }).filter(Boolean).join('\n');
    }
    if (typeof specs === 'object') {
      return Object.entries(specs).map(([k,v]) => `${k}: ${v}`).join('\n');
    }
    return String(specs);
  } catch { return ''; }
}

function buildProductPayloadForAPI(ui, mode = 'update'){
  // A partir de los valores del formulario (ui), construir un objeto con las
  // claves que el backend espera (seg?n productApiMap). Enviar solo esas claves.
  const map = productApiMap || {
    id:'id', name:'name', price:'price', imageUrl:'imageUrl', categoryId:'categoryId', description:'description', stock:'stock', componentsUrl:'componentsUrl', videoUrl:'videoUrl', status:'status', specifications:'specifications', warranty:'warranty', __present: new Set(['id','name','price','imageUrl','categoryId','description','stock','componentsUrl','videoUrl','status','specifications','warranty'])
  };
  const present = map.__present instanceof Set ? map.__present : new Set([]);
  const types = map.__types || {};
  const allowAlways = new Set([
    'name','nombre','price','precio','image_url','imagen','imageUrl','category_id','categoriaId','categoryId','description','descripcion','specifications','especificaciones','warranty','garantia'
  ]);
  const allowCreateOnly = new Set(['stock','stock_quantity']);
  const allowOptionalIfPresent = new Set(['video_url','videoUrl','components_url','componentsUrl','status']);

  const out = {};
  const shouldIncludeKey = (k) => {
    if (!k) return false;
    if (allowAlways.has(k)) return true;
    if (mode === 'create' && allowCreateOnly.has(k)) return true;
    // incluir si aparece en la muestra del backend
    if (present.has(k)) return true;
    return false;
  };
  const assign = (key, val, {allowEmpty=false}={}) => {
    if (!shouldIncludeKey(key)) return;
    // omitir strings vac?os salvo que se permita expl?citamente
    if (!allowEmpty && (val === '' || val === undefined || val === null)) return;
    out[key] = val;
  };
  assign(map.name, ui.name);
  assign(map.price, ui.price);
  assign(map.imageUrl, ui.imageUrl);
  const catVal = (ui.categoryId != null && ui.categoryId !== '') ? (isNaN(Number(ui.categoryId)) ? ui.categoryId : Number(ui.categoryId)) : null;
  assign(map.categoryId, catVal);
  // descripci?n puede ser vac?a; algunos backends la aceptan en blanco, permitir vac?a si existe la clave en la muestra
  assign(map.description, ui.description, {allowEmpty: present.has(map.description)});
  // Incluir stock tanto en creaci?n como en edici?n si el backend lo expone
  assign(map.stock, ui.stock);
  if (allowOptionalIfPresent.has(map.componentsUrl) && present.has(map.componentsUrl)) assign(map.componentsUrl, ui.componentsUrl);
  if (allowOptionalIfPresent.has(map.videoUrl) && present.has(map.videoUrl)) assign(map.videoUrl, ui.videoUrl);
  if (allowOptionalIfPresent.has(map.status) && present.has(map.status)) assign(map.status, ui.status);
  // specifications: respetar tipo del backend (string o estructura)
  if (shouldIncludeKey(map.specifications)) {
    let specVal = ui.specifications;
    const t = types[map.specifications];
    // Si el backend declara string o no hay informaci?n de tipo, enviar string
    if (!t || t === 'string') specVal = specsToString(specVal);
    assign(map.specifications, specVal, {allowEmpty: present.has(map.specifications)});
  }
  assign(map.warranty, ui.warranty);
  return out;
}

async function loadProductsForEdit() {
  try {
    const resp = await fetchWithAuth(ROUTES.products());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const list = await resp.json();
    // Detectar mapeo de claves del backend para futuras escrituras
    productApiMap = detectProductApiMapping(list);
    productsCache = (Array.isArray(list) ? list : [])
      .map(p => ({
        id: p.id || p._id || p.uuid,
        name: p.name || p.nombre || '',
        price: p.price ?? p.precio ?? 0,
        imageUrl: p.image_url || p.imageUrl || p.imagen || '',
        categoryId: p.category_id || p.categoryId || p.categoriaId || '',
        description: p.description || p.descripcion || '',
        stock: p.stock_quantity ?? p.stock ?? 0,
        componentsUrl: p.components_url || p.componentesUrl || p.componentsUrl || '',
        videoUrl: p.video_url || p.videoUrl || '',
        status: p.status || 'draft',
        specifications: p.specifications || p.especificaciones || p.specs || [],
        warranty: p.warranty || p.garantia || '',
        discountPercent: p.discount_percent ?? p.discountPercent ?? null,
        discountStart: p.discount_start || p.discountStart || null,
        discountEnd: p.discount_end || p.discountEnd || null,
        isOffer: typeof p.is_offer === 'boolean' ? p.is_offer : !!p.isOffer,
        finalPrice: p.final_price ?? p.finalPrice ?? (p.price ?? p.precio ?? 0)
      }))
      .sort((a,b) => a.name.localeCompare(b.name,'es',{sensitivity:'base'}));

    renderProductEditOptions();
  } catch (err) {
    console.error('loadProductsForEdit error', err);
    showMessageBox('Error al cargar productos', 'error');
  }
}

function renderProductEditOptions() {
  if (!selectProductToEdit) return;
  const filter = (searchProductToEditInput?.value || '').trim().toLowerCase();
  const list = filter
    ? productsCache.filter(p => (p.name || '').toLowerCase().includes(filter))
    : productsCache.slice();

  selectProductToEdit.innerHTML = '<option value="">-- Selecciona un producto --</option>';
  list.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    selectProductToEdit.appendChild(opt);
  });

  if (filter && list[0]) {
    selectProductToEdit.value = list[0].id;
    populateProductEditForm(list[0]);
  }
}

searchProductToEditInput?.addEventListener('input', () => renderProductEditOptions());

selectProductToEdit?.addEventListener('change', () => {
  const id = selectProductToEdit.value;
  if (!id) return populateProductEditForm(null);
  const prod = productsCache.find(p => p.id === id);
  populateProductEditForm(prod || null);
});

function populateProductEditForm(p) {
  const assign = (el, val) => { if (el) el.value = (val ?? '') };
  if (!p) {
    assign(editedProductNameInput, '');
    assign(editedProductPriceInput, '');
    assign(editedProductImageUrlInput, '');
    assign(editedProductCategorySelect, '');
    assign(editedProductDescriptionInput, '');
    assign(editedProductStockInput, 0);
    assign(editedProductComponentsUrlInput, '');
    assign(editedProductVideoUrlInput, '');
    assign(editedProductStatusSelect, 'draft');
    assign(editedProductSpecificationsTextarea, '');
    assign(editedProductWarrantyInput, '');
    assign(editedProductDiscountPercentInput, '');
    assign(editedProductDiscountDaysInput, '');
    assign(editedProductDiscountStartInput, '');
    assign(editedProductDiscountEndInput, '');
    if (editedProductDiscountSummary) editedProductDiscountSummary.textContent = 'Sin descuento configurado.';
    return;
  }
  assign(editedProductNameInput, p.name);
  assign(editedProductPriceInput, p.price);
  assign(editedProductImageUrlInput, p.imageUrl);
  // Normalizar categoryId a string para el <select>
  if (editedProductCategorySelect) editedProductCategorySelect.value = (p.categoryId != null ? String(p.categoryId) : '');
  assign(editedProductDescriptionInput, p.description);
  assign(editedProductStockInput, p.stock);
  assign(editedProductComponentsUrlInput, p.componentsUrl);
  assign(editedProductVideoUrlInput, p.videoUrl);
  assign(editedProductStatusSelect, p.status);
  // specs a texto
  if (editedProductSpecificationsTextarea) {
    if (Array.isArray(p.specifications)) {
      editedProductSpecificationsTextarea.value = p.specifications
        .map(s => (typeof s === 'string') ? s : `${s.key ?? ''}: ${s.value ?? ''}`)
        .join('\n');
    } else if (p.specifications && typeof p.specifications === 'object') {
      editedProductSpecificationsTextarea.value = Object.entries(p.specifications)
        .map(([k,v]) => `${k}: ${v}`)
        .join('\n');
    } else {
      editedProductSpecificationsTextarea.value = p.specifications || '';
    }
  }
  assign(editedProductWarrantyInput, p.warranty);
  // Descuento / oferta
  const percent = p.discountPercent != null ? Number(p.discountPercent) : NaN;
  if (editedProductDiscountPercentInput) {
    editedProductDiscountPercentInput.value = Number.isFinite(percent) ? String(percent) : '';
  }
  if (editedProductDiscountDaysInput) {
    editedProductDiscountDaysInput.value = '';
  }
  const toLocalInputValue = (iso) => {
    try {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      const year = d.getFullYear();
      const month = pad(d.getMonth() + 1);
      const day = pad(d.getDate());
      const hours = pad(d.getHours());
      const minutes = pad(d.getMinutes());
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch { return ''; }
  };
  if (editedProductDiscountStartInput) {
    editedProductDiscountStartInput.value = toLocalInputValue(p.discountStart);
  }
  if (editedProductDiscountEndInput) {
    editedProductDiscountEndInput.value = toLocalInputValue(p.discountEnd);
  }
  if (editedProductDiscountSummary) {
    if (Number.isFinite(percent) && percent > 0) {
      const parts = [];
      parts.push(`Descuento activo: ${percent}% OFF.`);
      if (p.discountStart) parts.push(`Desde: ${new Date(p.discountStart).toLocaleString()}.`);
      if (p.discountEnd) parts.push(`Hasta: ${new Date(p.discountEnd).toLocaleString()}.`);
      if (!p.discountStart && !p.discountEnd) parts.push('Sin fecha de fin definida.');
      editedProductDiscountSummary.textContent = parts.join(' ');
    } else {
      editedProductDiscountSummary.textContent = 'Sin descuento configurado.';
    }
  }
  // Preview de imagen
  try {
    const prev = document.getElementById('editedProductImageUrl__preview');
    if (prev) prev.src = p.imageUrl || '';
  } catch {}
}

saveProductChangesButton?.addEventListener('click', async (e) => {
  e.preventDefault();
  const id = selectProductToEdit?.value || '';
  if (!id) return showMessageBox('Eleg? un producto', 'warning');

  const payloadBase = {
    name: editedProductNameInput?.value?.trim(),
    price: parseMoneyOr(editedProductPriceInput?.value, 0),
    imageUrl: editedProductImageUrlInput?.value?.trim(),
    categoryId: editedProductCategorySelect?.value || null,
    description: editedProductDescriptionInput?.value?.trim() || '',
    stock: toNumberOr(editedProductStockInput?.value, 0),
    componentsUrl: editedProductComponentsUrlInput?.value?.trim() || '',
    videoUrl: editedProductVideoUrlInput?.value?.trim() || '',
    status: editedProductStatusSelect?.value || 'draft',
    specifications: parseSpecifications(editedProductSpecificationsTextarea?.value || ''),
    warranty: editedProductWarrantyInput?.value?.trim() || null
  };
  if (!Number.isFinite(payloadBase.price) || payloadBase.price < 0) {
    return showMessageBox('Precio invalido', 'warning');
  }
  if (payloadBase.price > MONEY_MAX) {
    return showMessageBox('El precio supera el maximo permitido (99.999.999,99).', 'warning');
  }
  const payload = buildProductPayloadForAPI(payloadBase, 'update');

  try {
    // Log del payload para depurar (opcional)
    try { if (window.__DEBUG_ADMIN) console.debug('[admin] PUT /productos payload', payload); } catch {}
    const resp = await fetchWithAuth(ROUTES.product(id), {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      let details = '';
      try { details = await resp.text(); } catch {}
      console.error('update product failed', resp.status, details);
      throw new Error(`HTTP ${resp.status}`);
    }
    showMessageBox('Producto actualizado', 'success');
    await loadProductsForEdit();
    const prod = productsCache.find(p => p.id === id);
    populateProductEditForm(prod || null);
  } catch (err) {
    console.error('update product error', err);
    showMessageBox('No se pudo actualizar el producto', 'error');
  }
});

// Aplicar / actualizar descuento de producto
async function applyCurrentProductDiscount(mode = 'set') {
  const id = selectProductToEdit?.value || '';
  if (!id) {
    showMessageBox('Elegí un producto primero', 'warning');
    return;
  }

  if (mode === 'clear') {
    const ok = window.confirm('Quitar descuento actual de este producto?');
    if (!ok) return;
  }

  const percentRaw = editedProductDiscountPercentInput?.value ?? '';
  const daysRaw = editedProductDiscountDaysInput?.value ?? '';
  const startRaw = editedProductDiscountStartInput?.value ?? '';
  const endRaw = editedProductDiscountEndInput?.value ?? '';

  let percent = Number(percentRaw);
  if (mode === 'clear') {
    percent = 0;
  }

  if (mode !== 'clear') {
    if (!Number.isFinite(percent) || percent <= 0) {
      showMessageBox('Ingresa un porcentaje de descuento mayor a 0', 'warning');
      return;
    }
    if (percent >= 100) {
      showMessageBox('El descuento debe ser menor al 100%', 'warning');
      return;
    }
  }

  const payload = { discount_percent: percent };
  const days = Number(daysRaw);
  if (startRaw) payload.discount_start = startRaw;
  if (endRaw) payload.discount_end = endRaw;
  if (!endRaw && Number.isInteger(days) && days > 0) {
    payload.duration_days = days;
  }

  try {
    const resp = await fetchWithAuth(ROUTES.productDiscount(id), {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      let details = '';
      try { details = await resp.text(); } catch {}
      console.error('update discount failed', resp.status, details);
      throw new Error(`HTTP ${resp.status}`);
    }
    const data = await resp.json().catch(() => ({}));
    const msg = mode === 'clear' ? 'Descuento quitado' : 'Descuento actualizado';
    showMessageBox(msg, 'success');
    // Refrescar cache y formulario para ver los nuevos datos
    await loadProductsForEdit();
    const prod = productsCache.find(p => p.id === id);
    populateProductEditForm(prod || null);
  } catch (err) {
    console.error('update discount error', err);
    showMessageBox('No se pudo actualizar el descuento', 'error');
  }
}

applyProductDiscountButton?.addEventListener('click', (e) => {
  e.preventDefault();
  applyCurrentProductDiscount('set');
});

clearProductDiscountButton?.addEventListener('click', (e) => {
  e.preventDefault();
  applyCurrentProductDiscount('clear');
});

createProductForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payloadBase = {
    name: document.getElementById('productName')?.value?.trim(),
    price: parseMoneyOr(document.getElementById('productPrice')?.value, 0),
    imageUrl: document.getElementById('productImageUrl')?.value?.trim(),
    categoryId: productCategorySelect?.value || null,
    description: document.getElementById('productDescription')?.value?.trim() || '',
    specifications: parseSpecifications(productSpecificationsTextarea?.value || ''),
    warranty: productWarrantyInput?.value?.trim() || null,
    stock: toNumberOr(document.getElementById('productStock')?.value, 0),
    componentsUrl: document.getElementById('productComponentsUrl')?.value?.trim() || '',
    videoUrl: document.getElementById('productVideoUrl')?.value?.trim() || '',
    status: productStatusSelect?.value || 'draft'
  };

  // Price validation within DB limits
  if (!Number.isFinite(payloadBase.price) || payloadBase.price < 0) {
    return showMessageBox('Precio invalido', 'warning');
  }
  if (payloadBase.price > MONEY_MAX) {
    return showMessageBox('El precio supera el maximo permitido (99.999.999,99).', 'warning');
  }

  // Pre-chequeo de nombre duplicado (case-insensitive)
  try {
    const normName = (payloadBase.name || '').trim().toLowerCase();
    if (normName) {
      const dup = (Array.isArray(productsCache) ? productsCache : [])
        .some(p => ((p?.name || '').trim().toLowerCase() === normName));
      if (dup) {
        return showMessageBox('Ya existe un producto con ese nombre. Cambi? el nombre o ed?talo desde "Editar Producto".', 'warning');
      }
    }
  } catch {}

  const payload = buildProductPayloadForAPI(payloadBase, 'create');
  if (!payloadBase.name || !(productCategorySelect?.value || '').trim()) {
    return showMessageBox('Nombre y categoria son obligatorios', 'warning');
  }
  try {
    try { if (window.__DEBUG_ADMIN) console.debug('[admin] POST /productos payload', payload); } catch {}
    const resp = await fetchWithAuth(ROUTES.products(), {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      let details = '';
      try { details = await resp.text(); } catch {}
      // Manejo amigable de duplicado por nombre
      if (resp.status === 409 || /duplicate key|uq_products_name/i.test(details)) {
        console.warn('create product conflict (duplicate name)', details);
        showMessageBox('Nombre duplicado: ya existe un producto con ese nombre.', 'warning');
        return; // no lances error: ya mostramos mensaje
      }
      console.error('create product failed', resp.status, details);
      throw new Error(`HTTP ${resp.status}`);
    }
    showMessageBox('Producto creado', 'success');
    createProductForm.reset();
    await loadProductsForEdit();
  } catch (err) {
    console.error('create product error', err);
    showMessageBox('No se pudo crear el producto', 'error');
  }
});

/* ===========================
   Stock (con auditor?a en backend)
=========================== */
increaseStockButton?.addEventListener('click', () => applyStockDelta(+1));
decreaseStockButton?.addEventListener('click', () => applyStockDelta(-1));
selectProductToManageStock?.addEventListener('change', () => populateStockForm());

async function loadProductsForStockManagement() {
  try {
    const resp = await fetchWithAuth(ROUTES.products());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const list = await resp.json();
    stockProductsCache = (Array.isArray(list) ? list : []).map(p => ({
      id: p.id || p._id || p.uuid,
      name: p.name || p.nombre || '',
      price: Number(p.price ?? p.precio ?? 0) || 0,
      stock: Number(p.stock_quantity ?? p.stock ?? 0) || 0
    }));

    applyStockSearchFilter();
  } catch (err) {
    console.error('loadProductsForStockManagement error', err);
    showMessageBox('Error al cargar productos para stock', 'error');
  }
}

async function populateStockForm() {
  const id = selectProductToManageStock?.value || '';
  if (!id) {
    if (currentProductStockInput) currentProductStockInput.value = '';
    if (stockChangeAmountInput) stockChangeAmountInput.value = 0;
    return;
  }
  try {
    const resp = await fetchWithAuth(ROUTES.product(id));
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const p = await resp.json();
    currentProductStockInput.value = (p?.stock_quantity ?? p?.stock ?? 0);
    stockChangeAmountInput.value = 0;
  } catch (err) {
    console.error('populateStockForm error', err);
    showMessageBox('Error al cargar stock del producto', 'error');
  }
}

async function applyStockDelta(sign) {
  const id = selectProductToManageStock?.value || '';
  const qty = toNumberOr(stockChangeAmountInput?.value, 0) * sign;
  if (!id || !qty) return showMessageBox('Eleg? producto y cantidad', 'warning');
  try {
    await applyStockDeltaViaPut(id, qty);
    showMessageBox('Stock actualizado', 'success');
    await populateStockForm();
    await loadProductsForEdit();
  } catch (err) {
    console.error('applyStockDelta error', err);
    showMessageBox('No se pudo actualizar el stock', 'error');
  }
}

function enhanceOrdersUI(){
  if (!hasPerm('ventas.delete')) return;
  const box = document.getElementById('ordersList');
  if (!box) return;
  const buttons = box.querySelectorAll('.mark-delivered');
  buttons.forEach((mb) => {
    if (!(mb instanceof HTMLElement)) return;
    const parent = mb.parentElement;
    if (!parent) return;
    if (parent.querySelector('.delete-order')) return;
    const delivered = mb.hasAttribute('disabled');
    const del = document.createElement('button');
    del.className = 'delete-order px-3 py-2 rounded-lg text-white font-semibold ' + (delivered ? 'bg-red-600 hover:bg-red-700' : 'bg-white/10 cursor-not-allowed');
    const id = mb.getAttribute('data-order-id') || '';
    del.setAttribute('data-order-id', id);
    if (!delivered) del.setAttribute('disabled','');
    del.title = 'Disponible cuando la orden est? entregada';
    del.textContent = 'Eliminar';
    parent.appendChild(del);
  });
}

/* ===========================
   Stock en tr?nsito (frontend)
=========================== */
const TRANSIT_KEY = 'ens_stock_transit_v1';
function loadTransit(){
  try {
    const raw = localStorage.getItem(TRANSIT_KEY);
    const map = JSON.parse(raw || '{}');
    return (map && typeof map === 'object') ? map : {};
  } catch { return {}; }
}
function saveTransit(map){
  try { localStorage.setItem(TRANSIT_KEY, JSON.stringify(map || {})); } catch {}
}
function addTransitQty(productId, qty){
  const map = loadTransit();
  const prev = Number(map[productId] || 0) || 0;
  const next = Math.max(0, Math.floor(prev + Math.max(0, Math.floor(qty||0))));
  map[productId] = next;
  if (next === 0) delete map[productId];
  saveTransit(map);
}
function setTransitQty(productId, qty){
  const map = loadTransit();
  const next = Math.max(0, Math.floor(qty||0));
  if (next > 0) map[productId] = next; else delete map[productId];
  saveTransit(map);
}

function renderInventoryTable(items){
  if (!inventoryTableBody) return;
  if (inventoryCountEl) inventoryCountEl.textContent = `${items.length} productos`;
  if (!items.length) {
    inventoryTableBody.innerHTML = '<tr><td colspan="3" class="py-3 px-3 text-center text-gray-400">Sin productos.</td></tr>';
    return;
  }
  const rows = items.map(p => `
    <tr>
      <td class=\"py-2 px-3 text-gray-100\">${escapeHtml(p.name)}</td>
      <td class=\"py-2 px-3 text-gray-200\">${currency(p.price)}</td>
      <td class=\"py-2 px-3\"><span class=\"inline-block rounded bg-white/10 border border-white/10 px-2 py-0.5\">${p.stock}</span></td>
    </tr>
  `).join('');
  inventoryTableBody.innerHTML = rows;
}

function renderTransitTable(items){
  if (!transitTableBody) return;
  const byId = new Map(items.map(p => [String(p.id), p]));
  const map = loadTransit();
  const entries = Object.entries(map).filter(([_, qty]) => Number(qty) > 0);
  if (!entries.length) {
    transitTableBody.innerHTML = '<tr><td colspan=\"4\" class=\"py-3 px-3 text-center text-gray-400\">Sin registros en tr?nsito.</td></tr>';
    return;
  }
  const rows = entries.map(([pid, qty]) => {
    const p = byId.get(String(pid));
    const name = p ? p.name : `#${pid}`;
    const price = p ? currency(p.price) : '-';
    return `
      <tr>
        <td class=\"py-2 px-3 text-gray-100\">${escapeHtml(name)}</td>
        <td class=\"py-2 px-3 text-gray-200\">${price}</td>
        <td class=\"py-2 px-3\">${Number(qty)}</td>
        <td class=\"py-2 px-3\">
          <button class=\"action-button bg-green-600 hover:bg-green-700 px-3 py-1 text-sm btn-register-arrival\" data-product-id=\"${String(pid)}\">Registrar llegada</button>
          <button class=\"action-button bg-red-600 hover:bg-red-700 px-3 py-1 text-sm btn-clear-transit ml-2\" data-product-id=\"${String(pid)}\">Quitar</button>
        </td>
      </tr>`;
  }).join('');
  transitTableBody.innerHTML = rows;
}

async function processArrival(productId){
  const map = loadTransit();
  const pending = Math.max(0, Math.floor(Number(map[productId]||0)));
  if (!pending) { showMessageBox('No hay cantidad en transito para este producto.', 'info'); return; }
  const confirmFull = window.confirm(`A llegado lo previsto? (Pendiente: ${pending} u.)`);
  let received = 0;
  if (confirmFull) {
    received = pending;
  } else {
    const val = window.prompt('?Cuanto ingreso en realidad?', '0');
    if (val == null) return; // cancel
    const n = Math.max(0, Math.floor(Number(val)));
    if (n > pending) {
      showMessageBox('La cantidad ingresada supera a la pendiente.', 'warning');
      return;
    }
    received = n;
  }
  try {
    if (received > 0) {
      await applyStockDeltaViaPut(productId, received);
    }
    const remaining = pending - received;
    if (remaining > 0) setTransitQty(productId, remaining); else setTransitQty(productId, 0);
    showMessageBox(received > 0 ? 'Stock actualizado con la llegada.' : 'Sin cambios de stock. Queda pendiente.', 'success');
    await loadProductsForStockManagement();
    await loadProductsForEdit();
  } catch (err) {
    console.error('processArrival error', err);
    showMessageBox('No se pudo registrar la llegada.', 'error');
  }
}

addTransitButton?.addEventListener('click', (e) => {
  e.preventDefault();
  const pid = (addTransitProductSelect?.value || '').trim();
  const qty = Math.max(0, Math.floor(Number(addTransitQtyInput?.value || 0)));
  if (!pid) { showMessageBox('Selecciona? un producto', 'warning'); return; }
  if (!qty) { showMessageBox('Ingresa? una cantidad mayor a 0', 'warning'); return; }
  addTransitQty(pid, qty);
  showMessageBox('Agregado a transito', 'success');
  if (addTransitQtyInput) addTransitQtyInput.value = 1;
  try { renderTransitTable(productsCache.length ? productsCache : []); } catch {}
  loadProductsForStockManagement();
});

// Delegaci?n de eventos para acciones de la tabla de tr?nsito
document.getElementById('manageStock')?.addEventListener('click', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.classList.contains('btn-register-arrival')) {
    const pid = t.getAttribute('data-product-id');
    if (pid) processArrival(pid);
  } else if (t.classList.contains('btn-clear-transit')) {
    const pid = t.getAttribute('data-product-id');
    if (!pid) return;
    const ok = window.confirm('?Quitar registro en transito?');
    if (!ok) return;
    setTransitQty(pid, 0);
    try { renderTransitTable(productsCache.length ? productsCache : []); } catch {}
    loadProductsForStockManagement();
  }
});

/* ===========================
   Mensajes de contacto
=========================== */
async function loadContactMessages() {
  const box = document.getElementById('messagesList');
  if (!box) return;
  try {
    const candidates = [
      `${API_BASE}/contact-messages`, // conocida en backend local
      ROUTES.messages(),
      ROUTES.messagesFallback(),
      `${API_BASE}/contactos`,
      `${API_BASE}/contact`
    ];
    let resp;
    for (const url of candidates) {
      try {
        resp = await fetchWithAuth(url);
        if (resp && resp.ok) break;
      } catch {}
    }
    if (!resp || !resp.ok) throw new Error(`HTTP ${resp ? resp.status : 'fetch-failed'}`);
    const rows = await resp.json();
    const items = (Array.isArray(rows) ? rows : []).sort((a,b) => {
      const ta = new Date(a.createdAt || a.fecha || a.ts || 0).getTime();
      const tb = new Date(b.createdAt || b.fecha || b.ts || 0).getTime();
      return tb - ta;
    });

    if (!items.length) {
      box.innerHTML = '<p class="text-center text-gray-400">No hay mensajes.</p>';
      return;
    }

    box.innerHTML = '';
    const frag = document.createDocumentFragment();
    items.forEach(m => {
      const card = document.createElement('div');
      card.className = 'p-4 rounded-xl bg-white/5 border border-white/10';
      const when = m.createdAt || m.fecha || m.ts;
      const whenStr = when ? new Date(when).toLocaleString() : '';
      const emailRaw = (m.email || '').trim();
      const emailHref = safeMailto(emailRaw);
      const emailText = escapeHtml(emailRaw);
      const phoneRaw = m.phone ? String(m.phone).trim() : '';
      const phoneSan = sanitizePhone(phoneRaw);
      const telHref = phoneSan ? ('tel:' + phoneSan) : '';
      // Evita que la plantilla inserte tel sin sanitizar
      m.phone = undefined;
      card.innerHTML = `
        <div class="flex flex-col gap-2">
          <div class="flex flex-wrap gap-3 items-center">
            <span class="text-sm text-gray-400">${whenStr}</span>
            <span class="text-sm"><strong>Nombre:</strong> ${escapeHtml(m.name || m.nombre || '')}</span>
            <span class="text-sm"><strong>Email:</strong> <a href="${emailHref}" class="text-sky-400 underline" rel="nofollow noopener noreferrer">${emailText}</a></span>
            ${ m.phone ? `<span class="text-sm"><strong>Telefono:</strong> <a href="tel:${m.phone}" class="text-sky-400 underline">${m.phone}</a></span>` : '' }
          </div>
          <div class="text-base text-gray-200"><strong>Asunto:</strong> ${escapeHtml(m.subject || '')}</div>
          <div class="text-gray-100 whitespace-pre-wrap">${escapeHtml(m.message || m.mensaje || '')}</div>
          <div class="mt-3 flex items-center gap-3">
            <span class="text-sm text-gray-400">Responder por correo o telefono usando los enlaces.</span>
            <button class="action-button bg-red-600 hover:bg-red-700" data-del="${m.id || m._id || ''}">Eliminar</button>
          </div>
        </div>
      `;
      // Inserta tel seguro si corresponde
      if (phoneSan) {
        const metaRow = card.querySelector('.flex.flex-wrap.gap-3.items-center');
        if (metaRow) {
          const span = document.createElement('span');
          span.className = 'text-sm';
          const strong = document.createElement('strong');
          strong.textContent = 'Telefono:';
          const a = document.createElement('a');
          a.className = 'text-sky-400 underline';
          a.rel = 'nofollow noopener noreferrer';
          a.href = telHref;
          a.textContent = phoneRaw;
          span.appendChild(strong);
          span.appendChild(document.createTextNode(' '));
          span.appendChild(a);
          metaRow.appendChild(span);
        }
      }
      frag.appendChild(card);
    });
    box.appendChild(frag);

    box.querySelectorAll('button[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del');
        if (!id) return;
        const ok = window.confirm('?Eliminar este mensaje?');
        if (!ok) return;
        try {
          const delCandidates = [
            `${API_BASE}/contact-messages/${encodeURIComponent(id)}`,
            `${API_BASE}/mensajes/${encodeURIComponent(id)}`,
            `${API_BASE}/messages/${encodeURIComponent(id)}`,
            `${API_BASE}/contactos/${encodeURIComponent(id)}`,
            `${API_BASE}/contact/${encodeURIComponent(id)}`,
          ];
          let done = false, lastStatus = 0;
          for (const url of delCandidates) {
            const resp = await fetchWithAuth(url, { method: 'DELETE' });
            lastStatus = resp.status;
            if (resp.ok) { done = true; break; }
            if (resp.status !== 404) break; // salir para statuses relevantes
          }
          if (!done) throw new Error(`HTTP ${lastStatus || 'unknown'}`);
          showMessageBox('Mensaje eliminado', 'success');
          await loadContactMessages();
        } catch (err) {
          console.error('delete message error', err);
          showMessageBox('No se pudo eliminar el mensaje', 'error');
        }
      });
    });

  } catch (err) {
    console.error('loadContactMessages error', err);
    showMessageBox('Error al cargar mensajes', 'error');
  }
}

/* ===========================
   Compras (Orders)
=========================== */
function renderOrderCard(order){
  const itemsHtml = (order.items||[]).map(it => `
    <div class="flex items-center justify-between text-sm">
      <div class="text-gray-200">${it.name} <span class="text-gray-400">x${it.qty}</span></div>
      <div class="text-gray-300">${currency((Number(it.price||0))*Number(it.qty||0))}</div>
    </div>
  `).join('');
  const buyer = order.buyer || {};
  const delivered = String(order.status||'pending') === 'delivered';
  const canDeliver = hasPerm('ventas.write');
  return `
    <div class="rounded-xl border border-white/10 bg-white/5 p-4 shadow">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm text-gray-400">N? de compra</div>
          <div class="font-semibold text-blue-200">${order.id}</div>
        </div>
        <div class="text-right">
          <div class="text-sm text-gray-400">Total</div>
          <div class="font-semibold">${currency(order.total||0)}</div>
        </div>
      </div>
      <div class="mt-3 grid md:grid-cols-2 gap-3">
        <div>
          <div class="text-sm text-gray-400 mb-1">Cliente</div>
          <div class="text-gray-200">${buyer.nombre||''} ${buyer.apellido||''}</div>
          <div class="text-gray-400 text-sm">DNI: ${buyer.dni||''}</div>
        </div>
        <div>
          <div class="text-sm text-gray-400 mb-1">?tems</div>
          <div class="space-y-1">${itemsHtml}</div>
        </div>
      </div>
      <div class="mt-4 flex items-center justify-between">
        <div class="text-sm text-gray-400">?El producto ya fue entregado?</div>
        ${canDeliver ? `<button class="mark-delivered px-3 py-2 rounded-lg ${delivered? 'bg-green-700 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white font-semibold" data-order-id="${order.id}" ${delivered? 'disabled' : ''}>${delivered? 'Entregado' : 'Marcar como entregado'}</button>` : ''}
      </div>
    </div>`;
}

async function loadOrdersAdmin(){
  const box = document.getElementById('ordersList');
  if (!box) return;
  const orders = loadLocalOrders();
  if (!orders.length) { box.innerHTML = '<p class="text-center text-gray-400">No hay compras registradas.</p>'; return; }
  // M?s recientes primero
  orders.sort((a,b)=> new Date(b.createdAt||0) - new Date(a.createdAt||0));
  box.innerHTML = orders.map(renderOrderCard).join('');
  try { enhanceOrdersUI(); } catch {}
}

/* ===========================
   Finanzas (dashboard)
=========================== */
async function loadFinanceDashboard(){
  const from = financeFromEl?.value || '';
  const to = financeToEl?.value || '';
  // Asegura que la UI de gastos detallados exista
  try { ensureFinanceExpensesUi(); } catch {}
  const params = new URLSearchParams();
  if (from) {
    const d = parseDateInputToRange(from, false);
    if (d) params.set('from', d.toISOString());
  }
  if (to) {
    const d2 = parseDateInputToRange(to, true);
    if (d2) params.set('to', d2.toISOString());
  }
  const qs = params.toString();
  try {
    if (financeStatusEl) financeStatusEl.textContent = 'Cargando...';

    let resp = await fetchWithAuth(ROUTES.financeAnalytics(qs));
    // Fallback por si el backend a�n no tiene /analytics/finance
    if (resp && resp.status === 404) {
      resp = await fetchWithAuth(ROUTES.analyticsOverview(qs));
    }

    let data;
    if (!resp || !resp.ok) {
      // Fallback local (usa compras guardadas en localStorage)
      const orders = loadLocalOrders();
      const fromTs = from ? new Date(from).getTime() : NaN;
      const toTs = to ? new Date(to).getTime() : NaN;
      const filtered = orders.filter(o => {
        const t = new Date(o.createdAt || 0).getTime();
        if (!isNaN(fromTs) && t < fromTs) return false;
        if (!isNaN(toTs) && t > toTs) return false;
        return true;
      });
      const grossIncome = filtered.reduce((s, o) => s + Number(o.total || 0), 0);
      data = {
        grossIncome,
        stockExpenses: 0,
        salaryExpenses: 0,
        extraExpenses: 0,
        totalExpenses: 0,
        netIncome: grossIncome,
      };
    } else {
      data = await resp.json();
    }

    const grossIncome = Number(
      (data && data.grossIncome != null ? data.grossIncome : undefined) ??
      (data && data.revenue != null ? data.revenue : 0)
    );
    const stockExpenses = Number(
      (data && data.stockExpenses != null ? data.stockExpenses : undefined) ??
      (data && data.purchases != null ? data.purchases : 0)
    );
    const salaryExpenses = Number(data?.salaryExpenses || 0);
    const extraExpenses = Number(data?.extraExpenses || 0);
    let totalExpenses = data && data.totalExpenses != null
      ? Number(data.totalExpenses)
      : stockExpenses + salaryExpenses + extraExpenses;
    if (!Number.isFinite(totalExpenses)) totalExpenses = 0;
    let netIncome = data && data.netIncome != null
      ? Number(data.netIncome)
      : grossIncome - totalExpenses;
    if (!Number.isFinite(netIncome)) netIncome = 0;

    if (financeRevenueEl) financeRevenueEl.textContent = currency(grossIncome);
    if (financePurchasesEl) financePurchasesEl.textContent = currency(totalExpenses);
    if (financeGrossEl) financeGrossEl.textContent = currency(netIncome);

    const stockEl = document.getElementById('financeStockExpenses');
    if (stockEl) stockEl.textContent = currency(stockExpenses);
    const salaryEl = document.getElementById('financeSalaryExpenses');
    if (salaryEl) salaryEl.textContent = currency(salaryExpenses);
    const extraEl = document.getElementById('financeExtraExpenses');
    if (extraEl) extraEl.textContent = currency(extraExpenses);
    const totalEl = document.getElementById('financeTotalExpenses');
    if (totalEl) totalEl.textContent = currency(totalExpenses);

    // Gr�fico simple Ingreso bruto vs Gastos totales
    try {
      if (window.Chart) {
        const placeholder = document.getElementById('financeChartPlaceholder');
        let canvas = document.getElementById('financeChart');
        if (!canvas && placeholder) {
          canvas = document.createElement('canvas');
          canvas.id = 'financeChart';
          canvas.className = 'w-full h-48';
          placeholder.innerHTML = '';
          placeholder.appendChild(canvas);
        }
        if (canvas) {
          if (window.__financeChart) { window.__financeChart.destroy(); }
          window.__financeChart = new window.Chart(canvas, {
            type: 'bar',
            data: {
              labels: ['Ingreso bruto', 'Gastos totales'],
              datasets: [{
                label: 'ARS',
                data: [grossIncome, totalExpenses],
                backgroundColor: ['rgba(34,197,94,0.6)','rgba(239,68,68,0.6)'],
                borderColor: ['rgba(34,197,94,1)','rgba(239,68,68,1)'],
                borderWidth: 1
              }]
            },
            options: { responsive: true, scales: { y: { beginAtZero: true } } }
          });
        }
      }
    } catch (chartErr) {
      console.warn('loadFinanceDashboard chart error', chartErr);
    }

    // Cargar lista de gastos extraordinarios (mejor esfuerzo)
    try {
      await loadExtraExpensesList(from, to);
    } catch (errList) {
      console.warn('loadExtraExpensesList error', errList);
    }
  } catch (err) {
    console.error('loadFinanceDashboard error', err);
    try {
      const orders = loadLocalOrders();
      const fromTs = from ? new Date(from).getTime() : NaN;
      const toTs = to ? new Date(to).getTime() : NaN;
      const filtered = orders.filter(o => {
        const t = new Date(o.createdAt || 0).getTime();
        if (!isNaN(fromTs) && t < fromTs) return false;
        if (!isNaN(toTs) && t > toTs) return false;
        return true;
      });
      const grossIncome = filtered.reduce((s, o) => s + Number(o.total || 0), 0);
      const totalExpenses = 0;
      const netIncome = grossIncome;
      if (financeRevenueEl) financeRevenueEl.textContent = currency(grossIncome);
      if (financePurchasesEl) financePurchasesEl.textContent = currency(totalExpenses);
      if (financeGrossEl) financeGrossEl.textContent = currency(netIncome);
      showMessageBox('Mostrando datos locales de finanzas', 'warning');
    } catch (_) {
      showMessageBox('Error al cargar finanzas', 'error');
    }
  } finally {
    if (financeStatusEl) financeStatusEl.textContent = '';
  }
}

financeRefreshBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  loadFinanceDashboard();
});

function setFinanceRange(fromDate, toDate) {
  const toLocalDateInputValue = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  if (financeFromEl && fromDate) {
    financeFromEl.value = toLocalDateInputValue(fromDate);
  }
  if (financeToEl && toDate) {
    financeToEl.value = toLocalDateInputValue(toDate);
  }
  loadFinanceDashboard();
}

financeTodayBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  const today = new Date();
  setFinanceRange(today, today);
});

financeWeekBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  const today = new Date();
  const day = today.getDay(); // 0 (domingo) - 6 (sábado)
  const diffToMonday = (day + 6) % 7; // lunes como inicio
  const from = new Date(today);
  from.setDate(today.getDate() - diffToMonday);
  setFinanceRange(from, today);
});

financeMonthBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  setFinanceRange(from, today);
});

function ensureFinanceExpensesUi(){
  const section = document.getElementById('finance');
  if (!section) return;
  if (document.getElementById('financeExtraTableBody')) return; // ya creada

  const container = document.createElement('div');
  container.className = 'mt-8';
  container.innerHTML = `
    <h3 class="text-xl font-semibold text-white mb-3">Pagos extraordinarios</h3>
    <form id="extraExpenseForm" class="grid md:grid-cols-5 gap-3 mb-6">
      <div>
        <label class="block text-sm text-gray-400 mb-1">Fecha</label>
        <input id="extraExpDate" type="date" class="input-field">
      </div>
      <div class="md:col-span-2">
        <label class="block text-sm text-gray-400 mb-1">Concepto</label>
        <input id="extraExpDesc" type="text" class="input-field" placeholder="Ej: Luz, alquiler, servicio tecnico">
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-1">Categoría</label>
        <input id="extraExpCategory" type="text" class="input-field" placeholder="Opcional">
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-1">Monto</label>
        <input id="extraExpAmount" type="number" step="0.01" min="0" class="input-field" required>
      </div>
      <div class="md:col-span-4">
        <label class="block text-sm text-gray-400 mb-1">Observaciones</label>
        <input id="extraExpNotes" type="text" class="input-field" placeholder="Opcional">
      </div>
      <div class="flex items-end">
        <button type="submit" class="action-button bg-emerald-600 hover:bg-emerald-700 w-full">Registrar gasto</button>
      </div>
    </form>

    <h3 class="text-xl font-semibold text-white mb-3">Gastos detallados</h3>
    <div class="rounded-xl border border-white/10 bg-white/5 divide-y divide-white/10">
      <div class="flex items-center justify-between p-3">
        <div class="text-sm text-gray-400">Stock (compras de proveedores)</div>
        <div id="financeStockExpenses" class="text-sm font-semibold text-yellow-300">$0</div>
      </div>
      <div class="flex items-center justify-between p-3">
        <div class="text-sm text-gray-400">Salarios vendedores (estimado)</div>
        <div id="financeSalaryExpenses" class="text-sm font-semibold text-rose-300">$0</div>
      </div>
      <div class="p-3">
        <div class="flex items-center justify-between mb-2">
          <div class="text-sm text-gray-400">Gastos extraordinarios</div>
          <div id="financeExtraExpenses" class="text-sm font-semibold text-orange-300">$0</div>
        </div>
        <div class="max-h-40 overflow-auto border border-white/5 rounded-lg">
          <table class="min-w-full text-xs">
            <thead class="bg-white/5">
              <tr>
                <th class="px-2 py-1 text-left text-gray-400 font-medium">Fecha</th>
                <th class="px-2 py-1 text-left text-gray-400 font-medium">Concepto</th>
                <th class="px-2 py-1 text-right text-gray-400 font-medium">Monto</th>
                <th class="px-2 py-1 text-right text-gray-400 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody id="financeExtraTableBody" class="divide-y divide-white/5">
              <tr>
                <td colspan="4" class="px-2 py-2 text-center text-gray-500">
                  Sin gastos extraordinarios en el periodo.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="flex items-center justify-between p-3 bg-black/20 rounded-b-xl">
        <div class="text-sm text-gray-300">Total gastos</div>
        <div id="financeTotalExpenses" class="text-sm font-semibold text-yellow-200">$0</div>
      </div>
    </div>
  `;
  section.appendChild(container);

  const form = document.getElementById('extraExpenseForm');
  if (form && !form.__bound) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const dateInput = document.getElementById('extraExpDate');
        const descInput = document.getElementById('extraExpDesc');
        const catInput = document.getElementById('extraExpCategory');
        const amountInput = document.getElementById('extraExpAmount');
        const notesInput = document.getElementById('extraExpNotes');
        const rawAmount = amountInput?.value || '';
        const amount = Number(rawAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
          showMessageBox('Ingresa un monto válido mayor a 0', 'warning');
          return;
        }
        const payload = {
          amount,
          description: descInput?.value || '',
          category: catInput?.value || '',
          notes: notesInput?.value || '',
        };
        const dateStr = dateInput?.value || '';
        if (dateStr) {
          payload.date = dateStr;
        }
        const resp = await fetchWithAuth(ROUTES.extraExpenses(), {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (!resp || !resp.ok) {
          const tx = resp ? await resp.text().catch(() => '') : '';
          console.error('create extra expense', resp && resp.status, tx);
          showMessageBox('No se pudo registrar el gasto extraordinario', 'error');
          return;
        }
        showMessageBox('Gasto extraordinario registrado', 'success');
        // Limpiar formulario
        if (amountInput) amountInput.value = '';
        if (descInput) descInput.value = '';
        if (catInput) catInput.value = '';
        if (notesInput) notesInput.value = '';
        // Recargar lista y dashboard
        const fromVal = financeFromEl?.value || '';
        const toVal = financeToEl?.value || '';
        await loadExtraExpensesList(fromVal, toVal);
        await loadFinanceDashboard();
      } catch (err) {
        console.error('extraExpenseForm submit error', err);
        showMessageBox('Error al registrar el gasto extraordinario', 'error');
      }
    });
    form.__bound = true;
  }
}

async function loadExtraExpensesList(fromDateStr, toDateStr) {
  const tbody = document.getElementById('financeExtraTableBody');
  if (!tbody) return;
  const params = new URLSearchParams();
  if (fromDateStr) {
    const d = parseDateInputToRange(fromDateStr, false);
    if (d) params.set('from', d.toISOString());
  }
  if (toDateStr) {
    const d2 = parseDateInputToRange(toDateStr, true);
    if (d2) params.set('to', d2.toISOString());
  }
  const qs = params.toString();
  try {
    const resp = await fetchWithAuth(ROUTES.extraExpenses(qs));
    if (!resp || !resp.ok) throw new Error('HTTP ' + (resp && resp.status));
    const data = await resp.json().catch(() => []);
    const rows = Array.isArray(data) ? data : [];
    tbody.innerHTML = '';
    if (!rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="px-2 py-2 text-center text-gray-500">
            Sin gastos extraordinarios en el periodo.
          </td>
        </tr>`;
      return;
    }
    rows.slice(0, 20).forEach((r) => {
      const tr = document.createElement('tr');
      const d = r.expenseDate || r.expense_date || r.date;
      const dateLabel = d ? new Date(d).toLocaleDateString('es-AR') : '';
      const desc = r.description || r.descripcion || '';
      const amount = Number(r.amount || r.monto || 0);
      const id = r.id;
      tr.innerHTML = `
        <td class="px-2 py-1 text-left text-gray-300">${escapeHtml(dateLabel)}</td>
        <td class="px-2 py-1 text-left text-gray-300">${escapeHtml(desc)}</td>
        <td class="px-2 py-1 text-right text-gray-300">${currency(amount)}</td>
        <td class="px-2 py-1 text-right text-gray-300">
          <button
            type="button"
            class="px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-xs extra-exp-delete"
            data-extra-id="${id}"
          >Eliminar</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('loadExtraExpensesList error', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="px-2 py-2 text-center text-red-400">
          No se pudieron cargar los gastos extraordinarios.
        </td>
      </tr>`;
  }
}

document.getElementById('finance')?.addEventListener('click', async (e) => {
  const btn = e.target && e.target.closest ? e.target.closest('.extra-exp-delete') : null;
  if (!btn) return;
  const id = btn.getAttribute('data-extra-id');
  if (!id) return;
  const ok = window.confirm('¿Eliminar este gasto extraordinario?');
  if (!ok) return;
  try {
    const resp = await fetchWithAuth(ROUTES.extraExpense(id), { method: 'DELETE' });
    if (!resp || !resp.ok) {
      const tx = resp ? await resp.text().catch(() => '') : '';
      console.error('delete extra expense', resp && resp.status, tx);
      showMessageBox('No se pudo eliminar el gasto extraordinario', 'error');
      return;
    }
    showMessageBox('Gasto extraordinario eliminado', 'success');
    const fromVal = financeFromEl?.value || '';
    const toVal = financeToEl?.value || '';
    await loadExtraExpensesList(fromVal, toVal);
    await loadFinanceDashboard();
  } catch (err) {
    console.error('extra-exp-delete click error', err);
    showMessageBox('Error al eliminar el gasto extraordinario', 'error');
  }
});

async function markOrderDelivered(orderId){
  const orders = loadLocalOrders();
  const idx = orders.findIndex(o => String(o.id) === String(orderId));
  if (idx === -1) return showMessageBox('Orden no encontrada', 'error');
  const order = orders[idx];
  if (String(order.status||'pending') === 'delivered') return; // ya procesado
  // Descontar stock por cada item
  try {
    for (const it of (order.items||[])){
      const pid = it.id;
      const qty = Number(it.qty||0) || 0;
      if (!pid || !qty) continue;
      await applyStockDeltaViaPut(pid, -qty);
    }
    order.status = 'delivered';
    orders[idx] = order;
    saveLocalOrders(orders);
    showMessageBox('Orden marcada como entregada y stock actualizado', 'success');
    await loadOrdersAdmin();
  } catch (err) {
    console.error('markOrderDelivered error', err);
    showMessageBox('No se pudo actualizar el stock para esta orden', 'error');
  }
}

document.getElementById('ordersList')?.addEventListener('click', (e) => {
  const deliveredBtn = e.target.closest?.('.mark-delivered');
  if (deliveredBtn) {
    const id = deliveredBtn.getAttribute('data-order-id');
    if (id) markOrderDeliveredServer(id);
    return;
  }
  const deleteBtn = e.target.closest?.('.delete-order');
  if (deleteBtn) {
    const id = deleteBtn.getAttribute('data-order-id');
    if (!id) return;
    deleteOrderFromPanelServer(id);
  }
});

function deleteOrderFromPanel(orderId){
  const orders = loadLocalOrders();
  const idx = orders.findIndex(o => String(o.id) === String(orderId));
  if (idx === -1) { showMessageBox('Orden no encontrada', 'error'); return; }
  const order = orders[idx];
  if (String(order.status||'pending') !== 'delivered') { showMessageBox('Primero marca la orden como entregada.', 'warning'); return; }
  const ok = window.confirm('?Eliminar esta orden del panel?');
  if (!ok) return;
  orders.splice(idx, 1);
  saveLocalOrders(orders);
  showMessageBox('Orden eliminada del panel', 'success');
  loadOrdersAdmin();
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/\"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function sanitizePhone(s) {
  const v = String(s || '');
  if (!v) return '';
  const hasPlus = v.trim().startsWith('+');
  const digits = v.replace(/[^0-9]/g, '');
  return (hasPlus ? '+' : '') + digits;
}
function safeMailto(email) {
  const e = String(email || '').trim();
  if (!e) return 'mailto:';
  return 'mailto:' + encodeURIComponent(e);
}

/* ===========================
   Migraci?n / Backup (opcionales)
=========================== */
migrateDataButton?.addEventListener('click', async () => {
  const ok = window.confirm('?Ejecutar migracion de datos? (solo una vez)');
  if (!ok) return;
  try {
    const resp = await fetchWithAuth(ROUTES.migrate(), { method: 'POST' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    showMessageBox('Migracion ejecutada', 'success');
  } catch (err) {
    console.error('migrate error', err);
    showMessageBox('Error al migrar datos', 'error');
  }
});

document.getElementById('runBackupButton')?.addEventListener('click', async () => {
  try {
    const status = document.getElementById('backupStatus');
    if (status) status.textContent = 'Creando respaldo?';
    const resp = await fetchWithAuth(ROUTES.backup(), { method: 'POST' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    if (status) status.textContent = 'Respaldo creado';
    showMessageBox('Respaldo creado con ?xito', 'success');
  } catch (err) {
    console.error('backup error', err);
    showMessageBox('Error al crear respaldo', 'error');
  }
});

/* ===========================
   Cerrar sesi?n
=========================== */
logoutButton?.addEventListener('click', () => {
  TOKENS.clear();
  window.location.href = 'login.html';
});

/* ===========================
   Init
=========================== */
(function init() {
  requireSessionOrRedirect();
  bindNav();
  // Mostrar primera secci?n por defecto (coincide con tu HTML)
  showSection('createCategory');
})();


// --- Fase 1: ?rdenes desde backend ---
async function loadOrdersAdminServer(){
  const box = document.getElementById('ordersList');
  if (!box) return;
  try {
    const url = API_BASE + '/pedidos';
    const resp = await fetchWithAuth(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const rows = await resp.json();
    const orders = (Array.isArray(rows) ? rows : []).map(function(r){
      return {
        id: r.id,
        orderNumber: r.order_number,
        total: Number(r.total_amount) || 0,
        status: String(r.status).toLowerCase(),
        createdAt: r.order_date,
        buyer: {
          nombre: r.buyer_name || '',
          apellido: r.buyer_lastname || '',
          dni: r.buyer_dni || '',
          email: r.buyer_email || '',
          telefono: r.buyer_phone || ''
        },
        seller: {
          nombre: r.seller_name || '',
          email: r.seller_email || ''
        },
        paymentMethod: r.payment_method || '',
        items: Array.isArray(r.items) ? r.items : []
      };
    });
    orders.sort(function(a,b){ return new Date(b.createdAt||0) - new Date(a.createdAt||0); });
    __ordersCache = orders;
    renderOrdersList(orders);
    return;
  } catch(err) {
    console.warn('Fallo al listar /pedidos. Mostrando datos locales.', err && err.message ? err.message : err);
    const orders = loadLocalOrders();
    if (!orders.length) { box.innerHTML = '<p class="text-center text-gray-400">No hay compras registradas.</p>'; return; }
    orders.sort(function(a,b){ return new Date(b.createdAt||0) - new Date(a.createdAt||0); });
    __ordersCache = orders;
    renderOrdersList(orders);
  }
}

async function markOrderDeliveredServer(orderId){
  try {
    const url = API_BASE + '/pedidos/' + encodeURIComponent(orderId);
    const resp = await fetchWithAuth(url, { method: 'PATCH', body: JSON.stringify({ status: 'DELIVERED' }) });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    showMessageBox('Orden marcada como entregada', 'success');
    await loadOrdersAdminServer();
    return;
  } catch (err) {
    console.warn('PATCH /pedidos/:id fallo. Intentando fallback local.', err && err.message ? err.message : err);
  }
  try {
    const orders = loadLocalOrders();
    const idx = orders.findIndex(o => String(o.id) === String(orderId));
    if (idx === -1) return showMessageBox('Orden no encontrada', 'error');
    const order = orders[idx];
    if (/^delivered$/i.test(String(order.status||'pending'))) return;
    order.status = 'delivered';
    orders[idx] = order;
    saveLocalOrders(orders);
    showMessageBox('Orden marcada como entregada (local)', 'success');
    await loadOrdersAdminServer();
  } catch (err) {
    console.error('Fallback delivered error', err);
    showMessageBox('No se pudo marcar como entregada', 'error');
  }
}

async function deleteOrderFromPanelServer(orderId){
  try {
    const ok = window.confirm('?Eliminar esta orden (solo si est? entregada)?');
    if (!ok) return;
    const url = API_BASE + '/pedidos/' + encodeURIComponent(orderId);
    const resp = await fetchWithAuth(url, { method: 'DELETE' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    showMessageBox('Orden eliminada', 'success');
    await loadOrdersAdminServer();
    return;
  } catch (err) {
    console.warn('DELETE /pedidos/:id fallo. Intentando fallback local.', err && err.message ? err.message : err);
  }
  try {
    const orders = loadLocalOrders();
    const idx = orders.findIndex(o => String(o.id) === String(orderId));
    if (idx === -1) { showMessageBox('Orden no encontrada', 'error'); return; }
    const order = orders[idx];
    if (!/^delivered$/i.test(String(order.status||'pending'))) { showMessageBox('Primero marca la orden como entregada.', 'warning'); return; }
    const ok2 = window.confirm('?Eliminar esta orden del panel local?');
    if (!ok2) return;
    orders.splice(idx, 1);
    saveLocalOrders(orders);
    // Adem?s, ocultar esta orden por ID en el panel basado en backend
    hideOrderId(orderId);
    showMessageBox('Orden eliminada del panel (local)', 'success');
    loadOrdersAdminServer();
  } catch (err) {
    console.error('Fallback delete error', err);
    showMessageBox('No se pudo eliminar la orden', 'error');
  }
}

// --- Overrides y mejoras de Pedidos (Fase 1) ---
let __ordersCache = [];
function renderOrdersList(orders){
  const box = document.getElementById('ordersList');
  if (!box) return;
  if (!orders.length){ box.innerHTML = '<p class="text-center text-gray-400">No hay compras registradas.</p>'; return; }
  const hidden = new Set(loadHiddenOrders().map(x => String(x)));
  const visible = orders.filter(o => !hidden.has(String(o.id)));
  box.innerHTML = visible.map(renderOrderCard2).join('');
  try { enhanceOrdersUI(); } catch {}
}

function renderOrderCard2(order){
  const itemsHtml = (order.items || []).map((it) => {
    const qty = Number(it.qty != null ? it.qty : it.quantity || 0);
    const unit = Number(it.unit_price != null ? it.unit_price : it.price || 0);
    return `
      <div class="flex items-center justify-between text-sm">
        <div class="text-gray-200">${it.name} <span class="text-gray-400">x${qty}</span></div>
        <div class="text-gray-300">${currency(unit)} <span class="text-gray-500">c/u</span></div>
      </div>`;
  }).join('');
  const buyer = order.buyer || {};
  const seller = order.seller || {};
  const paymentMethod = (order.paymentMethod || '').toString().trim();
  const pdfHref = `${API_BASE}/pedidos/${encodeURIComponent(order.id)}/pdf`;
  const delivered = String(order.status || 'pending') === 'delivered';
  const canDeliver = hasPerm('ventas.write');
  return `
      <div class="rounded-xl border border-white/10 bg-white/5 p-4 shadow">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm text-gray-400">N de pedido</div>
            <div class="font-semibold text-blue-200">${order.orderNumber || order.id}</div>
          </div>
          <div class="text-right">
            <div class="text-sm text-gray-400">Total</div>
            <div class="font-semibold">${currency(order.total || 0)}</div>
            <div class="mt-1 text-xs text-gray-400">Estado: <span class="inline-block rounded px-2 py-0.5 border border-white/10">${String(order.status || '').toUpperCase()}</span></div>
          </div>
        </div>
        <div class="mt-3 grid md:grid-cols-2 gap-3">
          <div>
            <div class="text-sm text-gray-400 mb-1">Cliente</div>
            <div class="text-gray-200">${buyer.nombre || ''} ${buyer.apellido || ''}</div>
            <div class="text-gray-400 text-sm">DNI: ${buyer.dni || ''}</div>
            ${buyer.email ? `<div class="text-gray-400 text-sm">Email: <a class="underline" href="mailto:${buyer.email}">${buyer.email}</a></div>` : ''}
            ${buyer.telefono ? `<div class="text-gray-400 text-sm">Tel: <a class="underline" href="https://wa.me/${encodeURIComponent(String(buyer.telefono).replace(/[^0-9]/g, ''))}" target="_blank" rel="noopener">${buyer.telefono}</a></div>` : ''}
            ${(seller.nombre || seller.email) ? `<div class="text-gray-400 text-sm mt-1">Vendedor: ${seller.nombre || '(sin nombre)'}${seller.email ? ` &lt;${seller.email}&gt;` : ''}</div>` : ''}
            ${paymentMethod ? `<div class="text-gray-400 text-sm mt-1">Forma de pago: ${paymentMethod}</div>` : ''}
          </div>
          <div>
            <div class="text-sm text-gray-400 mb-1">items</div>
            <div class="space-y-1">${itemsHtml || '<div class="text-gray-400 text-sm">(sin items)</div>'}</div>
          </div>
        </div>
        <div class="mt-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <a class="px-3 py-2 rounded-lg border border-white/20 text-white/90 hover:bg-white/10" href="${pdfHref}" target="_blank" rel="noopener">Ver CR</a>
            <div class="text-sm text-gray-400">Entregado?</div>
          </div>
          ${canDeliver ? `<button class="mark-delivered px-3 py-2 rounded-lg ${delivered ? 'bg-green-700 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white font-semibold" data-order-id="${order.id}" ${delivered ? 'disabled' : ''}>${delivered ? 'Entregado' : 'Marcar como entregado'}</button>` : ''}
        </div>
      </div>`;
}

async function loadOrdersAdminServer2(){
  const box = document.getElementById('ordersList');
  if (!box) return;
  try {
    const fromEl = document.getElementById('orders-from');
    const toEl = document.getElementById('orders-to');
    const params = new URLSearchParams();
    const from = fromEl && fromEl.value ? new Date(fromEl.value) : null;
    const to = toEl && toEl.value ? new Date(toEl.value) : null;
    if (from && !isNaN(from.getTime())) params.set('from', from.toISOString());
    if (to && !isNaN(to.getTime())) params.set('to', to.toISOString());
    const qs = params.toString();
    const url = API_BASE + '/pedidos' + (qs ? ('?' + qs) : '');
    const resp = await fetchWithAuth(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const rows = await resp.json();
    const orders = (Array.isArray(rows) ? rows : []).map(function (r) {
      const items = Array.isArray(r.items)
        ? r.items.map(function (it) {
            return { name: it.name, qty: it.quantity, price: it.unit_price };
          })
        : [];
      const total = Number(r.total_amount || r.total || 0) || 0;
      const createdAt = r.order_date || r.created_at || r.createdAt || null;
      const buyerPhone = r.buyer_phone || '';
      return {
        id: r.id,
        orderNumber: r.order_number || r.orderNumber || '',
        total,
        status: String(r.status || 'PENDING').toLowerCase(),
        createdAt,
        buyer: {
          nombre: r.buyer_name || '',
          apellido: r.buyer_lastname || '',
          dni: r.buyer_dni || '',
          email: r.buyer_email || '',
          telefono: buyerPhone,
          phone: buyerPhone,
        },
        seller: {
          nombre: r.seller_name || '',
          email: r.seller_email || '',
        },
        paymentMethod: r.payment_method || '',
        items,
      };
    });
    orders.sort(function(a,b){ return new Date(b.createdAt||0) - new Date(a.createdAt||0); });
    __ordersCache = orders;
    renderOrdersList(orders);
  } catch(err) {
    console.warn('Fallo al listar /pedidos. Mostrando datos locales.', err && err.message ? err.message : err);
    const orders = loadLocalOrders();
    if (!orders.length) { box.innerHTML = '<p class="text-center text-gray-400">No hay compras registradas.</p>'; return; }
    orders.sort(function(a,b){ return new Date(b.createdAt||0) - new Date(a.createdAt||0); });
    __ordersCache = orders;
    renderOrdersList(orders);
  }
}

function filterOrdersAndRender(){
  const q = String(document.getElementById('orders-search')?.value || '').trim().toLowerCase();
  if (!q) { renderOrdersList(__ordersCache); return; }
  const filtered = __ordersCache.filter(o => {
    const name = `${o?.buyer?.nombre||''} ${o?.buyer?.apellido||''}`.toLowerCase();
    const onum = String(o.orderNumber || o.id || '').toLowerCase();
    return name.includes(q) || onum.includes(q);
  });
  renderOrdersList(filtered);
}

function exportOrdersCSV(){
  const rows = __ordersCache || [];
  const header = ['order_id','order_number','status','date','buyer_name','buyer_lastname','buyer_dni','buyer_email','buyer_phone','item_name','item_qty','item_unit_price','order_total'];
  const lines = [header.join(',')];
  for (const o of rows){
    const base = [o.id, (o.orderNumber||''), (o.status||''), (o.createdAt||''), (o.buyer?.nombre||''), (o.buyer?.apellido||''), (o.buyer?.dni||''), (o.buyer?.email||''), (o.buyer?.phone||''), '', '', '', (o.total||0)];
    if (Array.isArray(o.items) && o.items.length){
      for (const it of o.items){
        const qty = Number(it.qty != null ? it.qty : it.quantity || 0);
        const price = Number(it.price != null ? it.price : it.unit_price || 0);
        const row = base.slice();
        row[9] = (it.name||'');
        row[10] = qty;
        row[11] = price;
        lines.push(row.map(v => String(v).replace(/"/g,'""')).map(v => /[",\n]/.test(v) ? `"${v}"` : v).join(','));
      }
    } else {
      lines.push(base.map(v => String(v).replace(/"/g,'""')).map(v => /[",\n]/.test(v) ? `"${v}"` : v).join(','));
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'orders.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.getElementById('orders-search')?.addEventListener('input', filterOrdersAndRender);
document.getElementById('orders-export-csv')?.addEventListener('click', exportOrdersCSV);
document.getElementById('orders-filter-apply')?.addEventListener('click', (e) => {
  e.preventDefault();
  loadOrdersAdminServer2();
});
document.getElementById('orders-filter-today')?.addEventListener('click', (e) => {
  e.preventDefault();
  try {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const iso = `${y}-${m}-${d}`;
    const fromEl = document.getElementById('orders-from');
    const toEl = document.getElementById('orders-to');
    if (fromEl) fromEl.value = iso;
    if (toEl) toEl.value = iso;
  } catch (_){}
  loadOrdersAdminServer2();
});
document.getElementById('orders-print')?.addEventListener('click', (e) => {
  e.preventDefault();
  try {
    const rows = __ordersCache || [];
    if (!rows.length) { showMessageBox('No hay compras para imprimir','info'); return; }
    const w = window.open('', '_blank');
    if (!w) return;
    const lines = rows.map(o => {
      const when = o.createdAt ? new Date(o.createdAt).toLocaleString() : '';
      const total = currency(o.total || 0);
      const buyerName = `${o?.buyer?.nombre||''} ${o?.buyer?.apellido||''}`.trim();
      return `<tr>
        <td style="padding:4px 8px;border:1px solid #ccc;">${o.orderNumber || o.id}</td>
        <td style="padding:4px 8px;border:1px solid #ccc;">${when}</td>
        <td style="padding:4px 8px;border:1px solid #ccc;">${buyerName}</td>
        <td style="padding:4px 8px;border:1px solid #ccc;">${total}</td>
      </tr>`;
    }).join('');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Historial de compras</title></head><body>
      <h1 style="font-family:Arial, sans-serif;">Historial de compras</h1>
      <table style="border-collapse:collapse;font-family:Arial, sans-serif;font-size:12px;">
        <thead>
          <tr>
            <th style="padding:4px 8px;border:1px solid #ccc;">N° Pedido</th>
            <th style="padding:4px 8px;border:1px solid #ccc;">Fecha</th>
            <th style="padding:4px 8px;border:1px solid #ccc;">Cliente</th>
            <th style="padding:4px 8px;border:1px solid #ccc;">Total</th>
          </tr>
        </thead>
        <tbody>${lines}</tbody>
      </table>
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  } catch (err) {
    console.error('orders-print error', err);
    showMessageBox('No se pudo abrir impresión','error');
  }
});

// ===== Compras de Stock (Suppliers + Purchases) =====
async function addPurchaseItemRow(){
  const wrap = document.getElementById('purchaseItems');
  if (!wrap) return;
  const row = document.createElement('div');
  row.className = 'grid grid-cols-12 gap-2 items-center';
  row.innerHTML = `
    <select class="col-span-6 input-field" data-p-prod></select>
    <input type="number" min="1" class="col-span-3 input-field" data-p-qty placeholder="Cantidad" />
    <input type="number" min="0.01" step="0.01" class="col-span-3 input-field" data-p-cost placeholder="Costo unit." />`;
  wrap.appendChild(row);
  try {
    const resp = await fetchWithAuth(ROUTES.products());
    const rows = resp.ok ? await resp.json() : [];
    const sel = row.querySelector('[data-p-prod]');
    sel.innerHTML = '<option value="">-- Producto --</option>';
    (Array.isArray(rows)?rows:[]).forEach(p=>{
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = `${p.name} ($${p.price})`;
      sel.appendChild(opt);
    });
  } catch(_){ /* ignore */ }
}

async function loadPurchases(){
  try {
    const box = document.getElementById('purchasesList');
    if (!box) return;
    const resp = await fetchWithAuth(ROUTES.purchases());
    const rows = resp.ok ? await resp.json() : [];
    if (!rows.length){ box.innerHTML = '<p class="text-gray-400">Sin compras</p>'; return; }
    box.innerHTML = rows.map(p=>{
      const its = (p.items||[]).map(it=>
        `<div class="flex justify-between text-sm">
          <span class="text-gray-300">${it.name}</span>
          <span class="text-gray-400">x${it.quantity} � ${Number(it.unit_cost||0).toFixed(2)}</span>
        </div>`
      ).join('');
      return `
        <div class="rounded-lg border border-white/10 p-3">
          <div class="flex justify-between">
            <div class="text-blue-200 font-semibold">Compra #${p.id}</div>
            <div class="text-sm text-gray-400">${new Date(p.purchase_date).toLocaleString()}</div>
          </div>
          <div class="text-sm text-gray-400">Proveedor: ${p.supplier_name||''} ${p.supplier_cuit? '('+p.supplier_cuit+')':''}</div>
          <div class="text-sm text-gray-400">Estado: ${String(p.status||'').toUpperCase()}  Moneda: ${p.currency||'ARS'}  Total: ${currency(p.total_amount||0)}</div>
          <div class="mt-2 space-y-1">${its}</div>
          <div class="mt-2 flex justify-end">
            <button
              type="button"
              class="px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-xs purchase-delete"
              data-purchase-id="${p.id}"
            >Eliminar compra</button>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    console.error('loadPurchases error', e);
  }
}

document.getElementById('purchasesList')?.addEventListener('click', async (e) => {
  const header = e.target && e.target.closest ? e.target.closest('.text-blue-200') : null;
  if (!header) return;
  const txt = String(header.textContent || '');
  const m = txt.match(/Compra\s*#(\d+)/i);
  if (!m) return;
  const id = m[1];
  const ok = window.confirm('¿Marcar esta compra como CANCELED y eliminarla? (solo uso de prueba)');
  if (!ok) return;
  try {
    // 1) Marcar como CANCELED (si no lo estaba)
    await fetchWithAuth(ROUTES.purchase(id), {
      method: 'PATCH',
      body: JSON.stringify({ status: 'CANCELED' }),
    });
    // 2) Eliminar (soft delete en backend)
    const respDel = await fetchWithAuth(ROUTES.purchase(id), { method: 'DELETE' });
    if (!respDel || !respDel.ok) {
      const tx = respDel ? await respDel.text().catch(() => '') : '';
      console.error('delete purchase', respDel && respDel.status, tx);
      showMessageBox('No se pudo eliminar la compra. Verifica permisos/estado.', 'error');
      return;
    }
    showMessageBox('Compra de stock eliminada', 'success');
    await loadPurchases();
    await loadFinanceDashboard();
  } catch (err) {
    console.error('purchase delete error', err);
    showMessageBox('Error al eliminar la compra', 'error');
  }
});

document.getElementById('purchasesList')?.addEventListener('click', async (e) => {
  const btn = e.target && e.target.closest ? e.target.closest('.purchase-delete') : null;
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const id = btn.getAttribute('data-purchase-id');
  if (!id) return;
  const ok = window.confirm('¿Marcar esta compra como CANCELED y eliminarla? (solo uso de prueba)');
  if (!ok) return;
  try {
    await fetchWithAuth(ROUTES.purchase(id), {
      method: 'PATCH',
      body: JSON.stringify({ status: 'CANCELED' }),
    });
    const respDel = await fetchWithAuth(ROUTES.purchase(id), { method: 'DELETE' });
    if (!respDel || !respDel.ok) {
      const tx = respDel ? await respDel.text().catch(() => '') : '';
      console.error('delete purchase (button)', respDel && respDel.status, tx);
      showMessageBox('No se pudo eliminar la compra. Verifica permisos/estado.', 'error');
      return;
    }
    showMessageBox('Compra de stock eliminada', 'success');
    await loadPurchases();
    await loadFinanceDashboard();
  } catch (err) {
    console.error('purchase delete (button) error', err);
    showMessageBox('Error al eliminar la compra', 'error');
  }
});
document.getElementById('addPurchaseItem')?.addEventListener('click', addPurchaseItemRow);

document.getElementById('purchaseForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  try {
    const supplier = {
      name: document.getElementById('supName')?.value||'',
      cuit: document.getElementById('supCuit')?.value||'',
      contact_name: document.getElementById('supContact')?.value||'',
      contact_phone: document.getElementById('supPhone')?.value||'',
      contact_email: document.getElementById('supEmail')?.value||''
    };
    const currency = (document.getElementById('purCurrency')?.value||'ARS').toUpperCase();
    const notes = document.getElementById('purNotes')?.value||'';
    const rows = [...document.querySelectorAll('#purchaseItems > div')];
    const items = rows.map(r=>({
      product_id: Number(r.querySelector('[data-p-prod]')?.value||0),
      quantity: Number(r.querySelector('[data-p-qty]')?.value||0),
      unit_cost: Number(r.querySelector('[data-p-cost]')?.value||0)
    })).filter(it=> it.product_id>0 && it.quantity>0 && it.unit_cost>0);
    if (!items.length){ showMessageBox('Agrega al menos un item','warning'); return; }
    const payload = { supplier, currency, notes, items };
    const resp = await fetchWithAuth(`${API_BASE}/purchases`, { method: 'POST', body: JSON.stringify(payload) });
    if (!resp.ok){ const tx = await resp.text(); console.error('create purchase', resp.status, tx); showMessageBox('No se pudo crear la compra','error'); return; }
    showMessageBox('Compra creada y stock actualizado','success');
    document.getElementById('purchaseItems').innerHTML = '';
    await addPurchaseItemRow();
    loadPurchases();
    loadFinanceDashboard();
  } catch(err){ console.error('purchase submit', err); showMessageBox('Error creando compra','error'); }
});

// hook section change
(function(){ try { addPurchaseItemRow(); } catch{} })();

/* ====== PDF y Remitos (autenticados) ====== */
(function(){
  async function openPdfWithAuthUrl(url){
    const w = window.open('about:blank');
    try {
      const resp = await fetchWithAuth(url, { headers: { 'Accept': 'application/pdf' } });
      if (!resp || !resp.ok) throw new Error('HTTP ' + (resp && resp.status));
      const blob = await resp.blob();
      const obj = URL.createObjectURL(blob);
      if (w) w.location = obj;
    } catch (err) {
      try { if (w) w.close(); } catch {}
      console.error('No se pudo abrir el PDF', err);
      try { alert('No se pudo abrir el PDF. Verifica tu sesion.'); } catch {}
    }
  }

  // Interceptar enlaces de comprobante PDF y remito para usar Authorization
  document.addEventListener('click', (e) => {
    const a = e.target && (e.target.closest ? e.target.closest('a[href]') : null);
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (/\/pedidos\/.+\/(pdf|remito)(\b|$)/.test(href)) {
      e.preventDefault();
      const url = href.startsWith('http') ? href : (href.startsWith('/api') ? (API_BASE + href.replace(/^\/api/, '')) : (API_BASE + href));
      openPdfWithAuthUrl(url);
    }
  });

  // Hook: cuando se marque como ENTREGADA, abrir remito si backend lo provee
  const _origFetchWithAuth = window.fetchWithAuth;
  if (typeof _origFetchWithAuth === 'function') {
    window.fetchWithAuth = async function(url, opt = {}, retry = true){
      const resp = await _origFetchWithAuth(url, opt, retry);
      try {
        const method = String(opt && opt.method || 'GET').toUpperCase();
        const u = new URL(typeof url === 'string' ? url : (url && url.toString ? url.toString() : ''), API_BASE);
        if (method === 'PATCH' && /\/pedidos\/\d+$/i.test(u.pathname)) {
          const clone = resp.clone();
          let data = {};
          try { data = await clone.json(); } catch {}
          if (data && data.remitoUrl) {
            const r = data.remitoUrl;
            const finalUrl = r.startsWith('http') ? r : (r.startsWith('/api') ? (API_BASE + r.replace(/^\/api/, '')) : (API_BASE + r));
            openPdfWithAuthUrl(finalUrl);
          }
        }
      } catch {}
      return resp;
    };
  }

  // Inyectar boton "Ver remito" en ordenes entregadas
  function injectRemitoButtons(){
    const root = document.getElementById('ordersList');
    if (!root) return;
    const btns = root.querySelectorAll('.mark-delivered');
    btns.forEach((btn) => {
      const disabled = btn.hasAttribute('disabled');
      const id = btn.getAttribute('data-order-id');
      if (!id) return;
      const container = btn.parentElement || btn.closest('div');
      if (!container) return;
      if (disabled && !container.querySelector('.view-remito')){
        const b = document.createElement('button');
        b.className = 'view-remito ml-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold';
        b.textContent = 'Ver remito';
        b.addEventListener('click', (ev) => {
          ev.preventDefault();
          const url = `${API_BASE}/pedidos/${encodeURIComponent(id)}/remito`;
          openPdfWithAuthUrl(url);
        });
        container.appendChild(b);
      }
    });
  }

  const list = document.getElementById('ordersList');
  if (list) {
    const mo = new MutationObserver(injectRemitoButtons);
    mo.observe(list, { childList: true, subtree: true });
    injectRemitoButtons();
  }
})();
