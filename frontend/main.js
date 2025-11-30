// Frontend catalog: clean version using REST API (no Firebase)
// Loads categories and products from API_BASE, keeps visual functions and UI behavior.

import { API_BASE } from './config.js';
// Activar modo de búsqueda simple para evitar el typeahead complejo
if (typeof window !== 'undefined') { window.__simpleSearchMode = true; }

// --- Global state ---
let categoriesData = [];
let productsFullCache = [];
let productsCache = []; // optional search cache

// Exponer caches al objeto window para que las utilidades de búsqueda
// que consultan window.productsFullCache funcionen en módulos ESM
if (typeof window !== 'undefined') {
  window.productsFullCache = window.productsFullCache || [];
  window.productsCache = window.productsCache || [];
}

function syncProductCachesToWindow() {
  try {
    if (typeof window !== 'undefined') {
      window.productsFullCache = productsFullCache;
      window.productsCache = productsCache;
    }
  } catch {}
}
let currentSort = 'recent';

// Initial load coordination
let categoriesInitialLoadComplete = false;
let productsInitialLoadComplete = false;

// Category hover animations
let categoryAnimationIntervals = {};

// --- Helpers ---
function checkAndHideMainLoader() {
  if (categoriesInitialLoadComplete && productsInitialLoadComplete) {
    hideLoading('futuristic-loader');
  }
}

function showLoading(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('hidden');
  if (id === 'futuristic-loader') document.body.style.overflow = 'hidden';
}

function hideLoading(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (id === 'futuristic-loader') {
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    setTimeout(() => {
      el.classList.add('hidden');
      document.body.style.overflow = '';
    }, 500);
  } else {
    el.classList.add('hidden');
  }
}

function showMessageBox(message, duration = null) {
  try {
    let s = String(message ?? '');
    const fixes = [
      [/est�/g, 'está'],
      [/vac�o/g, 'vacío'],
      [/opci�n/g, 'opción'],
      [/estar�/g, 'estará'],
      [/pr�ximamente/g, 'próximamente'],
      [/Eleg�/g, 'Elegí'],
      [/Complet�/g, 'Completá'],
      [/d�gitos/g, 'dígitos'],
      [/N�mero/g, 'Número'],
      [/Esta vacio/g, 'Está vacío'],
      [/esta vacio/g, 'está vacío'],
      [/valido\b/g, 'válido'],
      [/telefono\b/g, 'teléfono'],
      [/digitos\b/g, 'dígitos'],
      [/opcion\b/g, 'opción'],
      [/estara\b/g, 'estará'],
      [/proximamente\b/g, 'próximamente'],
      [/conexion\b/g, 'conexión'],
      [/Compra registrada! Numero de compra:/g, '¡Compra registrada! Número de compra:'],
      [/^Compra registrada!$/g, '¡Compra registrada!']
    ];
    for (const [rgx, rep] of fixes) { s = s.replace(rgx, rep); }
    message = s;
  } catch {}
  const box = document.createElement('div');
  box.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[120]';
  box.innerHTML = `
    <div class="bg-gray-900/90 backdrop-blur-sm p-8 rounded-2xl shadow-xl text-center max-w-sm mx-auto flex flex-col items-center border border-white/20 text-futuristic-ink">
      <p class="text-xl font-semibold mb-4">${message}</p>
      ${duration === null ? '<button onclick="this.parentNode.parentNode.remove()" class="px-5 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 shadow-sm focus:ring-2 focus:ring-brand-500/30 active:translate-y-px btn">Cerrar</button>' : ''}
      ${duration !== null ? '<div class="loader-circle border-t-2 border-b-2 border-brand-1 rounded-full w-8 h-8 animate-spin mt-4"></div>' : ''}
    </div>`;
  document.body.appendChild(box);
  if (duration !== null) {
    box.classList.add('message-box-autodismiss');
    setTimeout(() => { if (box.parentNode) box.remove(); }, duration);
  }
  return box;
}

