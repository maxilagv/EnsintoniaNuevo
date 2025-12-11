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
  products: () => `${API_BASE}/productos`,
  product: (id) => `${API_BASE}/productos/${encodeURIComponent(id)}`,
  stock: (id) => `${API_BASE}/productos/${encodeURIComponent(id)}/stock`, // PATCH {delta, reason}
  messages: () => `${API_BASE}/mensajes`,
  messagesFallback: () => `${API_BASE}/messages`, // fallback si backend usa ingl?s
  message: (id) => `${API_BASE}/mensajes/${encodeURIComponent(id)}`,
  backup: () => `${API_BASE}/backup`,             // POST
  migrate: () => `${API_BASE}/migraciones/run`,   // POST (opcional)
  analyticsOverview: (qs = '') => `${API_BASE}/analytics/overview${qs ? ('?' + qs) : ''}`,
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
const sections = document.querySelectorAll('.section-content');

function showSection(sectionId) {
  sections.forEach(s => s.classList.add('hidden'));
  document.getElementById(sectionId)?.classList.remove('hidden');

  navButtons.forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-button[data-section="${sectionId}"]`)?.classList.add('active');

  // Cargas perezosas por secci?n
  if (sectionId === 'editCategory') {
    try { ensureDeleteButtons('category'); } catch {}
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
    loadFinanceOverview();
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

/* ===========================
   Helpers
=========================== */
function currency(n){ try { return new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS' }).format(Number(n||0)); } catch { return `$${n}`; } }
const ORDERS_KEY = 'ens_orders_v1';
function loadLocalOrders(){ try { const raw = localStorage.getItem(ORDERS_KEY); const arr = JSON.parse(raw||'[]'); return Array.isArray(arr)?arr:[]; } catch { return []; } }
function saveLocalOrders(list){ try { localStorage.setItem(ORDERS_KEY, JSON.stringify(list||[])); } catch {} }
// Ocultaci?n local de ?rdenes (para cuando el backend no permite DELETE)
const HIDDEN_ORDERS_KEY = 'ens_orders_hidden_v1';
function loadHiddenOrders(){ try { const raw = localStorage.getItem(HIDDEN_ORDERS_KEY); const arr = JSON.parse(raw||'[]'); return Array.isArray(arr)?arr:[]; } catch { return []; } }
function saveHiddenOrders(list){ try { localStorage.setItem(HIDDEN_ORDERS_KEY, JSON.stringify(list||[])); } catch {} }
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
        warranty: p.warranty || p.garantia || ''
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
   Finanzas (overview)
=========================== */
async function loadFinanceOverview(){
  const from = financeFromEl?.value || '';
  const to = financeToEl?.value || '';
  const params = new URLSearchParams();
  if (from) params.set('from', new Date(from).toISOString());
  if (to) params.set('to', new Date(to).toISOString());
  const qs = params.toString();
  try {
    if (financeStatusEl) financeStatusEl.textContent = 'Cargando...';
    let resp = await fetchWithAuth(ROUTES.analyticsOverview(qs));
    // Fallbacks por si el backend expone variantes del endpoint
    if (resp && resp.status === 404) {
      const alt1 = `${API_BASE}/analytics-overview${qs ? ('?' + qs) : ''}`;
      resp = await fetchWithAuth(alt1);
    }
    if (resp && resp.status === 404) {
      const alt2 = `${API_BASE}/admin/analytics/overview${qs ? ('?' + qs) : ''}`;
      resp = await fetchWithAuth(alt2);
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
      const revenue = filtered.reduce((s, o) => s + Number(o.total || 0), 0);
      const purchases = 0; // sin backend no conocemos compras de stock
      const gross = revenue - purchases;
      data = { revenue, purchases, gross };
    } else {
      data = await resp.json();
    }

    const revenue = Number(data?.revenue || 0);
    const purchases = Number(data?.purchases || 0);
    const gross = (data?.gross != null) ? Number(data.gross) : (revenue - purchases);
    if (financeRevenueEl) financeRevenueEl.textContent = currency(revenue);
    if (financePurchasesEl) financePurchasesEl.textContent = currency(purchases);
    if (financeGrossEl) financeGrossEl.textContent = currency(gross);

    // Gr?fico simple Ingresos vs Compras
    try {
      if (window.Chart) {
        const ctx = document.getElementById('financeChart');
        if (ctx) {
          if (window.__financeChart) { window.__financeChart.destroy(); }
          window.__financeChart = new window.Chart(ctx, {
            type: 'bar',
            data: {
              labels: ['Ingresos', 'Compras'],
              datasets: [{
                label: 'ARS',
                data: [revenue, purchases],
                backgroundColor: ['rgba(34,197,94,0.6)','rgba(234,179,8,0.6)'],
                borderColor: ['rgba(34,197,94,1)','rgba(234,179,8,1)'],
                borderWidth: 1
              }]
            },
            options: { responsive: true, scales: { y: { beginAtZero: true } } }
          });
          const ph = document.getElementById('financeChartPlaceholder');
          if (ph) ph.textContent = '';
        }
      }
    } catch {}
  } catch (err) {
    console.error('loadFinanceOverview error', err);
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
      const revenue = filtered.reduce((s, o) => s + Number(o.total || 0), 0);
      const purchases = 0;
      const gross = revenue - purchases;
      if (financeRevenueEl) financeRevenueEl.textContent = currency(revenue);
      if (financePurchasesEl) financePurchasesEl.textContent = currency(purchases);
      if (financeGrossEl) financeGrossEl.textContent = currency(gross);
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
  loadFinanceOverview();
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
  const itemsHtml = (order.items||[]).map(it => {
    const qty = Number(it.qty != null ? it.qty : it.quantity || 0);
    const unit = Number(it.unit_price != null ? it.unit_price : it.price || 0);
    return `
    <div class="flex items-center justify-between text-sm">
      <div class="text-gray-200">${it.name} <span class="text-gray-400">x${qty}</span></div>
      <div class="text-gray-300">${currency(unit)} <span class="text-gray-500">c/u</span></div>
    </div>`;
  }).join('');
  const buyer = order.buyer || {};
  const pdfHref = `${API_BASE}/pedidos/${encodeURIComponent(order.id)}/pdf`;
  const delivered = String(order.status||'pending') === 'delivered';
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
          <div class="font-semibold">${currency(order.total||0)}</div>
          <div class="mt-1 text-xs text-gray-400">Estado: <span class="inline-block rounded px-2 py-0.5 border border-white/10">${String(order.status||'').toUpperCase()}</span></div>
        </div>
      </div>
      <div class="mt-3 grid md:grid-cols-2 gap-3">
        <div>
          <div class="text-sm text-gray-400 mb-1">Cliente</div>
          <div class="text-gray-200">${buyer.nombre||''} ${buyer.apellido||''}</div>
          <div class="text-gray-400 text-sm">DNI: ${buyer.dni||''}</div>
          ${buyer.email ? `<div class="text-gray-400 text-sm">Email: <a class="underline" href="mailto:${buyer.email}">${buyer.email}</a></div>` : ''}
          ${buyer.telefono ? `<div class="text-gray-400 text-sm">Tel: <a class="underline" href="https://wa.me/${encodeURIComponent(String(buyer.telefono).replace(/[^0-9]/g,''))}" target="_blank" rel="noopener">${buyer.telefono}</a></div>` : ''}
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
        ${canDeliver ? `<button class="mark-delivered px-3 py-2 rounded-lg ${delivered? 'bg-green-700 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white font-semibold" data-order-id="${order.id}" ${delivered? 'disabled' : ''}>${delivered? 'Entregado' : 'Marcar como entregado'}</button>` : ''}
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
    const orders = (Array.isArray(rows) ? rows : []).map(function(r){
      const items = Array.isArray(r.items) ? r.items.map(it => ({ name: it.name, qty: it.quantity, price: it.unit_price })) : [];
      const total = Number(r.total_amount || r.total || 0) || 0;
      const createdAt = r.order_date || r.created_at || r.createdAt || null;
      return {
        id: r.id,
        orderNumber: r.order_number || r.orderNumber || '',
        total,
        status: String(r.status || 'PENDING').toLowerCase(),
        createdAt,
        buyer: { nombre: r.buyer_name || '', apellido: r.buyer_lastname || '', dni: r.buyer_dni || '', email: r.buyer_email || '', phone: r.buyer_phone || '' },
        items
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
    const resp = await fetchWithAuth(`${API_BASE}/purchases`);
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
          <div class="text-sm text-gray-400">Estado: ${String(p.status||'').toUpperCase()}  Moneda: ${p.currency||'ARS'}  Total: $${Number(p.total_amount||0).toFixed(2)}</div>
          <div class="mt-2 space-y-1">${its}</div>
        </div>`;
    }).join('');
  } catch (e) {
    console.error('loadPurchases error', e);
  }
}
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
    loadFinanceOverview();
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