async function registerClientFromCatalog(payload) {
  const resp = await fetch(`${API_BASE}/clients/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  if (resp.ok) return { ok: true };
  if (resp.status === 400) {
    const data = await resp.json().catch(() => ({}));
    const msg = (data && data.error) || 'Datos inválidos, revisá los campos.';
    return { ok: false, message: msg };
  }
  if (resp.status === 409) {
    const data = await resp.json().catch(() => ({}));
    const msg = (data && data.error) || 'Ya existe un cliente con ese documento.';
    return { ok: false, message: msg };
  }
  const tx = await resp.text().catch(() => '');
  console.error('client register error', resp.status, tx);
  return { ok: false, message: 'No se pudo registrar el cliente. Intenta nuevamente.' };
}

function getClientAccessToken() {
  try {
    return localStorage.getItem('clientAccessToken') || '';
  } catch {
    return '';
  }
}

function saveClientSession(data) {
  try {
    const { accessToken, refreshToken, user } = data || {};
    if (!accessToken || !refreshToken) return;
    localStorage.setItem('clientLoggedIn', 'true');
    localStorage.setItem('clientAccessToken', accessToken);
    localStorage.setItem('clientRefreshToken', refreshToken);
    if (user) localStorage.setItem('clientUser', JSON.stringify(user));
  } catch {}
}

function clearClientSession() {
  try {
    localStorage.removeItem('clientLoggedIn');
    localStorage.removeItem('clientAccessToken');
    localStorage.removeItem('clientRefreshToken');
    localStorage.removeItem('clientUser');
  } catch {}
}

function updateClientAuthUi() {
  let logged = false;
  try {
    logged = localStorage.getItem('clientLoggedIn') === 'true' && !!localStorage.getItem('clientAccessToken');
  } catch {
    logged = false;
  }
  const btnRegister = document.getElementById('open-client-register');
  const btnRegisterMobile = document.getElementById('open-client-register-mobile');
  const btnLogin = document.getElementById('open-client-login');
  const btnLoginMobile = document.getElementById('open-client-login-mobile');
  if (logged) {
    if (btnRegister) btnRegister.classList.add('hidden');
    if (btnRegisterMobile) btnRegisterMobile.classList.add('hidden');
    if (btnLogin) btnLogin.textContent = 'Mi cuenta';
    if (btnLoginMobile) btnLoginMobile.textContent = 'Mi cuenta';
  } else {
    if (btnRegister) btnRegister.classList.remove('hidden');
    if (btnRegisterMobile) btnRegisterMobile.classList.remove('hidden');
    if (btnLogin) btnLogin.textContent = 'Iniciar sesión';
    if (btnLoginMobile) btnLoginMobile.textContent = 'Iniciar sesión';
  }
}

function setupClientRegistration() {
  const openBtn = document.getElementById('open-client-register');
  const openBtnMobile = document.getElementById('open-client-register-mobile');
  const overlay = document.getElementById('client-register-overlay');
  const form = document.getElementById('client-register-form');
  if (!overlay || !form) return;

  if (!form.dataset.clientRegisterLoginRowInject) {
    form.dataset.clientRegisterLoginRowInject = '1';
    const row = document.createElement('div');
    row.className = 'flex items-center justify-end text-xs text-futuristic-mute mt-1';
    row.innerHTML = 'Ya tenes una cuenta? <button type="button" id="client-register-open-login" class="underline hover:text-brand-1 ml-1">Iniciar sesion</button>';
    const last = form.lastElementChild;
    if (last) {
      form.insertBefore(row, last);
    } else {
      form.appendChild(row);
    }
  }

  const closeSelectors = ['[data-client-register-close]', '#client-register-close'];
  function openOverlay() {
    overlay.classList.remove('hidden');
  }
  function closeOverlay() {
    overlay.classList.add('hidden');
  }

  function bindOpenButton(btn) {
    if (btn && !btn.dataset.clientRegisterBound) {
      btn.dataset.clientRegisterBound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openOverlay();
        try { closeMobileMenu(); } catch {}
      });
    }
  }

  bindOpenButton(openBtn);
  bindOpenButton(openBtnMobile);
  closeSelectors.forEach((sel) => {
    overlay.querySelectorAll(sel).forEach((btn) => {
      if (!btn.dataset.clientRegisterCloseBound) {
        btn.dataset.clientRegisterCloseBound = '1';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          closeOverlay();
        });
      }
    });
  });

  const switchToLogin = document.getElementById('client-register-open-login');
  if (switchToLogin && !switchToLogin.dataset.clientRegisterOpenLoginBound) {
    switchToLogin.dataset.clientRegisterOpenLoginBound = '1';
    switchToLogin.addEventListener('click', (e) => {
      e.preventDefault();
      closeOverlay();
      try { setupClientLogin(); } catch {}
      const loginOverlay = document.getElementById('client-login-overlay');
      if (loginOverlay) loginOverlay.classList.remove('hidden');
    });
  }

  if (!form.dataset.clientRegisterSubmitBound) {
    form.dataset.clientRegisterSubmitBound = '1';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = String(document.getElementById('client-name')?.value || '').trim();
      const fantasyName = String(document.getElementById('client-fantasy-name')?.value || '').trim();
      const rawTaxId = String(document.getElementById('client-taxid')?.value || '').trim();
      const taxId = rawTaxId.replace(/\D+/g, '');
      const taxIdType = String(document.getElementById('client-taxid-type')?.value || '').trim() || null;
      const clientType = String(document.getElementById('client-type')?.value || 'FISICA').toUpperCase();
      const ivaCondition = String(document.getElementById('client-iva')?.value || '').trim();
      const email = String(document.getElementById('client-email')?.value || '').trim();
      const phoneRaw = String(document.getElementById('client-phone')?.value || '').trim();
      const phone = phoneRaw;
      const address = String(document.getElementById('client-address')?.value || '').trim();
      const locality = String(document.getElementById('client-locality')?.value || '').trim();
      const province = String(document.getElementById('client-province')?.value || '').trim();
      const postalCode = String(document.getElementById('client-postalcode')?.value || '').trim();
      const notes = String(document.getElementById('client-notes')?.value || '').trim();
      const accept = document.getElementById('client-accept-terms')?.checked;
      const password = String(document.getElementById('client-password')?.value || '').trim();
      const passwordConfirm = String(document.getElementById('client-password-confirm')?.value || '').trim();

      if (!password || password.length < 8) {
        showMessageBox('La contrasena debe tener al menos 8 caracteres.');
        return;
      }
      if (password !== passwordConfirm) {
        showMessageBox('Las contrasenas no coinciden.');
        return;
      }

      if (!name || !taxId || !ivaCondition || !email || !phone) {
        showMessageBox('Completá Nombre, documento, IVA, email y teléfono.');
        return;
      }
      if (taxId.length < 6) {
        showMessageBox('El documento debe tener al menos 6 dígitos.');
        return;
      }
      if (!/.+@.+\..+/.test(email)) {
        showMessageBox('Ingresá un email válido.');
        return;
      }
      const phoneDigits = phone.replace(/[^0-9]/g, '');
      if (phoneDigits.length < 6) {
        showMessageBox('Ingresá un teléfono válido (6+ dígitos).');
        return;
      }
      if (!accept) {
        showMessageBox('Debés aceptar la política de privacidad para continuar.');
        return;
      }

      const payload = {
        name,
        fantasyName: fantasyName || undefined,
        clientType,
        taxId,
        taxIdType: taxIdType || undefined,
        ivaCondition,
        email,
        phone,
        address: address || undefined,
        locality: locality || undefined,
        province: province || undefined,
        postalCode: postalCode || undefined,
        notes: notes || undefined,
        password,
      };

      const result = await registerClientFromCatalog(payload);
      if (!result.ok) {
        showMessageBox(result.message || 'No se pudo registrar el cliente.');
        return;
      }

      // Autologin del cliente reci�n creado
      try {
        const respLogin = await fetch(`${API_BASE}/login-db`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        if (respLogin.ok) {
          const data = await respLogin.json().catch(() => null);
          if (data && data.accessToken && data.refreshToken) {
            saveClientSession(data);
          }
        }
      } catch (_) {}

      form.reset();
      closeOverlay();
      updateClientAuthUi();
      showMessageBox('Recibimos tu solicitud de alta de cliente. Ya pod�s iniciar compras.');
    });
  }
}

// --- Category image hover animation ---
function startCategoryImageAnimation(cardElement) {
  const imgElement = cardElement.querySelector('.category-image-animated');
  if (!imgElement) return;
  const productImages = JSON.parse(cardElement.dataset.productImages || '[]');
  if (productImages.length <= 1) {
    stopCategoryImageAnimation(cardElement);
    return;
  }
  stopCategoryImageAnimation(cardElement);
  let currentIndex = productImages.indexOf(imgElement.src);
  if (currentIndex === -1 || currentIndex >= productImages.length - 1) currentIndex = -1;
  const intervalId = setInterval(() => {
    currentIndex = (currentIndex + 1) % productImages.length;
    imgElement.classList.add('fade-out');
    setTimeout(() => {
      imgElement.src = productImages[currentIndex];
      imgElement.classList.remove('fade-out');
      imgElement.classList.add('fade-in');
      setTimeout(() => imgElement.classList.remove('fade-in'), 600);
    }, 300);
  }, 2000);
  categoryAnimationIntervals[cardElement.dataset.categoryName] = intervalId;
}

function stopCategoryImageAnimation(cardElement) {
  const key = cardElement.dataset.categoryName;
  if (categoryAnimationIntervals[key]) {
    clearInterval(categoryAnimationIntervals[key]);
    delete categoryAnimationIntervals[key];
    const imgElement = cardElement.querySelector('.category-image-animated');
    if (imgElement) {
      imgElement.classList.add('fade-out');
      setTimeout(() => {
        imgElement.src = cardElement.dataset.originalImage;
        imgElement.classList.remove('fade-out');
        imgElement.classList.add('fade-in');
        setTimeout(() => imgElement.classList.remove('fade-in'), 600);
      }, 300);
    }
  }
}

// --- Fullscreen image modal ---
window.openFullscreenImage = function(imageUrl, altText) {
  const modal = document.getElementById('image-fullscreen-modal');
  const image = document.getElementById('fullscreen-image');
  if (!modal || !image) return;
  modal.classList.add('open');
  image.onerror = null;
  image.src = '';
  image.alt = '';
  image.onerror = function() {
    image.src = 'https://placehold.co/600x400/FF0000/FFFFFF?text=Error+Carga+Imagen';
    image.alt = 'Error al cargar la imagen';
    showMessageBox('No se pudo cargar la imagen en pantalla completa.');
  };
  image.src = imageUrl;
  image.alt = altText || '';
  document.body.style.overflow = 'hidden';
};

window.closeFullscreenImage = function() {
  const modal = document.getElementById('image-fullscreen-modal');
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
};

// --- Mobile menu helpers ---
function getMobileMenuEls() {
  return { btn: document.getElementById('mobile-menu-button'), nav: document.getElementById('mobile-nav') };
}
function openMobileMenu() {
  const { nav, btn } = getMobileMenuEls();
  if (!nav || !btn) return;
  nav.classList.remove('hidden', 'translate-x-full');
  nav.classList.add('translate-x-0', 'open');
  nav.removeAttribute('aria-hidden');
  nav.removeAttribute('inert');
  btn.classList.add('open');
  btn.setAttribute('aria-expanded', 'true');
  const closeBtn = document.getElementById('mobile-nav-close');
  if (closeBtn) closeBtn.focus();
}
function closeMobileMenu() {
  const { nav, btn } = getMobileMenuEls();
  if (!nav || !btn) return;
  nav.classList.remove('translate-x-0', 'open');
  nav.classList.add('translate-x-full');
  setTimeout(() => { nav.classList.add('hidden'); }, 300);
  nav.setAttribute('aria-hidden', 'true');
  nav.setAttribute('inert', '');
  btn.classList.remove('open');
  btn.setAttribute('aria-expanded', 'false');
  try { btn.focus(); } catch {}
  try { closeCategoriesSubmenu(); } catch {}
}
window.openMobileMenu = openMobileMenu;
window.closeMobileMenu = closeMobileMenu;

// --- Category submenu toggle ---
function toggleCategoriesSubmenu() {
  const categoriesSubmenu = document.getElementById('categories-submenu');
  const categoriesToggleIcon = document.getElementById('categories-toggle-icon');
  if (categoriesSubmenu && categoriesToggleIcon) {
    categoriesSubmenu.classList.toggle('hidden');
    categoriesToggleIcon.classList.toggle('fa-chevron-down');
    categoriesToggleIcon.classList.toggle('fa-chevron-up');
  }
}
function closeCategoriesSubmenu() {
  const categoriesSubmenu = document.getElementById('categories-submenu');
  const categoriesToggleIcon = document.getElementById('categories-toggle-icon');
  if (categoriesSubmenu && categoriesToggleIcon && !categoriesSubmenu.classList.contains('hidden')) {
    categoriesSubmenu.classList.add('hidden');
    categoriesToggleIcon.classList.remove('fa-chevron-up');
    categoriesToggleIcon.classList.add('fa-chevron-down');
  }
}

// --- Login de cliente (catalogo) ---
function setupClientLogin() {
  const overlay = document.getElementById('client-login-overlay');
  const form = document.getElementById('client-login-form');
  const openBtn = document.getElementById('open-client-login');
  const openBtnMobile = document.getElementById('open-client-login-mobile');
  const openRegisterBtn = document.getElementById('client-login-open-register');
  if (!overlay || !form) return;

  const closeSelectors = ['[data-client-login-close]', '#client-login-close'];

  function openOverlay() {
    overlay.classList.remove('hidden');
  }
  function closeOverlay() {
    overlay.classList.add('hidden');
  }

  function bindOpen(btn) {
    if (btn && !btn.dataset.clientLoginBound) {
      btn.dataset.clientLoginBound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openOverlay();
        try { closeMobileMenu(); } catch {}
      });
    }
  }

  bindOpen(openBtn);
  bindOpen(openBtnMobile);

  closeSelectors.forEach((sel) => {
    overlay.querySelectorAll(sel).forEach((btn) => {
      if (!btn.dataset.clientLoginCloseBound) {
        btn.dataset.clientLoginCloseBound = '1';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          closeOverlay();
        });
      }
    });
  });

  if (openRegisterBtn && !openRegisterBtn.dataset.clientLoginOpenRegisterBound) {
    openRegisterBtn.dataset.clientLoginOpenRegisterBound = '1';
    openRegisterBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeOverlay();
      const registerOverlay = document.getElementById('client-register-overlay');
      if (registerOverlay) registerOverlay.classList.remove('hidden');
    });
  }

  if (!form.dataset.clientLoginSubmitBound) {
    form.dataset.clientLoginSubmitBound = '1';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = String(document.getElementById('client-login-email')?.value || '').trim();
      const password = String(document.getElementById('client-login-password')?.value || '').trim();
      if (!email || !password) {
        showMessageBox('Ingresa email y contrase�a.');
        return;
      }
      try {
        const resp = await fetch(`${API_BASE}/login-db`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => null);
          const msg = (data && data.error) || 'Usuario o contrase�a incorrectos.';
          showMessageBox(msg);
          return;
        }
        const data = await resp.json().catch(() => null);
        if (!data || !data.accessToken || !data.refreshToken) {
          showMessageBox('Respuesta inv�lida del servidor.');
          return;
        }
        saveClientSession(data);
        closeOverlay();
        updateClientAuthUi();
        showMessageBox('Sesi�n iniciada. Ya pod�s realizar compras.');
      } catch (err) {
        console.error('client login error', err);
        showMessageBox('No se pudo iniciar sesi�n. Intenta nuevamente.');
      }
    });
  }
}

// --- API helpers ---
async function apiGet(path) {
  const url = `${API_BASE}${path}`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`GET ${path} -> ${resp.status}`);
  return resp.json();
}

function mapProduct(row) {
  return {
    id: row.id,
    name: row.name || row.nombre || 'Producto',
    description: row.description || row.descripcion || '',
    price: row.price ?? row.precio,
    imageUrl: row.image_url || row.imageUrl || row.imagen || null,
    categoryName: row.category_name || row.category || row.categoria || '',
    specifications: row.specifications || row.specs || row.especificaciones,
    stock: row.stock_quantity ?? row.stock,
    createdAt: row.created_at || row.createdAt || null,
  };
}

// --- Simple search helpers (from scratch) ---
function normalizeNoAccents(s) {
  try { return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch { return String(s||'').toLowerCase(); }
}

function findFirstMatch(term) {
  const q = normalizeNoAccents(term).trim();
  if (!q) return null;
  const base = Array.isArray(window.productsFullCache) ? window.productsFullCache : [];
  // nombre (prefijo)
  let m = base.find(p => normalizeNoAccents(p.name || p.nombre).startsWith(q));
  if (m) return m;
  // nombre (contiene)
  m = base.find(p => normalizeNoAccents(p.name || p.nombre).includes(q));
  if (m) return m;
  // categoría (prefijo)
  m = base.find(p => normalizeNoAccents(p.categoryName || p.categoria).startsWith(q));
  if (m) return m;
  // id exacto
  m = base.find(p => String(p.id) === q);
  return m || null;
}

async function openProductById(id) {
  try {
    const prod = await fetchProductById(id);
    if (!prod) return;
    renderProductDetail(prod);
    openPD();
  } catch {}
}

// --- Categories ---
async function loadCategories() {
  showLoading('categories-loading-spinner');
  try {
    const categoriesContainer = document.getElementById('categories-container');
    const categoriesSubmenu = document.getElementById('categories-submenu');
    if (categoriesContainer) categoriesContainer.innerHTML = '';
    if (categoriesSubmenu) categoriesSubmenu.innerHTML = '';

    const rows = await apiGet('/categorias');
    categoriesData = Array.isArray(rows) ? rows : [];

    // Render main grid
    if (categoriesContainer) {
      if (!categoriesData.length) {
        categoriesContainer.innerHTML = '<p class="text-center text-futuristic-mute col-span-full">No hay categorías disponibles.</p>';
      } else {
        categoriesData.forEach(cat => {
          const name = cat.name || cat.nombre || 'Categoría';
          const imageUrl = cat.image_url || cat.imageUrl || 'https://placehold.co/600x400/cccccc/333333?text=Sin+Imagen';
          const desc = cat.description || cat.descripcion || 'Descripción no disponible.';
          const card = document.createElement('div');
          card.className = 'category-card group rounded-2xl flex flex-col cursor-pointer';
          card.dataset.categoryName = name;
          card.dataset.originalImage = imageUrl;
          card.dataset.productImages = JSON.stringify([imageUrl]);
          card.addEventListener('click', (e) => { e.preventDefault(); goToCategory(name); });
          card.addEventListener('mouseenter', () => startCategoryImageAnimation(card));
          card.addEventListener('mouseleave', () => stopCategoryImageAnimation(card));
          card.innerHTML = `
            <div class="media-frame relative aspect-[4/3] overflow-hidden rounded-t-2xl">
              <img loading="lazy" decoding="async" src="${imageUrl}" alt="${name}"
                   class="main-media w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02] category-image-animated"
                   onerror="this.onerror=null;this.src='https://placehold.co/600x400/cccccc/333333?text=Sin+Imagen';">
              <img src="https://i.postimg.cc/sXRFDbfv/Gemini-Generated-Image-6b363b6b363b6b36.png"
                   alt="Ensintonia"
                   class="pointer-events-none absolute top-2 right-2 w-9 h-9 rounded-full shadow-md opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-200">
            </div>
            <div class="p-6 sm:p-7">
              <h3 class="text-xl sm:text-2xl font-semibold mb-2 line-clamp-2 text-futuristic-ink">${name}</h3>
              <p class="text-base text-futuristic-mute mb-4 line-clamp-2">${desc}</p>
              <button class="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 shadow-sm focus:ring-2 focus:ring-brand-500/30 active:translate-y-px w-full btn">Ver Categoría</button>
            </div>`;
          categoriesContainer.appendChild(card);
        });
      }
    }

    // Render submenu (mobile)
    if (categoriesSubmenu && categoriesData.length) {
      categoriesData.forEach(cat => {
        const name = cat.name || cat.nombre || 'Categoría';
        const li = document.createElement('li');
        li.innerHTML = `
          <a href="/catalogo.html?cat=${encodeURIComponent(name)}"
             data-cat="${String(name).replace(/\"/g,'&quot;')}"
             onclick="goToCategory(this.dataset.cat); return false;"
             class="block py-2 text-base text-futuristic-ink hover:text-brand-1 transition duration-200">${name}</a>`;
        categoriesSubmenu.appendChild(li);
      });
    }
  } catch (e) {
    console.error('loadCategories(API) error:', e);
    showMessageBox('Error al cargar las categorías.');
  } finally {
    hideLoading('categories-loading-spinner');
    categoriesInitialLoadComplete = true;
    checkAndHideMainLoader();
  }
}

// --- Products ---
function getCreatedAtTS(v) {
  if (!v) return 0;
  if (typeof v === 'string') { const d = new Date(v); return isNaN(d) ? 0 : d.getTime(); }
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}

// Combined filters (search + price)
function normalizeStr(s){ return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function flattenSpecs(prod){
  const src = prod.specifications || prod.specs || prod.especificaciones;
  if (!src) return '';
  try {
    if (Array.isArray(src)) {
      return src.map(it => {
        if (!it) return '';
        if (typeof it === 'string') return it;
        if (typeof it === 'object') {
          const k = it.key ?? it.clave ?? it.nombre ?? it.name ?? '';
          const v = it.value ?? it.valor ?? it.val ?? '';
          return `${k}: ${v}`;
        }
        return '';
      }).join(' ');
    }
    if (typeof src === 'object') {
      return Object.entries(src).map(([k,v]) => `${k}: ${v}`).join(' ');
    }
    return String(src);
  } catch { return ''; }
}
function computeFilteredList(){
  // Si hay una lista filtrada explícita (móvil), úsala como base
  let list = (Array.isArray(window.__filteredList) && window.__filteredList.length)
    ? [...window.__filteredList]
    : [...productsFullCache];

  // Structured filters
  const catFilter = (window.__searchCategory || '').trim().toLowerCase();
  const idFilter = (window.__searchId || '').trim().toLowerCase();
  if (catFilter) list = list.filter(p => (p.categoryName || p.category || '').toLowerCase() === catFilter);
  if (idFilter) list = list.filter(p => String(p.id).toLowerCase().includes(idFilter));

  // Free-text search tokens (AND)
  const q = (window.__searchQuery || '').trim();
  if (q) {
    const tokens = normalizeStr(q).split(/\s+/).filter(Boolean);
    list = list.filter(p => {
      const hayRaw = [p.name, p.description, p.categoryName, p.category, p.id, flattenSpecs(p)].filter(Boolean).join(' ');
      const hay = normalizeStr(hayRaw);
      return tokens.every(t => hay.includes(t));
    });
  }

  // Price range
  const hasMin = typeof window.__priceMin === 'number';
  const hasMax = typeof window.__priceMax === 'number';
  const minV = hasMin ? window.__priceMin : 0;
  const maxV = hasMax ? window.__priceMax : Infinity;
  if (hasMin || hasMax) {
    list = list.filter(p => {
      const priceNum = Number(p.price ?? p.precio);
      const val = isFinite(priceNum) ? priceNum : 0;
      return val >= minV && val <= maxV;
    });
  }
  try { updateActiveFiltersUI(); } catch {}
  return list;
}

function applySortAndRender() {
  const container = document.getElementById('contenedor-productos');
  if (!container) return;
  const grid = container;
  try {
    grid.classList.add('transitioning');
  } catch {}

  let list = computeFilteredList();
  list.sort((a,b)=>{
    if (currentSort === 'recent') return getCreatedAtTS(b.createdAt) - getCreatedAtTS(a.createdAt);
    if (currentSort === 'old')    return getCreatedAtTS(a.createdAt) - getCreatedAtTS(b.createdAt);
    if (currentSort === 'az')     return (a.name||'').localeCompare(b.name||'', 'es', {sensitivity:'base'});
    if (currentSort === 'za')     return (b.name||'').localeCompare(a.name||'', 'es', {sensitivity:'base'});
    return 0;
  });

  container.innerHTML = '';
  if (!list.length) {
    container.innerHTML = '<p class="col-span-full text-center text-futuristic-mute">No hay productos disponibles.</p>';
  } else {
    list.forEach(p => {
      const id = p.id;
      const name = p.name || 'Producto';
      const description = p.description || '';
      const imageUrl = p.imageUrl || 'https://placehold.co/600x400/cccccc/333333?text=Sin+Imagen';
      const price = p.price;
      const catLabel = p.categoryName || p.category || '';

      let mediaHtml = `
        <div class="media-frame relative aspect-[4/3] overflow-hidden rounded-t-2xl">
          ${catLabel ? `<span class="cat-badge">${catLabel}</span>` : ''}
          <img loading="lazy" decoding="async" src="${imageUrl}" alt="${name}"
               class="w-full h-full object-cover"
               onerror="this.onerror=null;this.src='https://placehold.co/600x400/cccccc/333333?text=Sin+Imagen';">
        </div>`;

      const priceHtml = price != null
        ? `<div class="mt-3"><span class="price-chip"><i class="fa-solid fa-tag text-white/80 text-xs"></i>${currency(price)}</span></div>`
        : '<p class="text-futuristic-mute italic mt-3 text-sm">Consultar</p>';

      const card = document.createElement('div');
      card.id = `product-${id}`;
      card.dataset.id = id;
      card.dataset.reveal = '1';
      card.className = 'product-card group rounded-2xl flex flex-col cursor-pointer';
      card.innerHTML = `
        ${mediaHtml}
        <div class="p-4 sm:p-5 flex flex-col flex-grow">
          <h3 class="text-[15px] leading-snug line-clamp-2 text-futuristic-ink">${name}</h3>
          <p class="text-futuristic-mute text-xs mt-1 flex-grow line-clamp-3">${description}</p>
          ${priceHtml}
        </div>`;
      container.appendChild(card);
    });
  }

  enhanceProductCardsForReveal();
  try {
    requestAnimationFrame(() => {
      grid.classList.remove('transitioning');
    });
  } catch {}
}

function enhanceProductCardsForReveal() {
  const cards = document.querySelectorAll('.product-card[data-reveal]');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('reveal-show');
        obs.unobserve(en.target);
      }
    });
  }, { threshold: 0.15 });
  cards.forEach(c => {
    if (!c.dataset.revealInit) {
      c.dataset.revealInit = '1';
      obs.observe(c);
    }
  });
}

async function loadAllProducts() {
  showLoading('products-loading-spinner');
  try {
    const rows = await apiGet('/productos');
    productsFullCache = Array.isArray(rows) ? rows.map(mapProduct) : [];
    productsCache = productsFullCache.map(p => ({
      id: p.id,
      name: normalizeNoAccents(p.name || p.nombre || '').replace(/\s+/g,' ').trim()
    }));
    syncProductCachesToWindow();
    applySortAndRender();
    try { if (typeof window.__refreshMobileSuggestions === 'function') window.__refreshMobileSuggestions(); } catch {}
  } catch (e) {
    console.error('loadAllProducts(API) error:', e);
    showMessageBox('Error al cargar productos.');
  } finally {
    hideLoading('products-loading-spinner');
    productsInitialLoadComplete = true;
    checkAndHideMainLoader();
  }
}

async function loadProductsByCategory(categoryName) {
  showLoading('products-loading-spinner');
  try {
    // If backend supports filtering, you can change to /productos?categoria=...
    const rows = await apiGet('/productos');
    const all = Array.isArray(rows) ? rows.map(mapProduct) : [];
    const norm = String(categoryName || '').toLowerCase();
    productsFullCache = all.filter(p => (p.categoryName || '').toLowerCase() === norm);
    productsCache = productsFullCache.map(p => ({
      id: p.id,
      name: normalizeNoAccents(p.name || p.nombre || '').replace(/\s+/g,' ').trim()
    }));
    syncProductCachesToWindow();
    applySortAndRender();
    try { if (typeof window.__refreshMobileSuggestions === 'function') window.__refreshMobileSuggestions(); } catch {}
  } catch (e) {
    console.error('loadProductsByCategory(API) error:', e);
    showMessageBox('Error al cargar productos por categoría.');
  } finally {
    hideLoading('products-loading-spinner');
    productsInitialLoadComplete = true;
    checkAndHideMainLoader();
  }
}

// --- Product detail modal helpers ---
const $pd = {
  overlay: document.getElementById('pd-overlay'),
  title: document.getElementById('pd-title'),
  image: document.getElementById('pd-image'),
  thumbs: document.getElementById('pd-thumbs'),
  price: document.getElementById('pd-price'),
  badges: document.getElementById('pd-badges'),
  paneDesc: document.getElementById('pd-pane-desc'),
  paneSpecs: document.getElementById('pd-pane-specs'),
  paneWarranty: document.getElementById('pd-pane-warranty'),
  id: document.getElementById('pd-id'),
  stock: document.getElementById('pd-stock'),
  whatsapp: document.getElementById('pd-whatsapp'),
  closeBtn: document.getElementById('pd-close')
};

function currency(n) {
  try { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n); } catch { return n; }
}

// --- Cart helpers ---
const CART_KEY = 'ens_cart_v1';
function loadCart(){
  try { const raw = localStorage.getItem(CART_KEY); const arr = JSON.parse(raw||'[]'); return Array.isArray(arr) ? arr : []; } catch { return []; }
}
let cart = loadCart();
function saveCart(){ try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {} updateCartBadge(); renderCart(); }
function cartTotals(){
  const subtotal = cart.reduce((acc, it) => acc + (Number(it.price||0) * Number(it.qty||0)), 0);
  const total = subtotal; // envío calculado luego
  const count = cart.reduce((a, it) => a + Number(it.qty||0), 0);
  return { subtotal, total, count };
}
function updateCartBadge(){
  const {count} = cartTotals();
  const el = document.getElementById('cart-count');
  const el2 = document.getElementById('cart-count-mobile');
  if (el) el.textContent = String(count||0);
  if (el2) el2.textContent = String(count||0);
}
function ensureQty(n){ n = Number(n||0); if (!Number.isFinite(n) || n < 1) n = 1; if (n > 999) n = 999; return n; }
function addToCart(product, qty = 1){
  if (!product || product.id == null) return;
  const id = String(product.id);
  const price = Number(product.price||0) || 0;
  const imageUrl = product.imageUrl || product.imagen || null;
  const name = product.name || product.nombre || 'Producto';
  const i = cart.findIndex(it => String(it.id) === id);
  if (i >= 0) {
    cart[i].qty = ensureQty(Number(cart[i].qty||0) + Number(qty||1));
  } else {
    cart.push({ id, name, imageUrl, price, qty: ensureQty(qty) });
  }
  saveCart();
  try { showMessageBox('Agregado al carrito', 900); } catch {}
}
function removeFromCart(id){ cart = cart.filter(it => String(it.id) !== String(id)); saveCart(); }
function setQty(id, qty){ const it = cart.find(x => String(x.id) === String(id)); if (!it) return; it.qty = ensureQty(qty); saveCart(); bumpItem(id); }
function bumpItem(id){ try { const row = document.querySelector(`.cart-item[data-id="${CSS.escape(String(id))}"]`); if (!row) return; row.classList.remove('bump'); void row.offsetWidth; row.classList.add('bump'); } catch {}
}
function openCart(){ const ov = document.getElementById('cart-overlay'); if (!ov) return; ov.classList.remove('hidden'); document.body.style.overflow='hidden'; renderCart(); }
function closeCart(){ const ov = document.getElementById('cart-overlay'); if (!ov) return; ov.classList.add('hidden'); document.body.style.overflow=''; }
function renderCart(){
  const box = document.getElementById('cart-items'); if (!box) return;
  box.innerHTML = '';
  if (!cart.length) { box.innerHTML = '<p class="text-futuristic-mute">Tu carrito está vacío.</p>'; }
  cart.forEach(it => {
    const name = String(it.name||'Producto');
    const price = Number(it.price||0);
    const qty = Number(it.qty||0);
    const img = it.imageUrl || 'https://placehold.co/96x96/cccccc/333333?text=.';
    const row = document.createElement('div');
    row.className = 'cart-item rounded-2xl bg-white/5 p-3 flex gap-3 items-center';
    row.dataset.id = String(it.id);
    row.innerHTML = `
      <img src="${img}" alt="${name}" class="w-16 h-16 rounded-lg object-cover" onerror="this.onerror=null;this.src='https://placehold.co/96x96/cccccc/333333?text=.';">
      <div class="flex-1">
        <div class="flex items-start justify-between gap-2">
          <h4 class="text-sm font-medium text-futuristic-ink line-clamp-2">${name}</h4>
          <button class="p-1.5 rounded-full hover:bg-white/10" data-remove aria-label="Eliminar">❌</button>
        </div>
        <div class="mt-1 flex items-center justify-between">
          <div class="text-futuristic-mute text-sm">${currency(price)}</div>
          <div class="flex items-center gap-2">
            <button class="qty-btn" data-dec>-</button>
            <span class="min-w-[2ch] text-center" data-qty>${qty}</span>
            <button class="qty-btn" data-inc>+</button>
          </div>
        </div>
      </div>`;
    box.appendChild(row);
  });
  const { subtotal, total } = cartTotals();
  const subEl = document.getElementById('cart-subtotal'); if (subEl) subEl.textContent = currency(subtotal);
  const totEl = document.getElementById('cart-total'); if (totEl) totEl.textContent = currency(total);
}
let __lastFocusEl = null;
function openPD(){
  if($pd.overlay){
    try { __lastFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null; } catch { __lastFocusEl = null; }
    $pd.overlay.classList.remove('hidden');
    $pd.overlay.classList.add('show');
    $pd.overlay.removeAttribute('inert');
    $pd.overlay.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
    // Mover el foco a un control del modal (mejora accesibilidad)
    try { if ($pd.closeBtn && typeof $pd.closeBtn.focus === 'function') $pd.closeBtn.focus(); } catch {}
  }
}
function closePD(){
  if($pd.overlay){
    // Si el foco está dentro del overlay, sácalo antes de ocultar
    try {
      const active = document.activeElement;
      if (active && $pd.overlay.contains(active) && typeof active.blur === 'function') {
        active.blur();
      }
    } catch {}
    $pd.overlay.classList.add('hidden');
    $pd.overlay.classList.remove('show');
    $pd.overlay.setAttribute('inert','');
    $pd.overlay.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
    clearHashParam();
    // Restaurar foco a un elemento seguro
    try {
      if (__lastFocusEl && document.contains(__lastFocusEl)) {
        __lastFocusEl.focus();
      } else {
        const fallback = document.getElementById('search-input-mobile')
          || document.getElementById('simple-search-input')
          || document.getElementById('mobile-search-toggle');
        if (fallback && typeof fallback.focus === 'function') fallback.focus();
      }
    } catch {}
  }
}
function setHashParam(id){ const u = new URL(window.location.href); u.searchParams.set('p', id); history.replaceState(null,'',u); }
function clearHashParam(){ const u = new URL(window.location.href); u.searchParams.delete('p'); history.replaceState(null,'',u); }

function renderThumbs(imgs=[]) {
  if(!$pd.thumbs) return;
  $pd.thumbs.innerHTML = '';
  imgs.forEach((src,i) => {
    const b = document.createElement('button');
    b.className = 'w-16 h-16 rounded-lg overflow-hidden border border-white/20 bg-white/5 hover:border-brand-1';
    b.innerHTML = `<img src="${src}" alt="" class="w-full h-full object-cover">`;
    b.addEventListener('click', ()=> { if($pd.image) $pd.image.src = src; });
    $pd.thumbs.appendChild(b);
    if(i===0 && $pd.image) $pd.image.src = src;
  });
  if(!imgs.length && $pd.image) $pd.image.src = '';
}

function renderBadges(prod){
  if(!$pd.badges) return;
  const items = [];
  if (prod.envio24) items.push('<span class="px-2 py-1 rounded-full text-xs bg-emerald-700/30 text-emerald-300">Envío 24/48h</span>');
  if (prod.garantiaMeses) items.push(`<span class="px-2 py-1 rounded-full text-xs bg-indigo-700/30 text-indigo-300">${prod.garantiaMeses}m Garantía</span>`);
  if (prod.stock > 0) items.push('<span class="px-2 py-1 rounded-full text-xs bg-blue-700/30 text-blue-300">Stock disponible</span>');
  $pd.badges.innerHTML = items.join(' ');
}

function activateTab(tab){
  document.querySelectorAll('.pd-tab').forEach(b => {
    if (b.dataset.tab === tab) {
      b.dataset.active = 'true';
      b.classList.add('text-brand-1', 'border-b-2', 'border-brand-1');
      b.classList.remove('text-futuristic-mute');
    } else {
      b.dataset.active = 'false';
      b.classList.remove('text-brand-1', 'border-b-2', 'border-brand-1');
      b.classList.add('text-futuristic-mute');
    }
  });
  document.querySelectorAll('.pd-pane').forEach(p => p.classList.add('hidden'));
  const pane = document.getElementById(`pd-pane-${tab}`);
  if(pane) pane.classList.remove('hidden');
}

function normalizeWarranty(prod){
  const candidates = [
    prod.warranty, prod.warrantyMonths, prod.warrantyText,
    prod.garantia, prod.garantiaMeses, prod.garantiaTexto,
  ];
  for (let raw of candidates){
    if (raw === undefined || raw === null) continue;
    if (typeof raw === 'number' && !isNaN(raw) && raw > 0) return `${raw} meses de garantía.`;
    if (typeof raw === 'string') {
      const txt = raw.trim(); if (!txt) continue; if (/^\d+$/.test(txt)) return `${parseInt(txt,10)} meses de garantía.`; return txt;
    }
  }
  return null;
}

function renderProductDetail(prod){
  if(!$pd.title) return;
  try { window.__currentProduct = { id: prod.id, name: prod.name || prod.nombre, price: prod.price ?? prod.precio ?? 0, imageUrl: prod.imageUrl || prod.imagen || null }; } catch {}
  $pd.title.textContent = prod.nombre || prod.title || prod.name || 'Producto';
  $pd.price.textContent = (prod.price ?? prod.precio) != null ? currency(prod.price ?? prod.precio) : 'Consultar';
  if ($pd.id) $pd.id.textContent = prod.id || '-';
  if ($pd.stock) $pd.stock.textContent = (prod.stock ?? '-');
  if ($pd.paneDesc) $pd.paneDesc.innerHTML = prod.descripcionLarga || prod.descripcion || prod.description || 'Sin descripción.';

  // specs/specifications/especificaciones (object | array | string)
  (function renderSpecs(){
    if (!$pd.paneSpecs) return;
    let source = prod.specs ?? prod.specifications ?? prod.especificaciones;
    let html = '-';
    if (source && typeof source === 'object') {
      if (Array.isArray(source)) {
        const items = source
          .filter(it => it && typeof it === 'object')
          .map(it => {
            const k = it.key ?? it.clave ?? it.nombre ?? it.name;
            const v = it.value ?? it.valor ?? it.val;
            return (k != null && v != null) ? `<li><strong>${String(k)}:</strong> ${String(v)}</li>` : null;
          })
          .filter(Boolean);
        if (items.length) html = `<ul class="list-disc pl-5">${items.join('')}</ul>`;
      } else {
        const entries = Object.entries(source).filter(([k,v]) => k && v !== undefined && v !== null);
        if (entries.length) html = `<ul class="list-disc pl-5">${entries.map(([k,v])=>`<li><strong>${k}:</strong> ${v}</li>`).join('')}</ul>`;
      }
    } else if (typeof source === 'string') {
      const s = source.trim();
      if (s) {
        // Convertir posibles bullets o saltos de línea en lista visual
        const items = s.split(/\r?\n|[•·]+/).map(x => x.trim()).filter(Boolean);
        if (items.length > 1) {
          html = `<ul class="list-disc pl-5 space-y-1 text-futuristic-mute">${items.map(i=>`<li>${i}</li>`).join('')}</ul>`;
        } else {
          html = s;
        }
      } else {
        html = '-';
      }
    }
    $pd.paneSpecs.innerHTML = html;
  })();

  if ($pd.paneWarranty) $pd.paneWarranty.innerHTML = normalizeWarranty(prod) || 'Consultar garantía.';

  let imgs = [];
  if (Array.isArray(prod.imagenes) && prod.imagenes.length) imgs = prod.imagenes;
  else if (Array.isArray(prod.images) && prod.images.length) imgs = prod.images;
  else if (Array.isArray(prod.gallery) && prod.gallery.length) imgs = prod.gallery;
  else if (typeof prod.imagen === 'string' && prod.imagen) imgs = [prod.imagen];
  else if (typeof prod.imageUrl === 'string' && prod.imageUrl) imgs = [prod.imageUrl];
  else if (typeof prod.img === 'string' && prod.img) imgs = [prod.img];
  imgs = imgs.map(s=>String(s)).filter(Boolean);
  renderThumbs(imgs);
  renderBadges(prod);

  const msg = encodeURIComponent(`Hola! Me interesa el producto "${$pd.title.textContent}" (ID ${prod.id}). ¿Disponibilidad y precio?`);
  if($pd.whatsapp) $pd.whatsapp.href = `https://wa.me/5491159914197?text=${msg}`;
  activateTab('desc');

  try {
    const catName = prod.categoryName || prod.category || prod.categoria || '';
    const excludeId = prod.id;
    loadSimilarProducts(catName, excludeId);
  } catch {}
}

async function fetchProductById(id) {
  // Try cache first
  const local = (window.productsFullCache || []).find(p => String(p.id) === String(id));
  if (local) return local;
  try {
    const row = await apiGet(`/productos/${encodeURIComponent(id)}`);
    return mapProduct(row);
  } catch (e) {
    console.error('fetchProductById(API) error:', e);
    return null;
  }
}

async function loadSimilarProducts(categoryName, excludeId) {
  const wrap = document.getElementById('similar-products-container');
  if (!wrap) return;
  if (!categoryName) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = '<p class="col-span-full text-center text-futuristic-mute">Cargando productos similares...</p>';
  try {
    const norm = String(categoryName).toLowerCase();

    // 1) Intentar desde el cache actual
    let list = (window.productsFullCache || []).filter(p => {
      if (excludeId && String(p.id) === String(excludeId)) return false;
      return (p.categoryName || '').toLowerCase() === norm;
    });

    // 2) Si no hay suficientes, obtener del backend y filtrar
    if (!list.length) {
      const rows = await apiGet('/productos');
      const all = Array.isArray(rows) ? rows.map(mapProduct) : [];
      list = all.filter(p => {
        if (excludeId && String(p.id) === String(excludeId)) return false;
        return (p.categoryName || '').toLowerCase() === norm;
      });
    }

    // Limitar a 6
    list = list.slice(0, 6);

    wrap.innerHTML = '';
    if (!list.length) {
      wrap.innerHTML = '<p class="col-span-full text-center text-futuristic-mute">No hay productos similares.</p>';
      return;
    }
    list.forEach(p => {
      const name = p.name || 'Producto';
      const imageUrl = p.imageUrl || 'https://placehold.co/400x300/cccccc/333333?text=Sin+Imagen';
      const price = p.price;
      const priceHtml = (price !== undefined && price !== null)
        ? `<div class="mt-2"><span class="price-chip"><i class="fa-solid fa-tag text-white/80 text-xs"></i>${currency(price)}</span></div>`
        : '';
      const card = document.createElement('div');
      card.className = 'product-card group rounded-2xl flex flex-col cursor-pointer';
      card.dataset.id = p.id;
      card.innerHTML = `
        <div class="relative aspect-[4/3] overflow-hidden rounded-t-2xl">
          <img src="${imageUrl}" alt="${name}" class="w-full h-full object-cover" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/400x300/cccccc/333333?text=Sin+Imagen';">
        </div>
        <div class="p-3">
          <h4 class="text-sm font-medium text-futuristic-ink line-clamp-2">${name}</h4>
          ${priceHtml}
        </div>`;
      wrap.appendChild(card);
    });
  } catch (e) {
    console.error('loadSimilarProducts(API) error:', e);
    wrap.innerHTML = '<p class="col-span-full text-center text-futuristic-mute">No se pudieron cargar productos similares.</p>';
  }
}

// --- Delegations / events ---
document.addEventListener('click', async (e) => {
  const card = e.target.closest('.product-card');
  if(!card) return;
  if (e.target.closest('a')) return; // ignore clicks on inner links
  const id = card.dataset.id || (card.id && card.id.startsWith('product-') ? card.id.replace(/^product-/, '') : null);
  if(!id) return;
  const prod = await fetchProductById(id);
  if(!prod) { showMessageBox('No se encontró el producto.'); return; }
  renderProductDetail(prod);
  openPD();
  setHashParam(id);
});

document.addEventListener('click', (e) => {
  if(e.target.matches('[data-close]') || e.target.id === 'pd-overlay') closePD();
});
if($pd.closeBtn) $pd.closeBtn.addEventListener('click', closePD);
document.addEventListener('keydown', (e) => { if(e.key === 'Escape') closePD(); });

// --- Line 612 onwards ---
document.addEventListener('click', e => {
  const btn = e.target.closest('.pd-tab');
  if(!btn) return;
  activateTab(btn.dataset.tab);
});

// --- Cart bindings ---
document.getElementById('pd-add')?.addEventListener('click', () => {
  if (window.__currentProduct && window.__currentProduct.id != null) {
    addToCart(window.__currentProduct, 1);
  } else {
    showMessageBox('No se pudo agregar este producto.');
  }
});
document.getElementById('cart-button')?.addEventListener('click', openCart);
document.getElementById('cart-button-mobile')?.addEventListener('click', openCart);
document.getElementById('cart-continue')?.addEventListener('click', closeCart);
document.getElementById('cart-close')?.addEventListener('click', closeCart);
document.getElementById('cart-overlay')?.addEventListener('click', (e) => { if (e.target && e.target.hasAttribute('data-cart-close')) closeCart(); });
document.getElementById('cart-items')?.addEventListener('click', (e) => {
  const row = e.target.closest('.cart-item'); if (!row) return;
  const id = row.dataset.id;
  if (e.target.closest('[data-inc]')) { setQty(id, (cart.find(x=>String(x.id)===String(id))?.qty||0)+1); }
  else if (e.target.closest('[data-dec]')) { setQty(id, (cart.find(x=>String(x.id)===String(id))?.qty||0)-1); }
  else if (e.target.closest('[data-remove]')) { removeFromCart(id); }
});
document.getElementById('cart-checkout')?.addEventListener('click', () => {
  if (!cart.length) { showMessageBox('Tu carrito está vacío'); return; }
  const lines = cart.map(it => `• ${it.name} x${it.qty} – ${currency(it.price*it.qty)}`);
  const { total } = cartTotals();
  const msg = encodeURIComponent(`Hola! Quiero finalizar compra:\n${lines.join('\n')}\nTotal: ${currency(total)}`);
  const url = `https://wa.me/5491159914197?text=${msg}`;
  try { window.open(url, '_blank'); } catch { window.location.href = url; }
});
updateCartBadge();

// Open from URL ?p=ID
(function openFromURL(){
  try {
    const u = new URL(window.location.href);
    const id = u.searchParams.get('p');
    if(!id) return;
    fetchProductById(id).then(prod => { if(!prod) return; renderProductDetail(prod); openPD(); });
  } catch {}
})();

// Auto apply ?cat= on catalog pages after init
window.addEventListener('popstate', () => {
  try {
    const u = new URL(window.location.href);
    const cat = u.searchParams.get('cat');
    const titleEl = document.getElementById('category-title');
    const categoriesSectionEl = document.getElementById('productos');
    const categoriesContainerEl = document.getElementById('categories-container');
    if (cat) {
      if (titleEl) titleEl.textContent = `Mostrando productos de: ${cat}`;
      if (categoriesSectionEl) categoriesSectionEl.style.display = 'none';
      if (categoriesContainerEl) categoriesContainerEl.style.display = 'none';
      categoriesInitialLoadComplete = true;
      loadProductsByCategory(cat);
    } else {
      if (titleEl) titleEl.textContent = 'Todos Nuestros Productos';
      if (categoriesSectionEl) categoriesSectionEl.style.display = '';
      if (categoriesContainerEl) categoriesContainerEl.style.display = '';
      loadCategories();
      loadAllProducts();
    }
  } catch {}
});

// Sorting and simple price filter
document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('product-sort');
  if (sel && !sel.dataset.sortInit) {
    sel.dataset.sortInit = '1';
    sel.addEventListener('change', e => { currentSort = e.target.value; applySortAndRender(); });
  }
  const minI = document.getElementById('min-price');
  const maxI = document.getElementById('max-price');
  [minI, maxI].forEach(inp => {
    if (inp && !inp.dataset.bindEnter) {
      inp.dataset.bindEnter = '1';
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { if (typeof window.applyPriceFilter ===
        'function') window.applyPriceFilter(); } });
    }
  });
  // init search bindings (desktop + mobile)
  try { setupSearch(); } catch {}
  // clear filters button
  const clearBtn = document.getElementById('clear-filters-btn');
  if (clearBtn && !clearBtn.dataset.bindClear) {
    clearBtn.dataset.bindClear = '1';
    clearBtn.addEventListener('click', () => {
      const minEl = document.getElementById('min-price');
      const maxEl = document.getElementById('max-price');
      if (minEl) minEl.value = '';
      if (maxEl) maxEl.value = '';
      delete window.__priceMin;
      delete window.__priceMax;
      delete window.__searchQuery;
      delete window.__searchCategory;
      delete window.__searchId;
      try {
        const searchInputs = getSearchInputs();
        searchInputs.forEach(inp => { inp.value = ''; });
      } catch {}
      try { updateActiveFiltersUI(); } catch {}
      applySortAndRender();
    });
  }
  // Observe DOM for dynamically added search inputs (e.g., mobile menu)
  try {
    let scheduled = false;
    const obs = new MutationObserver(() => {
      if (scheduled) return; scheduled = true;
      setTimeout(()=>{ scheduled = false; try { setupSearch(); } catch {} }, 150);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  } catch {}
});

function applyPriceFilter() {
  const minEl = document.getElementById('min-price');
  const maxEl = document.getElementById('max-price');
  const min = minEl ? parseFloat(minEl.value) : NaN;
  const max = maxEl ? parseFloat(maxEl.value) : NaN;
  const hasMin = !isNaN(min);
  const hasMax = !isNaN(max);
  if (!hasMin && !hasMax) {
    delete window.__priceMin; delete window.__priceMax;
  } else {
    window.__priceMin = hasMin ? min : 0;
    window.__priceMax = hasMax ? max : Infinity;
  }
  try { updateActiveFiltersUI(); } catch {}
  applySortAndRender();
}
window.applyPriceFilter = applyPriceFilter;

// --- Search ---
function getSearchInputs(){
  const sel = [
    '#search-input', '#search', '#buscador', '#q', '[name="search"]', '[name="q"]', '[data-search-input]', '.search-input',
    'input[type="search"]', 'input[placeholder*="Buscar" i]', 'input[aria-label*="Buscar" i]'
  ];
  const list = new Set();
  sel.forEach(s => document.querySelectorAll(s).forEach(el => { if (el instanceof HTMLInputElement) list.add(el); }));
  // Excluir el input móvil específico; tiene su propio typeahead dedicado
  return Array.from(list).filter(el => el.id !== 'search-input-mobile');
}
function isVisible(el){ return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); }
function getBestSearchInput(){
  const inputs = getSearchInputs();
  if (!inputs.length) return null;
  const vis = inputs.find(isVisible);
  return vis || inputs[0];
}
function parseNumber(v){
  if (v==null) return NaN; return parseFloat(String(v).replace(/\./g,'').replace(',', '.'));
}

function updateActiveFiltersUI() {
  const wrap = document.getElementById('active-filters');
  if (!wrap) return;
  const chips = [];
  const hasSearch = !!(window.__searchQuery && window.__searchQuery.trim());
  const hasCat = !!(window.__searchCategory && window.__searchCategory.trim());
  const hasId = !!(window.__searchId && window.__searchId.trim());
  const hasMin = typeof window.__priceMin === 'number';
  const hasMax = typeof window.__priceMax === 'number' && isFinite(window.__priceMax) && window.__priceMax !== Infinity;

  if (hasSearch) chips.push({ key: 'search', label: `Texto: "${window.__searchQuery}"` });
  if (hasCat) chips.push({ key: 'cat', label: `Categoría: ${window.__searchCategory}` });
  if (hasId) chips.push({ key: 'id', label: `ID: ${window.__searchId}` });
  if (hasMin || hasMax) {
    const parts = [];
    if (hasMin) parts.push(`mín ${window.__priceMin}`);
    if (hasMax) parts.push(`máx ${window.__priceMax}`);
    chips.push({ key: 'price', label: `Precio ${parts.join(' / ')}` });
  }

  if (!chips.length) {
    wrap.innerHTML = '<span class="text-[11px] text-futuristic-mute/80">Sin filtros activos</span>';
    return;
  }
  wrap.innerHTML = chips.map(c => `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-600/90 text-white shadow-sm text-[11px]">
      <span class="w-1.5 h-1.5 rounded-full bg-emerald-300"></span>
      <span>${c.label}</span>
    </span>
  `).join('');
}
async function applySearch(query, opts={}){
  try {
    if (!Array.isArray(window.productsFullCache) || window.productsFullCache.length === 0) {
      await loadAllProducts();
    }
  } catch {}
  const raw = String(query||'').trim();
  let q = raw;
  // reset structured filters
  delete window.__searchCategory; delete window.__searchId;
  // precio:a-b
  q = q.replace(/(?:^|\s)precio\s*:\s*(\d+[\.,]?\d*)\s*-\s*(\d+[\.,]?\d*)/ig, (_,a,b)=>{
    const min=parseNumber(a), max=parseNumber(b);
    if(!isNaN(min)) window.__priceMin = min; if(!isNaN(max)) window.__priceMax = max; return ' ';
  });
  // min:x  max:y
  q = q.replace(/(?:^|\s)min\s*:\s*(\d+[\.,]?\d*)/ig, (_,a)=>{ const v=parseNumber(a); if(!isNaN(v)) window.__priceMin=v; return ' '; });
  q = q.replace(/(?:^|\s)max\s*:\s*(\d+[\.,]?\d*)/ig, (_,a)=>{ const v=parseNumber(a); if(!isNaN(v)) window.__priceMax=v; return ' '; });
  // cat:  categoria:
  q = q.replace(/(?:^|\s)(?:cat|categoria)\s*:\s*([^\s]+)/ig, (_,c)=>{ window.__searchCategory = String(c||'').toLowerCase(); return ' '; });
  // id:
  q = q.replace(/(?:^|\s)id\s*:\s*([^\s]+)/ig, (_,id)=>{ window.__searchId = String(id||''); return ' '; });
  // final free text
  window.__searchQuery = q.replace(/\s+/g,' ').trim();
  try { updateActiveFiltersUI(); } catch {}
  applySortAndRender();
  if (opts.sourceId && String(opts.sourceId).toLowerCase().includes('mobile')) { try { closeMobileMenu(); } catch {} }

  // Opcional: si se presionó Enter, intentar abrir producto por ID o nombre exacto
  try {
    if (opts && opts.enter === true) {
      const norm = (s) => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g,' ').trim();
      const base = Array.isArray(window.productsFullCache) ? window.productsFullCache : [];
      let target = null;
      // Coincidencia exacta por ID
      target = base.find(p => String(p.id) === raw);
      const qn = norm(raw);
      if (!target && qn) {
        // Coincidencia exacta por nombre (acento-insensible)
        target = base.find(p => norm(p.name || p.nombre) === qn);
      }
      if (!target && qn) {
        // Coincidencia parcial por nombre (acento-insensible)
        target = base.find(p => norm(p.name || p.nombre).includes(qn));
      }
      if (target) {
        try {
          const el = document.getElementById(`product-${target.id}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch {}
        fetchProductById(target.id).then(prod => { if (prod) { renderProductDetail(prod); openPD(); } });
      }
    }
  } catch {}
}
function debounce(fn, wait){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn.apply(null,args), wait); }; }
function setupSearch(){
  const inp = getBestSearchInput();
  const btn = document.getElementById('search-button')
         || document.getElementById('search-btn')
         || document.getElementById('search-icon')
         || document.getElementById('search-submit')
         || document.querySelector('[data-search-btn],[data-search-trigger],.search-button,.search-btn');
  const form = document.getElementById('search-form') || (inp && inp.closest('form'));
  if (inp && !inp.dataset.searchInit){
    inp.dataset.searchInit='1';
    inp.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); applySearch(inp.value, { sourceId: inp.id, enter: true }); }});
    inp.addEventListener('input', debounce(()=>{ applySearch(inp.value, { sourceId: inp.id }); }, 250));
  }
  if (btn && !btn.dataset.searchInit){
    btn.dataset.searchInit='1';
    btn.addEventListener('click', (e)=>{ e.preventDefault(); const si=getBestSearchInput(); applySearch(si?si.value:'', { sourceId: si && si.id }); });
  }
  // bind all inputs + their forms
  const inputs = getSearchInputs();
  inputs.forEach(input => {
    if (!input.dataset.searchInit) {
      input.dataset.searchInit = '1';
      input.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); applySearch(input.value, { sourceId: input.id, enter: true }); }});
      input.addEventListener('input', debounce(()=>{ applySearch(input.value, { sourceId: input.id }); }, 250));
    }
    const f = input.closest('form');
    if (f && !f.dataset.searchInit) {
      f.dataset.searchInit='1';
      f.addEventListener('submit', (e)=>{ e.preventDefault(); applySearch(input.value, { sourceId: input.id }); });
    }
  });
}
window.applySearch = applySearch;

// Global click delegation for various “lupa” triggers
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-search-btn],[data-search-trigger],[data-action="search"],#search-button,#search-btn,#search-icon,#search-submit,.search-button,.search-btn,[aria-label="Buscar"],[title="Buscar"],[aria-label="buscar"],[title="buscar"]');
  if (!trigger) return;
  const si = getBestSearchInput();
  applySearch(si?si.value:'', { sourceId: si && si.id });
});

// Also catch typical fontawesome icons inside buttons
document.addEventListener('click', (e) => {
  const icon = e.target.closest('i.fa-search, i.fa-magnifying-glass, .fa-magnifying-glass, svg[data-icon="search"], [data-icon="search"]');
  if (!icon) return;
  const si = getBestSearchInput();
  if (!si) return;
  e.preventDefault();
  applySearch(si.value, { sourceId: si.id });
});

// --- Navigation helpers ---
function goToCategory(categoryName) {
  const currentPath = window.location.pathname || '';
  const onCatalogPage = currentPath.toLowerCase().includes('/catalogo.html') || currentPath.toLowerCase().endsWith('/catalogo') || currentPath.toLowerCase().includes('/catalogo');
  if (!onCatalogPage) {
    window.location.href = `/catalogo.html?cat=${encodeURIComponent(categoryName)}`;
    return;
  }
  showMessageBox(`Cargando productos de la categoría: ${categoryName}...`, 900);
  loadProductsByCategory(categoryName);
  try { history.pushState({ cat: categoryName }, "", `/catalogo.html?cat=${encodeURIComponent(categoryName)}`);
    } catch {}
  closeMobileMenu();
  const catalogEl = document.getElementById('catalogo-productos');
  if (catalogEl) catalogEl.scrollIntoView({ behavior: 'smooth' });
}
window.goToCategory = goToCategory;
window.showMessageBox = showMessageBox;
window.startCategoryImageAnimation = startCategoryImageAnimation;
window.stopCategoryImageAnimation = stopCategoryImageAnimation;
window.loadAllProducts = loadAllProducts;
window.loadProductsByCategory = loadProductsByCategory;

// --- Mobile menu + submenu wiring ---
document.addEventListener('DOMContentLoaded', function() {
  const mobileMenuButton = document.getElementById('mobile-menu-button');
  const categoriesToggleButton = document.getElementById('categories-toggle-button');
  const categoriesIcon = document.getElementById('categories-toggle-icon');
  const categoriesMenu = document.getElementById('categories-submenu');
  if (mobileMenuButton && !mobileMenuButton.dataset.bound) {
    mobileMenuButton.dataset.bound = '1';
    let isOpen = false;
    const mobileNavClose = document.getElementById('mobile-nav-close');
    if (mobileNavClose) mobileNavClose.addEventListener('click', (e) => { e.stopPropagation(); closeMobileMenu(); isOpen = false; });
    mobileMenuButton.addEventListener('click', (e) => { e.stopPropagation(); isOpen ? closeMobileMenu() : openMobileMenu(); isOpen = !isOpen; });
    document.body.addEventListener('click', (e) => {
      if (!isOpen) return;
      const { btn, nav } = getMobileMenuEls();
      if (!nav || !btn) return;
      if (!nav.contains(e.target) && e.target !== btn && !btn.contains(e.target)) { closeMobileMenu(); isOpen =
        false; }
    });
  }
  if (categoriesToggleButton && categoriesMenu && categoriesIcon && !categoriesToggleButton.dataset.toggleInit)
    {
    categoriesToggleButton.dataset.toggleInit = '1';
    categoriesToggleButton.addEventListener('click', (e) => {
      e.preventDefault();
      toggleCategoriesSubmenu();
    });
  }
  const closeImageModalButton = document.getElementById('close-image-modal');
  const imageFullscreenModal = document.getElementById('image-fullscreen-modal');
  if (closeImageModalButton && imageFullscreenModal) {
    closeImageModalButton.addEventListener('click', window.closeFullscreenImage);
    imageFullscreenModal.addEventListener('click', (e) => { if (e.target === imageFullscreenModal) window.closeFullscreenImage(); });
  }
});

// --- App init ---
function initAppFromAPI() {
  if (window.__api_init_done) return;
  window.__api_init_done = true;
  showLoading('futuristic-loader');
  try {
    const u = new URL(window.location.href);
    const cat = u.searchParams.get('cat') || u.searchParams.get('category');
    if (cat) {
      const titleEl = document.getElementById('category-title');
      if (titleEl) titleEl.textContent = `Mostrando productos de: ${cat}`;
      const categoriesSectionEl = document.getElementById('productos');
      const categoriesContainerEl = document.getElementById('categories-container');
      if (categoriesSectionEl) categoriesSectionEl.style.display = 'none';
      if (categoriesContainerEl) categoriesContainerEl.style.display = 'none';
      categoriesInitialLoadComplete = true; // skip categories grid
      loadProductsByCategory(cat);
    } else {
      loadCategories();
      loadAllProducts();
    }
  } catch {
    loadCategories();
    loadAllProducts();
  }
}
document.addEventListener('DOMContentLoaded', initAppFromAPI);
// --- Mobile search wiring + text filter (catálogo) ---
function applyTextSearch(query) {
  const term = normalizeNoAccents(String(query || '')).replace(/\s+/g,' ').trim();
  if (!term) {
    window.__filteredList = null;
    if (typeof applySortAndRender === 'function') applySortAndRender();
    return;
  }
  const base = Array.isArray(window.productsFullCache) ? window.productsFullCache : [];
  window.__filteredList = base.filter(p => {
    const hay = [p.name || p.nombre || '', p.description || p.descripcion || '', p.categoryName || p.categoria || '']
      .map(x => normalizeNoAccents(x))
      .join(' ');
    return hay.includes(term);
  });
  if (typeof applySortAndRender === 'function') applySortAndRender();
}

document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('mobile-search-toggle');
  const mobileSearchWrap = document.getElementById('mobile-search');
  const input = document.getElementById('search-input-mobile');
  const results = document.getElementById('search-results-mobile');

  // Modo simple: con sugerencias básicas y abrir primer match
  if (window.__simpleSearchMode) {
    // Estado sugerencias
    let selIndex = -1; let items = [];
    function hideResults(){ if(results){ results.classList.add('hidden'); results.innerHTML=''; } selIndex=-1; items=[]; }
    function updateHighlight(){ if(!results) return; Array.from(results.children).forEach((li,idx)=>{ if(!(li instanceof HTMLElement)) return; if(idx===selIndex) li.classList.add('bg-white/10'); else li.classList.remove('bg-white/10'); li.setAttribute('aria-selected', idx===selIndex?'true':'false');}); }
    function buildSimpleSuggestions(term){
      const q = normalizeNoAccents(String(term||'')).trim();
      if (!q) return [];
      const base = Array.isArray(window.productsFullCache) ? window.productsFullCache : [];
      const arr = base.map(p=>({p, n: normalizeNoAccents(p.name || p.nombre)}));
      const pref = arr.filter(x=>x.n.startsWith(q)).map(x=>x.p);
      if (pref.length) return pref.slice(0,8);
      const contains = arr.filter(x=>x.n.includes(q)).map(x=>x.p);
      return contains.slice(0,8);
    }
    function renderResults(list){ if(!results) return; results.innerHTML=''; if(!list||!list.length){ hideResults(); return; } items=list; selIndex=0; const frag=document.createDocumentFragment(); list.forEach((p,i)=>{ const li=document.createElement('li'); li.setAttribute('role','option'); li.dataset.id=String(p.id); li.dataset.index=String(i); li.className='px-3 py-2 cursor-pointer hover:bg-white/10'; if(i===selIndex) li.classList.add('bg-white/10'); li.innerHTML=`<div class="flex flex-col"><span class="text-sm">${p.name||''}</span>${(p.categoryName||p.categoria)?`<span class=\"text-xs text-futuristic-mute\">${p.categoryName||p.categoria}</span>`:''}</div>`; li.addEventListener('mousedown',(e)=>{ e.preventDefault(); e.stopPropagation(); openProductById(p.id); hideResults(); }); frag.appendChild(li); }); results.appendChild(frag); results.classList.remove('hidden'); }
    async function ensureData(){ try { if(!Array.isArray(window.productsFullCache) || !window.productsFullCache.length){ await loadAllProducts(); } } catch {} }
    const doSimple = async () => { await ensureData(); const m = findFirstMatch(input ? input.value : ''); if (m) { await openProductById(m.id); hideResults(); } else { showMessageBox('Sin resultados para tu búsqueda', 1200); } };
    if (toggleBtn && mobileSearchWrap && !toggleBtn.dataset.simpleInit) {
      toggleBtn.dataset.simpleInit = '1';
      toggleBtn.addEventListener('click', async (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        // Si ya está abierto y hay texto, ejecutar búsqueda simple
        if (!mobileSearchWrap.classList.contains('hidden')) {
          if (input && input.value && input.value.trim()) { await doSimple(); return; }
        }
        mobileSearchWrap.classList.toggle('hidden');
        if (!mobileSearchWrap.classList.contains('hidden')) { try { input?.focus(); } catch {} }
      });
    }
    const btnM = document.getElementById('simple-search-btn-mobile');
    if (btnM && !btnM.dataset.simpleInit) {
      btnM.dataset.simpleInit = '1';
      btnM.addEventListener('click', async (e)=>{ e.preventDefault(); e.stopPropagation(); await doSimple(); });
    }
    if (input && !input.dataset.simpleInit) {
      input.dataset.simpleInit = '1';
      input.addEventListener('input', async ()=>{ await ensureData(); renderResults(buildSimpleSuggestions(input.value)); });
      input.addEventListener('keydown', async (e)=>{
        if(e.key==='Enter'){ e.preventDefault(); e.stopPropagation(); if(items && items.length){ const target = items[Math.max(0,selIndex)]; if(target){ await openProductById(target.id); hideResults(); } } else { await doSimple(); } return; }
        if(e.key==='ArrowDown'){ e.preventDefault(); if(items.length){ selIndex=(selIndex+1)%items.length; updateHighlight(); } return; }
        if(e.key==='ArrowUp'){ e.preventDefault(); if(items.length){ selIndex=(selIndex-1+items.length)%items.length; updateHighlight(); } return; }
        if(e.key==='Escape'){ e.preventDefault(); hideResults(); mobileSearchWrap?.classList.add('hidden'); return; }
      });
    }
    // Hotkeys
    if (!window.__mobileSearchHotkeysBoundSimple) {
      window.__mobileSearchHotkeysBoundSimple = true;
      window.addEventListener('keydown', (e) => {
        const k = String(e.key || '').toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === 'k') {
          e.preventDefault();
          if (mobileSearchWrap) { mobileSearchWrap.classList.remove('hidden'); try { input?.focus(); } catch {} }
        }
        if (k === 'escape') { hideResults(); mobileSearchWrap?.classList.add('hidden'); }
      });
    }
    return; // no continuar con typeahead complejo
  }

  // Helper: abrir producto por id sin tocar otras lógicas
  async function openProductById(id) {
    try {
      const prod = await fetchProductById(id);
      if (!prod) return;
      renderProductDetail(prod);
      openPD();
    } catch {}
  }

  // Sugerencias: por nombre del producto. Prefijo primero; si no hay, contiene.
  function buildSuggestions(term) {
    const norm = (s) => String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const q = norm(term);
    if (!q) return [];
    const base = Array.isArray(window.productsFullCache) ? window.productsFullCache : [];
    const names = base.map(p => ({ p, n: norm(p.name || p.nombre) }));
    const pref = names.filter(x => x.n.startsWith(q)).map(x => x.p);
    if (pref.length) return pref.slice(0, 8);
    const contains = names.filter(x => x.n.includes(q)).map(x => x.p);
    return contains.slice(0, 8);
  }

  let selIndex = -1;
  let items = [];
  function renderResults(list) {
    if (!results) return;
    results.innerHTML = '';
    if (!list || !list.length) { results.classList.add('hidden'); selIndex = -1; items = []; return; }
    items = list;
    selIndex = 0;
    const frag = document.createDocumentFragment();
    list.forEach((p, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.dataset.id = String(p.id);
      li.dataset.index = String(i);
      li.className = 'px-3 py-2 cursor-pointer hover:bg-white/10';
      if (i === selIndex) li.classList.add('bg-white/10');
      const cat = p.categoryName || p.categoria || '';
      li.innerHTML = `<div class="flex flex-col"><span class="text-sm">${p.name || ''}</span>${cat?`<span class="text-xs text-futuristic-mute">${cat}</span>`:''}</div>`;
      li.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); openProductById(p.id); hideResults(); });
      frag.appendChild(li);
    });
    results.appendChild(frag);
    results.classList.remove('hidden');
  }
  function updateHighlight() {
    if (!results) return;
    Array.from(results.children).forEach((li, idx) => {
      if (!(li instanceof HTMLElement)) return;
      if (idx === selIndex) li.classList.add('bg-white/10'); else li.classList.remove('bg-white/10');
      li.setAttribute('aria-selected', idx === selIndex ? 'true' : 'false');
    });
  }
  function hideResults(){ if(results){ results.classList.add('hidden'); results.innerHTML=''; } selIndex=-1; items=[]; }

  // Abrir/cerrar panel de búsqueda móvil
  if (toggleBtn && mobileSearchWrap && !toggleBtn.dataset.bound) {
    toggleBtn.dataset.bound = '1';
    toggleBtn.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      mobileSearchWrap.classList.toggle('hidden');
      if (!mobileSearchWrap.classList.contains('hidden')) {
        try { input?.focus(); } catch {}
      } else { hideResults(); }
    });
  }

  // Typeahead en input móvil (sin duplicar listeners)
  if (input && !input.dataset.typeaheadInit) {
    input.dataset.typeaheadInit = '1';
    input.addEventListener('input', (e) => {
      const list = buildSuggestions(input.value);
      renderResults(list);
    });
    input.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        if (items && items.length) { const target = items[Math.max(0, selIndex)]; if (target) { openProductById(target.id); hideResults(); } }
        else { applyTextSearch(input.value); hideResults(); }
        return;
      }
      if (k === 'ArrowDown') { e.preventDefault(); if (items.length){ selIndex = (selIndex+1) % items.length; updateHighlight(); } return; }
      if (k === 'ArrowUp') { e.preventDefault(); if (items.length){ selIndex = (selIndex-1+items.length) % items.length; updateHighlight(); } return; }
      if (k === 'Escape') { e.preventDefault(); hideResults(); mobileSearchWrap?.classList.add('hidden'); return; }
    });
  }

  // Atajo Ctrl/Cmd+K para abrir búsqueda y ESC para cerrar (una sola vez)
  if (!window.__mobileSearchHotkeysBound) {
    window.__mobileSearchHotkeysBound = true;
    window.addEventListener('keydown', (e) => {
      const k = String(e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'k') {
        e.preventDefault();
        if (mobileSearchWrap) {
          mobileSearchWrap.classList.remove('hidden');
          try { input?.focus(); } catch {}
        }
      }
      if (k === 'escape') { hideResults(); mobileSearchWrap?.classList.add('hidden'); }
    });
  }

  // Cerrar sugerencias al hacer click fuera
  if (!window.__mobileSearchClickAwayBound) {
    window.__mobileSearchClickAwayBound = true;
    document.addEventListener('click', (e) => {
      if (!mobileSearchWrap) return;
      const within = mobileSearchWrap.contains(e.target);
      if (!within) hideResults();
    });
  }
  
  // Exponer refresco para cuando lleguen productos asíncronamente
  window.__refreshMobileSuggestions = function(){
    try {
      if (!input) return;
      const q = String(input.value || '').trim();
      if (!q) { hideResults(); return; }
      const list = buildSuggestions(q);
      renderResults(list);
    } catch {}
  };
});

// --- Simple desktop search bindings ---
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('simple-search-btn');
  const inp = document.getElementById('simple-search-input');
  const doSimple = () => {
    const m = findFirstMatch(inp ? inp.value : '');
    if (m) openProductById(m.id); else showMessageBox('Sin resultados', 1200);
  };
  if (btn && !btn.dataset.simpleInit) { btn.dataset.simpleInit='1'; btn.addEventListener('click', (e)=>{ e.preventDefault(); doSimple(); }); }
  if (inp && !inp.dataset.simpleInit) { inp.dataset.simpleInit='1'; inp.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); doSimple(); }}); }
  try { updateClientAuthUi(); } catch {}
  try { setupClientRegistration(); } catch {}
  try { setupClientLogin(); } catch {}
});

// (Opcional) exponer para usar desde HTML en un botón “Buscar”
window.applyTextSearch = applyTextSearch;

// =====================
// Checkout: helpers + bindings
// =====================
const ORDERS_KEY = 'ens_orders_v1';
function loadOrders(){
  try { const raw = localStorage.getItem(ORDERS_KEY); const arr = JSON.parse(raw||'[]'); return Array.isArray(arr) ? arr : []; } catch { return []; }
}
function saveOrders(arr){ try { localStorage.setItem(ORDERS_KEY, JSON.stringify(arr||[])); } catch {} }
function generateOrderId(){
  try {
    const build = () => {
      const d = new Date();
      const pad = (n) => String(n).padStart(2,'0');
      const date = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
      const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      const rnd = Math.random().toString(36).slice(2,6).toUpperCase();
      return `ENS-${date}-${time}-${rnd}`;
    };
    const existing = new Set((loadOrders()||[]).map(o => String(o.id)));
    let id = build();
    let attempts = 0;
    while (existing.has(String(id)) && attempts < 5) {
      id = build();
      attempts++;
    }
    if (!existing.has(String(id))) return id;
    // Fallback muy improbable
    return `ENS-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
  } catch {
    return `ENS-${Date.now()}`;
  }
}
function openCheckout(){
  const ov = document.getElementById('checkout-overlay');
  if (!ov) return;
  const { total } = cartTotals();
  const tot = document.getElementById('checkout-total');
  if (tot) tot.textContent = currency(total);
  ov.classList.remove('hidden');
  document.body.style.overflow='hidden';
}
function closeCheckout(){ const ov = document.getElementById('checkout-overlay'); if (!ov) return; ov.classList.add('hidden'); document.body.style.overflow=''; }

// Intercept existing checkout click (capture) to show form instead of WhatsApp
document.getElementById('cart-checkout')?.addEventListener('click', (e) => {
  e.preventDefault();
  if (!cart.length) { showMessageBox('Tu carrito está vacío'); return; }
  e.stopImmediatePropagation();
  closeCart();
  openCheckout();
}, true);

// Checkout bindings
document.getElementById('checkout-cancel')?.addEventListener('click', closeCheckout);
document.getElementById('checkout-close')?.addEventListener('click', closeCheckout);
document.getElementById('checkout-overlay')?.addEventListener('click', (e) => { if (e.target && e.target.hasAttribute('data-checkout-close')) closeCheckout(); });
document.getElementById('checkout-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!cart.length) { showMessageBox('Tu carrito está vacío'); closeCheckout(); return; }
  const name = String(document.getElementById('checkout-name')?.value||'').trim();
  const lastname = String(document.getElementById('checkout-lastname')?.value||'').trim();
  const dni = String(document.getElementById('checkout-dni')?.value||'').replace(/\D+/g,'');
  const payment = document.querySelector('input[name="payment"]:checked')?.value||'cash';

  const email = String(document.getElementById('checkout-email')?.value||'').trim();
  const phoneRaw = String(document.getElementById('checkout-phone')?.value||'').trim();
  const phoneDigits = phoneRaw.replace(/[^0-9]/g,'');
  const emailOk = /.+@.+\..+/.test(email);
  if (!emailOk) { showMessageBox('Ingresa un email valido'); return; }
  if (phoneDigits.length < 6) { showMessageBox('Ingresa un telefono valido (6+ digitos)'); return; }

  if (!name || !lastname || !dni) { showMessageBox('Completá Nombre, Apellido y DNI'); return; }
  if (!/^\d{7,10}$/.test(dni)) { showMessageBox('El DNI debe tener entre 7 y 10 dígitos'); return; }
  if (payment === 'mp') {
    showMessageBox('La opción de Mercado Pago estará disponible próximamente. Elegí Efectivo por ahora.');
    return;
  }
  const orderId = generateOrderId();
  const { subtotal, total } = cartTotals();
  const order = {
    id: orderId,
    createdAt: new Date().toISOString(),
    buyer: { nombre: name, apellido: lastname, dni },
    payment: 'efectivo',
    items: cart.map(it => ({ id: it.id, name: it.name, qty: it.qty, price: it.price })),
    subtotal,
    total
  };
  const orders = loadOrders();
  orders.push(order);
  saveOrders(orders);
  // Clear cart
  cart = [];
  saveCart();
  closeCheckout();
  showMessageBox(`¡Compra registrada! Número de compra: ${orderId}`);
});

// Capturing override: enforce stock check and add status
document.getElementById('checkout-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  e.stopImmediatePropagation();
  try { e.stopPropagation(); } catch {}
  if (!cart.length) { showMessageBox('Tu carrito esta vacio'); closeCheckout(); return; }
  const name = String(document.getElementById('checkout-name')?.value||'').trim();
  const lastname = String(document.getElementById('checkout-lastname')?.value||'').trim();
  const dni = String(document.getElementById('checkout-dni')?.value||'').replace(/\D+/g,'');
  const email = String(document.getElementById('checkout-email')?.value||'').trim();
  const phoneRaw = String(document.getElementById('checkout-phone')?.value||'').trim();
  const phoneDigits = phoneRaw.replace(/[^0-9]/g,'');
  const payment = document.querySelector('input[name="payment"]:checked')?.value||'cash';
  if (!name || !lastname || !dni) { showMessageBox('Completa Nombre, Apellido y DNI'); return; }
  if (!/^\d{7,10}$/.test(dni)) { showMessageBox('El DNI debe tener entre 7 y 10 digitos'); return; }
  const emailOk = /.+@.+\..+/.test(email);
  if (!emailOk) { showMessageBox('Ingresa un email valido'); return; }
  if (phoneDigits.length < 6) { showMessageBox('Ingresa un telefono valido (6+ digitos)'); return; }
  if (payment === 'mp') { showMessageBox('La opcion de Mercado Pago estara disponible proximamente. Elegi Efectivo por ahora.'); return; }
  try {
    const insufficient = [];
    for (const it of cart){
      const p = await fetchProductById(it.id);
      const stock = Number(p?.stock||0) || 0;
      const need = Number(it.qty||0) || 0;
      if (stock <= 0 || stock < need) insufficient.push(`${it.name} (stock: ${stock}, necesita: ${need})`);
    }
    if (insufficient.length){ showMessageBox('No hay stock suficiente para:\n' + insufficient.join('\n')); return; }
  } catch {}

  const payload = {
    buyer: { name, lastname, dni, email, phone: phoneDigits },
    items: cart.map(it => ({ productId: Number(it.id), quantity: Number(it.qty) }))
  };
  try {
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    const token = getClientAccessToken();
    if (!token) {
      showMessageBox('Para finalizar la compra, inici� sesi�n como cliente.');
      try { setupClientLogin(); } catch {}
      const loginOverlay = document.getElementById('client-login-overlay');
      if (loginOverlay) loginOverlay.classList.remove('hidden');
      return;
    }
    headers.Authorization = `Bearer ${token}`;
    const resp = await fetch(`${API_BASE}/checkout`, { method: 'POST', headers, body: JSON.stringify(payload) });
    let orderNumber = ''; let orderId = '';
    if (resp.ok) { const data = await resp.json().catch(()=>({})); orderNumber = data?.orderNumber || ''; orderId = (data?.orderId != null) ? String(data.orderId) : ''; }
    else if (resp.status === 409) { const tx = await resp.text(); showMessageBox(tx || 'Stock insuficiente o conflicto de orden'); return; }
    else { const tx = await resp.text(); console.error('checkout error', resp.status, tx); showMessageBox('No se pudo registrar la compra. Intenta nuevamente.'); return; }
    cart = []; saveCart(); closeCheckout();
    const label = orderNumber || (orderId ? ('ID ' + orderId) : '');
    showMessageBox(label ? ('Compra registrada! Numero de compra: ' + label) : 'Compra registrada!');
  } catch (err) { console.error('checkout fetch error', err); showMessageBox('No se pudo registrar la compra (conexion).'); }
}, true);
