// Config API backend
import { API_BASE } from './config.js';
// Importaciones de Firebase (legacy, solo para compatibilidad de UI en esta etapa)
import { db, auth } from './firebaseconfig.js';
import { onAuthStateChanged, signOut, signInWithCustomToken, sendEmailVerification } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, addDoc, getDoc, doc, updateDoc, deleteDoc, query, where, serverTimestamp, getDocs, writeBatch, runTransaction, increment } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js"; // 'where' añadido aquí

let userId = null;
let isAuthReady = false;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'; // Asegurar que appId está definido

// Helper para llamadas a API con JWT
async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem('accessToken');
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${API_BASE}${path}`, Object.assign({}, opts, { headers }));
  if (!resp.ok) {
    let detail = '';
    try { const j = await resp.json(); detail = j?.error || JSON.stringify(j); } catch {}
    throw new Error(`HTTP ${resp.status} ${detail}`);
  }
  try { return await resp.json(); } catch { return null; }
}

/**
 * @function showMessageBox
 * @description Muestra un cuadro de mensaje personalizado.
 * @param {string} message - El mensaje a mostrar.
 * @param {string} type - 'success', 'error', 'warning' para estilos visuales.
 */
function showMessageBox(message, type = 'info') {
    const messageBoxContainer = document.getElementById('message-box-container');
    if (!messageBoxContainer) {
        console.error("No se encontró el contenedor de la caja de mensajes.");
        return;
    }

    const existingOverlay = messageBoxContainer.querySelector('.message-box-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    const overlay = document.createElement('div');
    overlay.className = 'message-box-overlay';

    const messageBoxContent = document.createElement('div');
    messageBoxContent.className = 'message-box-content';

    let bgColorClass = 'bg-blue-500';
    let iconHtml = '';

    switch (type) {
        case 'success':
            bgColorClass = 'bg-green-600';
            iconHtml = '<i class="fas fa-check-circle text-3xl mb-3"></i>';
            break;
        case 'error':
            bgColorClass = 'bg-red-600';
            iconHtml = '<i class="fas fa-times-circle text-3xl mb-3"></i>';
            break;
        case 'warning':
            bgColorClass = 'bg-yellow-600';
            iconHtml = '<i class="fas fa-exclamation-triangle text-3xl mb-3"></i>';
            break;
        case 'info':
        default:
            bgColorClass = 'bg-blue-600';
            iconHtml = '<i class="fas fa-info-circle text-3xl mb-3"></i>';
            break;
    }

    messageBoxContent.innerHTML = `
        <div class="p-6 rounded-lg shadow-xl text-center ${bgColorClass}">
            ${iconHtml}
            <p class="text-xl font-semibold mb-4 text-white">${message}</p>
            <button onclick="this.parentNode.parentNode.parentNode.remove()" class="bg-white text-gray-800 font-bold py-2 px-5 rounded-md mt-4 hover:bg-gray-100 transition">Cerrar</button>
        </div>
    `;

    overlay.appendChild(messageBoxContent);
    messageBoxContainer.appendChild(overlay);

    // Activar la animación de entrada
    setTimeout(() => {
        overlay.classList.add('show');
    }, 10);

    // Ocultar automáticamente después de 3 segundos (excepto para errores que deben ser cerrados manualmente)
    if (type !== 'error') {
        setTimeout(() => {
            if (overlay) {
                overlay.classList.remove('show');
                overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
            }
        }, 3000);
    }
}


/**
 * @function initFirebaseAndAuth
 * @description Inicializa la aplicación Firebase y configura la autenticación para el panel de administración.
 * AHORA: cualquier usuario autenticado tendrá acceso.
 */
async function initFirebaseAndAuth() {
    // Bypass Firebase if server JWT exists
    try {
        const token = localStorage.getItem('accessToken');
        if (token) {
            const sectionsContainer = document.getElementById('sectionsContainer');
            const sendVerificationEmailButton = document.getElementById('sendVerificationEmailButton');
            const adminMessageDiv = document.getElementById('adminMessage');
            userId = 'server-jwt';
            isAuthReady = true;
            if (adminMessageDiv) adminMessageDiv.classList.add('hidden');
            if (sectionsContainer) sectionsContainer.classList.remove('hidden');
            if (sendVerificationEmailButton) sendVerificationEmailButton.classList.remove('hidden');
            loadCategoriesForEdit();
            loadProductsForEdit();
            loadCategoriesForProductForms();
            loadProductsForStockManagement();
            showSection('createCategory');
            return;
        }
    } catch (_) {}
    console.log("Admin Panel - Iniciando inicialización de Firebase y autenticación...");

    const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

    if (initialAuthToken) {
        try {
            await signInWithCustomToken(auth, initialAuthToken);
        } catch (e) {
            console.error("Token custom inválido:", e);
            showMessageBox("Error de autenticación. Redirigiendo al login.", 'error');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
            return;
        }
    }

    onAuthStateChanged(auth, async (user) => {
        const sectionsContainer = document.getElementById('sectionsContainer');
        const sendVerificationEmailButton = document.getElementById('sendVerificationEmailButton');
        const adminMessageDiv = document.getElementById('adminMessage'); // Nuevo div para mensajes admin

        if (!user) {
            console.warn("Admin Panel - No hay sesión activa. Redirigiendo a login.html.");
            localStorage.removeItem('loggedIn');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 500);
            return;
        }

        // AHORA, cualquier usuario logueado se considera admin.
        const isAdmin = true; 

        if (isAdmin) {
            userId = user.uid;
            isAuthReady = true;
            console.log("Admin Panel - Usuario autenticado y es admin. ID de Usuario:", userId);
            
            // Ocultar mensaje y habilitar secciones admin
            if (adminMessageDiv) adminMessageDiv.classList.add('hidden');
            if (sectionsContainer) sectionsContainer.classList.remove('hidden');
            if (sendVerificationEmailButton) sendVerificationEmailButton.classList.remove('hidden'); 

            loadCategoriesForEdit();
            loadProductsForEdit();
            loadCategoriesForProductForms();
            loadProductsForStockManagement();
            showSection('createCategory'); // Mostrar la primera sección por defecto
        } else {
            // Esta rama no debería ejecutarse con la nueva lógica, pero se mantiene como precaución.
            console.warn("Admin Panel - Usuario logueado pero sin permisos de administrador. Esto no debería pasar.");
            userId = user.uid; // Aun sabemos quién es.

            if (sectionsContainer) sectionsContainer.classList.add('hidden');
            if (adminMessageDiv) {
                adminMessageDiv.classList.remove('hidden');
                adminMessageDiv.innerHTML = `
                    <div class="p-8 rounded-lg shadow-xl text-center bg-yellow-700 text-white">
                        <i class="fas fa-exclamation-triangle text-5xl mb-4"></i>
                        <p class="text-2xl font-semibold mb-4">Acceso Denegado (Lógica Inesperada)</p>
                        <p class="text-lg mb-6">Parece haber un problema. Con la configuración actual, cualquiera debería ser admin.</p>
                        <button id="tempSendVerificationEmailButton" class="action-button bg-orange-500 hover:bg-orange-600 mt-4">Enviar Email de Verificación</button>
                    </div>
                `;
                 document.getElementById('tempSendVerificationEmailButton')?.addEventListener('click', sendVerificationEmail);
            }
            if (logoutButton) logoutButton.classList.remove('hidden');
            if (sendVerificationEmailButton) {
                sendVerificationEmailButton.classList.remove('hidden');
            }
        }
    });
}


// Referencias a colecciones de Firestore
const categoriesCollectionRef = collection(db, `artifacts/${appId}/public/data/categories`);
const productsCollectionRef = collection(db, `artifacts/${appId}/public/data/products`);

const navButtons = document.querySelectorAll('.nav-button');
const sections = document.querySelectorAll('.section-content');
// Leer lista de secciones permitidas desde variable global o querystring (comma-separated)
let ALLOWED_SECTIONS = null;
try {
    const params = new URLSearchParams(window.location.search || '');
    const allowedFromQuery = params.get('allowed');
    if (Array.isArray(window.ALLOWED_SECTIONS)) {
        ALLOWED_SECTIONS = window.ALLOWED_SECTIONS;
    } else if (allowedFromQuery) {
        ALLOWED_SECTIONS = allowedFromQuery.split(',').map(s => s.trim()).filter(Boolean);
    }
} catch (_) { /* noop */ }
const logoutButton = document.getElementById('logoutButton');
const sendVerificationEmailButton = document.getElementById('sendVerificationEmailButton'); // Nuevo botón

const createCategoryForm = document.getElementById('createCategoryForm');
const editCategorySection = document.getElementById('editCategory');
const selectCategoryToEdit = document.getElementById('selectCategoryToEdit');
const searchCategoryToEditInput = document.getElementById('searchCategoryToEdit');
const editedCategoryNameInput = document.getElementById('editedCategoryName');
const editedCategoryImageUrlInput = document.getElementById('editedCategoryImageUrl');
const saveCategoryChangesButton = editCategorySection.querySelector('.action-button');

const createProductForm = document.getElementById('createProductForm');
const productCategorySelect = document.getElementById('productCategory');
const productStockInput = document.getElementById('productStock');
const productStatusSelect = document.getElementById('productStatus'); // Nuevo select para el estado
const productSpecificationsTextarea = document.getElementById('productSpecifications'); // Nuevo campo especificaciones
const productWarrantyInput = document.getElementById('productWarranty'); // Nuevo campo garantía

const editProductSection = document.getElementById('editProduct');
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
const editedProductStatusSelect = document.getElementById('editedProductStatus'); // Nuevo select para el estado
const editedProductSpecificationsTextarea = document.getElementById('editedProductSpecifications'); // Nuevo campo especificaciones edición
const editedProductWarrantyInput = document.getElementById('editedProductWarranty'); // Nuevo campo garantía edición
const saveProductChangesButton = editProductSection.querySelector('.action-button');

const manageStockSection = document.getElementById('manageStock');
const selectProductToManageStock = document.getElementById('selectProductToManageStock');
const currentProductStockInput = document.getElementById('currentProductStock');
const stockChangeAmountInput = document.getElementById('stockChangeAmount');
const increaseStockButton = document.getElementById('increaseStockButton');
const decreaseStockButton = document.getElementById('decreaseStockButton');

// Botón de migración
const migrateDataButton = document.getElementById('migrateDataButton');

// Caches para búsquedas y orden alfabético en edición
let categoriesForEditCache = [];
let productsForEditCache = [];


// Función para cambiar de sección
function showSection(sectionId) {
    if (Array.isArray(ALLOWED_SECTIONS) && ALLOWED_SECTIONS.length > 0) {
        if (!ALLOWED_SECTIONS.includes(sectionId)) {
            showMessageBox('No tienes permisos para ver esta sección.', 'warning');
            return;
        }
    }
    sections.forEach(section => {
        section.classList.add('hidden');
    });
    document.getElementById(sectionId).classList.remove('hidden');

    navButtons.forEach(button => {
        button.classList.remove('active');
    });
    const activeButton = document.querySelector(`.nav-button[data-section="${sectionId}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }

    if (sectionId === 'editCategory') {
        loadCategoriesForEdit();
    } else if (sectionId === 'createProduct' || sectionId === 'editProduct') {
        loadCategoriesForProductForms();
        if (sectionId === 'editProduct') {
            loadProductsForEdit();
        }
    } else if (sectionId === 'manageStock') {
        loadProductsForStockManagement();
    }
}

// --- Funciones para Categorías ---
async function loadCategoriesForEdit() {
    if (!isAuthReady) { console.log("loadCategoriesForEdit: Usuario no autenticado."); return; }
    try {
        console.log("loadCategoriesForEdit: Cargando categorías (API)...");
        const rows = await apiFetch('/categorias');
        const list = (rows || []).map(r => ({ id: String(r.id), name: r.name }));
        list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));
        categoriesForEditCache = list;
        const filterText = (searchCategoryToEditInput?.value || '').trim();
        renderCategoryEditOptions(filterText);
    } catch (error) {
        console.error("loadCategoriesForEdit (API):", error.message);
        showMessageBox("Error al cargar categorías.", "error");
    }
}

function renderCategoryEditOptions(filterText = '') {
    if (!selectCategoryToEdit) return;
    const previousValue = selectCategoryToEdit.value;
    selectCategoryToEdit.innerHTML = '<option value="">-- Selecciona una categoría --</option>';
    const normalized = (filterText || '').toLowerCase();
    let filtered = categoriesForEditCache.slice();
    if (normalized) {
        const starts = filtered.filter(c => (c.name || '').toLowerCase().startsWith(normalized));
        const contains = filtered.filter(c => !(c.name || '').toLowerCase().startsWith(normalized) && (c.name || '').toLowerCase().includes(normalized));
        filtered = starts.concat(contains);
    }
    for (const c of filtered) {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = c.name;
        selectCategoryToEdit.appendChild(option);
    }
    // Restaurar selección si sigue visible
    if (previousValue && filtered.some(c => c.id === previousValue)) {
        selectCategoryToEdit.value = previousValue;
    } else if (normalized && filtered.length > 0) {
        // Seleccionar automáticamente el primer resultado visible
        selectCategoryToEdit.value = filtered[0].id;
        populateCategoryEditForm(selectCategoryToEdit.value);
    } else if (previousValue) {
        // Si había una selección pero quedó fuera y no hay filtro, limpiar
        populateCategoryEditForm('');
    }
}

async function populateCategoryEditForm(categoryId) {
    if (!isAuthReady || !categoryId) {
        editedCategoryNameInput.value = '';
        editedCategoryImageUrlInput.value = '';
        return;
    }
    try {
        const c = categoriesForEditCache.find(c => c.id === String(categoryId));
        if (!c) { showMessageBox("Categoría no encontrada.", "error"); return; }
        // Para editar imagen necesitaremos otra fuente; por ahora sólo nombre
        editedCategoryNameInput.value = c.name || '';
        // Mantener imagen vacía hasta que se edite
        editedCategoryImageUrlInput.value = '';
    } catch (error) {
        console.error("populateCategoryEditForm (API):", error.message);
        showMessageBox("Error al cargar datos de la categoría.", "error");
    }
}

async function updateCategoryViaApi(categoryId, newName, newImageUrl) {
    if (!isAuthReady) {
        showMessageBox("Usuario no autenticado.", 'error');
        return;
    }
    try {
        await apiFetch(`/categorias/${categoryId}`, {
            method: 'PUT',
            body: JSON.stringify({ name: newName, image_url: newImageUrl })
        });
        showMessageBox(`Categoría "${newName}" actualizada exitosamente.`, 'success');
        loadCategoriesForEdit();
        loadCategoriesForProductForms();
        populateCategoryEditForm('');
    } catch (error) {
        console.error("updateCategoryViaApi:", error.message);
        showMessageBox("Error al actualizar la categoría.", 'error');
    }
}

// Función para eliminar categoría y productos asociados (en cascada)
async function deleteCategoryAndProducts(categoryId) {
    if (!isAuthReady) { showMessageBox("Usuario no autenticado.", 'error'); return; }

    const confirmDelete = await new Promise(resolve => {
        const message = "¿Estás seguro de que quieres eliminar esta categoría? Esto eliminará también TODOS los productos asociados a ella. Esta acción es irreversible.";
        const type = 'error';
        const messageBoxContainer = document.getElementById('message-box-container');
        if (!messageBoxContainer) {
            console.error("No se encontró el contenedor de la caja de mensajes.");
            resolve(false);
            return;
        }

        const existingOverlay = messageBoxContainer.querySelector('.message-box-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }

        const overlay = document.createElement('div');
        overlay.className = 'message-box-overlay show';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';

        const messageBoxContent = document.createElement('div');
        messageBoxContent.className = 'message-box-content transform scale-100 opacity-100';

        messageBoxContent.innerHTML = `
            <div class="p-8 rounded-lg shadow-xl text-center bg-red-700">
                <i class="fas fa-exclamation-circle text-5xl mb-4 text-white"></i>
                <p class="text-xl font-semibold mb-6 text-white">${message}</p>
                <div class="flex justify-center gap-4">
                    <button id="confirmDeleteBtn" class="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-md transition duration-300">Confirmar Eliminación</button>
                    <button id="cancelDeleteBtn" class="bg-gray-400 hover:bg-gray-500 text-gray-800 font-bold py-3 px-6 rounded-md transition duration-300">Cancelar</button>
                </div>
            </div>
        `;

        overlay.appendChild(messageBoxContent);
        messageBoxContainer.appendChild(overlay);

        document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
            overlay.remove();
            resolve(true);
        });

        document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });
    });

    if (confirmDelete) {
        try {
            await apiFetch(`/categorias/${categoryId}`, { method: 'DELETE' });
            showMessageBox("Categoría y productos asociados eliminados (soft-delete).", 'success');
            loadCategoriesForEdit();
            loadCategoriesForProductForms();
            populateCategoryEditForm('');
            loadProductsForEdit();
            loadProductsForStockManagement();
        } catch (error) {
            console.error("deleteCategoryAndProducts (API):", error.message);
            showMessageBox("Error al eliminar la categoría.", 'error');
        }
    }
}


// --- Funciones para Productos ---
async function loadCategoriesForProductForms() {
    if (!isAuthReady) { console.log("loadCategoriesForProductForms: Usuario no autenticado."); return; }
    productCategorySelect.innerHTML = '<option value="">-- Selecciona una categoría --</option>';
    editedProductCategorySelect.innerHTML = '<option value="">-- Selecciona una categoría --</option>';

    try {
        const rows = await apiFetch('/categorias');
        (rows || []).forEach(cat => {
            const opt1 = document.createElement('option');
            opt1.value = String(cat.id);
            opt1.textContent = cat.name;
            productCategorySelect.appendChild(opt1);

            const opt2 = document.createElement('option');
            opt2.value = String(cat.id);
            opt2.textContent = cat.name;
            editedProductCategorySelect.appendChild(opt2);
        });
    } catch (error) {
        console.error("loadCategoriesForProductForms (API):", error.message);
        showMessageBox("Error al cargar categorías para productos.", "error");
    }
}


async function loadProductsForEdit() {
    if (!isAuthReady) { console.log("loadProductsForEdit: Usuario no autenticado."); return; }
    try {
        const rows = await apiFetch('/productos');
        const list = (rows || []).map(p => ({ id: String(p.id), name: p.name, raw: p }));
        list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));
        productsForEditCache = list;
        const filterText = (searchProductToEditInput?.value || '').trim();
        renderProductEditOptions(filterText);
    } catch (error) {
        console.error("loadProductsForEdit (API):", error.message);
        showMessageBox("Error al cargar productos.", "error");
    }
}

function renderProductEditOptions(filterText = '') {
    if (!selectProductToEdit) return;
    const previousValue = selectProductToEdit.value;
    selectProductToEdit.innerHTML = '<option value="">-- Selecciona un producto --</option>';
    const normalized = (filterText || '').toLowerCase();
    let filtered = productsForEditCache.slice();
    if (normalized) {
        const starts = filtered.filter(p => (p.name || '').toLowerCase().startsWith(normalized));
        const contains = filtered.filter(p => !(p.name || '').toLowerCase().startsWith(normalized) && (p.name || '').toLowerCase().includes(normalized));
        filtered = starts.concat(contains);
    }
    for (const p of filtered) {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.name;
        option.classList.add('select-option-text');
        selectProductToEdit.appendChild(option);
    }
    // Restaurar selección si sigue visible
    if (previousValue && filtered.some(p => p.id === previousValue)) {
        selectProductToEdit.value = previousValue;
    } else if (normalized && filtered.length > 0) {
        // Seleccionar automáticamente el primer resultado visible
        selectProductToEdit.value = filtered[0].id;
        populateProductEditForm(selectProductToEdit.value);
    } else if (previousValue) {
        populateProductEditForm('');
    }
}

async function populateProductEditForm(productId) {
    if (!isAuthReady || !productId) {
        editedProductNameInput.value = '';
        editedProductPriceInput.value = '';
        editedProductImageUrlInput.value = '';
        editedProductCategorySelect.value = '';
        editedProductDescriptionInput.value = '';
        editedProductStockInput.value = 0;
        editedProductComponentsUrlInput.value = '';
        editedProductVideoUrlInput.value = '';
        editedProductStatusSelect.value = 'draft';
    editedProductSpecificationsTextarea.value = '';
    editedProductWarrantyInput.value = '';
        return;
    }
    try {
        const item = productsForEditCache.find(p => p.id === String(productId));
        if (item && item.raw) {
            const r = item.raw;
            editedProductNameInput.value = r.name || '';
            editedProductPriceInput.value = r.price != null ? r.price : '';
            editedProductImageUrlInput.value = r.image_url || r.image_file_path || '';
            editedProductCategorySelect.value = r.category_id != null ? String(r.category_id) : '';
            editedProductDescriptionInput.value = r.description || '';
            editedProductStockInput.value = r.stock_quantity != null ? Number(r.stock_quantity) : 0;
            editedProductComponentsUrlInput.value = '';
            editedProductVideoUrlInput.value = '';
            editedProductStatusSelect.value = 'active';
            // Cargar especificaciones (array u objeto) en formato texto
            if (productData.specifications) {
                if (Array.isArray(productData.specifications)) {
                    editedProductSpecificationsTextarea.value = productData.specifications.map(spec => {
                        if (typeof spec === 'string') return spec;
                        if (spec && spec.key) return `${spec.key}: ${spec.value ?? ''}`;
                        return '';
                    }).filter(Boolean).join('\n');
                } else if (typeof productData.specifications === 'object') {
                    editedProductSpecificationsTextarea.value = Object.entries(productData.specifications)
                        .map(([k,v]) => `${k}: ${v}`)
                        .join('\n');
                } else if (typeof productData.specifications === 'string') {
                    editedProductSpecificationsTextarea.value = productData.specifications;
                }
            } else {
                editedProductSpecificationsTextarea.value = '';
            }
            editedProductWarrantyInput.value = productData.warranty || '';
            console.log("populateProductEditForm: Datos (API) cargados:", r);
        } else {
            console.log("populateProductEditForm: Producto no encontrado para ID:", productId);
            showMessageBox("Producto no encontrado.", "error");
        }
    } catch (error) {
        console.error("populateProductEditForm (API):", error.message);
        showMessageBox("Error al cargar datos del producto.", "error");
    }
}

async function updateProductViaApi(productId, newName, newPrice, newImageUrl, newCategoryId, newDescription, newStock, newComponentsUrl, newVideoUrl, newStatus) {
    if (!isAuthReady) { showMessageBox("Usuario no autenticado.", 'error'); return; }
    try {
        await apiFetch(`/productos/${productId}`, {
            method: 'PUT',
            body: JSON.stringify({
                name: newName,
                description: newDescription || '',
                price: Number(newPrice),
                image_url: newImageUrl,
                category_id: Number(newCategoryId),
                stock_quantity: Number.isFinite(Number(newStock)) ? Number(newStock) : 0,
                specifications: editedProductSpecificationsTextarea?.value || null
            })
        });
        showMessageBox(`Producto "${newName}" actualizado exitosamente.`, 'success');
        loadProductsForEdit();
        loadProductsForStockManagement();
        populateProductEditForm('');
        if (editedProductSpecificationsTextarea) editedProductSpecificationsTextarea.value = '';
        if (editedProductWarrantyInput) editedProductWarrantyInput.value = '';
    } catch (error) {
        console.error("updateProductViaApi:", error.message);
        showMessageBox("Error al actualizar el producto.", 'error');
    }
}

// Helper: parsea texto de especificaciones a estructura uniforme (array de {key,value})
function parseSpecifications(raw) {
    if (!raw) return [];
    return raw.split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length)
        .map(line => {
            const [k, ...rest] = line.split(':');
            return { key: k ? k.trim() : line, value: rest.length ? rest.join(':').trim() : '' };
        });
}

async function deleteProductFromApi(productId) {
    if (!isAuthReady) { showMessageBox("Usuario no autenticado.", 'error'); return; }
    const confirmDelete = await new Promise(resolve => {
        const message = "¿Estás seguro de que quieres eliminar este producto? Esta acción es irreversible.";
        const type = 'warning';
        const messageBoxContainer = document.getElementById('message-box-container');
        if (!messageBoxContainer) {
            console.error("No se encontró el contenedor de la caja de mensajes.");
            resolve(false);
            return;
        }

        const existingOverlay = messageBoxContainer.querySelector('.message-box-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }

        const overlay = document.createElement('div');
        overlay.className = 'message-box-overlay show';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';

        const messageBoxContent = document.createElement('div');
        messageBoxContent.className = 'message-box-content transform scale-100 opacity-100';

        messageBoxContent.innerHTML = `
            <div class="p-8 rounded-lg shadow-xl text-center bg-yellow-600">
                <i class="fas fa-exclamation-triangle text-5xl mb-4 text-white"></i>
                <p class="text-xl font-semibold mb-6 text-white">${message}</p>
                <div class="flex justify-center gap-4">
                    <button id="confirmDeleteBtn" class="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 px-6 rounded-md transition duration-300">Confirmar Eliminación</button>
                    <button id="cancelDeleteBtn" class="bg-gray-400 hover:bg-gray-500 text-gray-800 font-bold py-3 px-6 rounded-md transition duration-300">Cancelar</button>
                </div>
            </div>
        `;

        overlay.appendChild(messageBoxContent);
        messageBoxContainer.appendChild(overlay);

        document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
            overlay.remove();
            resolve(true);
        });

        document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });
    });

    if (confirmDelete) {
        try {
            await apiFetch(`/productos/${productId}`, { method: 'DELETE' });
            showMessageBox("Producto eliminado exitosamente.", 'success');
            loadProductsForEdit();
            loadProductsForStockManagement();
            populateProductEditForm('');
            if (editedProductSpecificationsTextarea) editedProductSpecificationsTextarea.value = '';
            if (editedProductWarrantyInput) editedProductWarrantyInput.value = '';
        } catch (error) {
            console.error("deleteProductFromApi:", error.message);
            showMessageBox("Error al eliminar el producto.", 'error');
        }
    }
}


// --- Funciones para Control de Stock con Auditoría (transaccional) ---
async function loadProductsForStockManagement() {
    if (!isAuthReady) { console.log("loadProductsForStockManagement: Usuario no autenticado."); return; }
    selectProductToManageStock.innerHTML = '<option value="">-- Selecciona un producto --</option>';
    try {
        const rows = await apiFetch('/productos');
        (rows || []).forEach(p => {
            const o = document.createElement('option');
            o.value = String(p.id);
            o.textContent = p.name;
            o.classList.add('select-option-text');
            selectProductToManageStock.appendChild(o);
        });
    } catch (error) {
        console.error("loadProductsForStockManagement (API):", error.message);
        showMessageBox("Error al cargar productos para stock.", "error");
    }
}

async function populateStockManagementForm(productId) {
    if (!isAuthReady || !productId) {
        currentProductStockInput.value = '';
        stockChangeAmountInput.value = 0;
        return;
    }
    try {
        const rows = await apiFetch('/productos');
        const p = (rows || []).find(r => String(r.id) === String(productId));
        if (p) {
            currentProductStockInput.value = p.stock_quantity != null ? Number(p.stock_quantity) : 0;
            stockChangeAmountInput.value = 0;
        } else {
            showMessageBox("Producto no encontrado para gestionar stock.", "error");
        }
    } catch (error) {
        console.error("populateStockManagementForm (API):", error.message);
        showMessageBox("Error al cargar datos del producto para stock.", "error");
    }
}

async function updateProductStockSafe(productId, delta, reason = "ajuste") {
    if (!isAuthReady) { showMessageBox("Usuario no autenticado.", 'error'); return; }
    try {
        const current = Number(currentProductStockInput.value || 0);
        const next = current + Number(delta || 0);
        if (next < 0) throw new Error('Stock insuficiente');
        await apiFetch(`/productos/${productId}`, {
            method: 'PUT',
            body: JSON.stringify({ stock_quantity: next })
        });
        showMessageBox("Stock actualizado exitosamente.", 'success');
        populateStockManagementForm(productId);
        loadProductsForEdit();
    } catch (error) {
        console.error("updateProductStockSafe (API):", error.message);
        showMessageBox(`Error al actualizar el stock: ${error.message}`,'error');
    }
}

async function migrateData() {
    if (!isAuthReady) {
        console.error("DEBUG: Fallo al migrar datos. Estado:", { db: !!db, userId: userId, isAuthReady: isAuthReady });
        showMessageBox("Error: Usuario no autenticado o no autorizado. No se puede migrar datos. Por favor, intenta cerrar sesión y volver a iniciarla.", "error");
        return;
    }

    const confirmMigration = await new Promise(resolve => {
        const message = "¿Estás seguro de que quieres ejecutar la migración de datos? Esto actualizará todos los productos con categoryId y categoryName. Ejecuta esto solo una vez.";
        const type = 'warning';
        const messageBoxContainer = document.getElementById('message-box-container');
        if (!messageBoxContainer) {
            console.error("No se encontró el contenedor de la caja de mensajes.");
            resolve(false);
            return;
        }

        const existingOverlay = messageBoxContainer.querySelector('.message-box-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }

        const overlay = document.createElement('div');
        overlay.className = 'message-box-overlay show';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';

        const messageBoxContent = document.createElement('div');
        messageBoxContent.className = 'message-box-content transform scale-100 opacity-100';

        messageBoxContent.innerHTML = `
            <div class="p-8 rounded-lg shadow-xl text-center bg-yellow-600">
                <i class="fas fa-database text-5xl mb-4 text-white"></i>
                <p class="text-xl font-semibold mb-6 text-white">${message}</p>
                <div class="flex justify-center gap-4">
                    <button id="confirmMigrateBtn" class="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 px-6 rounded-md transition duration-300">Confirmar Migración</button>
                    <button id="cancelMigrateBtn" class="bg-gray-400 hover:bg-gray-500 text-gray-800 font-bold py-3 px-6 rounded-md transition duration-300">Cancelar</button>
                </div>
            </div>
        `;

        overlay.appendChild(messageBoxContent);
        messageBoxContainer.appendChild(overlay);

        document.getElementById('confirmMigrateBtn').addEventListener('click', () => {
            overlay.remove();
            resolve(true);
        });

        document.getElementById('cancelMigrateBtn').addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });
    });

    if (!confirmMigration) {
        showMessageBox("Migración cancelada.", "info");
        return;
    }

    showMessageBox("Iniciando migración de datos... Por favor, no cierres esta ventana.", "info");

    try {
        const categoriesSnapshot = await getDocs(categoriesCollectionRef);
        const categoryNameToIdMap = new Map();
        categoriesSnapshot.forEach(doc => {
            const category = doc.data();
            categoryNameToIdMap.set(category.name, doc.id);
        });

        const productsSnapshot = await getDocs(productsCollectionRef);
        const batch = writeBatch(db);
        let updatedCount = 0;

        productsSnapshot.forEach(doc => {
            const product = doc.data();
            if (product.category && !product.categoryId) {
                const categoryId = categoryNameToIdMap.get(product.category);
                if (categoryId) {
                    const productRef = doc.ref;
                    batch.update(productRef, {
                        categoryId: categoryId,
                        categoryName: product.category,
                        status: product.status || "published"
                    });
                    updatedCount++;
                } else {
                    console.warn(`Producto "${product.name}" tiene una categoría (${product.category}) que no se encontró en la lista de categorías. No se migrará completamente.`);
                }
            } else if (!product.status) {
                const productRef = doc.ref;
                batch.update(productRef, {
                    status: "published"
                });
                updatedCount++;
            }
        });

        await batch.commit();
        showMessageBox(`Migración completada. ${updatedCount} productos actualizados.`, "success");
        loadProductsForEdit();
        loadProductsForStockManagement();
    } catch (error) {
        console.error("Error durante la migración de datos:", error);
        showMessageBox(`Error durante la migración de datos: ${error.message}`, "error");
    }
}

async function sendVerificationEmail() {
    const user = auth.currentUser;
    if (user) {
        if (!user.emailVerified) {
            try {
                await sendEmailVerification(user);
                showMessageBox("¡Email de verificación enviado! Revisa tu bandeja de entrada y la carpeta de spam.", "info");
            } catch (error) {
                console.error("Error al enviar email de verificación:", error);
                showMessageBox("Error al enviar email de verificación. Intenta de nuevo.", "error");
            }
        } else {
            showMessageBox("Tu email ya está verificado. ¡Todo listo!", "success");
        }
    } else {
        showMessageBox("No hay usuario autenticado. Por favor, inicia sesión.", "warning");
    }
}


// --- Event Listeners del DOM ---
document.addEventListener('DOMContentLoaded', () => {
    initFirebaseAndAuth();

    // Referencia al contenedor principal de las secciones y al div de mensaje de admin
    const sectionsContainer = document.getElementById('sectionsContainer');
    const adminMessageDiv = document.createElement('div');
    adminMessageDiv.id = 'adminMessage';
    adminMessageDiv.className = 'section-content hidden'; // Por defecto oculto
    // Insertar el div de mensaje antes del sectionsContainer en el DOM
    document.querySelector('.admin-panel-container').insertBefore(adminMessageDiv, sectionsContainer);

    // Si hay secciones permitidas definidas, ocultar botones de navegación no permitidos
    try {
        if (Array.isArray(ALLOWED_SECTIONS) && ALLOWED_SECTIONS.length > 0) {
            navButtons.forEach(btn => {
                const sec = btn.getAttribute('data-section');
                if (sec && !ALLOWED_SECTIONS.includes(sec)) {
                    btn.classList.add('hidden');
                }
            });
        }
    } catch (_) { /* noop */ }


    navButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Solo permitir cambiar de sección si es administrador (isAuthReady = true)
            if (isAuthReady) {
                const sectionId = this.dataset.section;
                if (sectionId) {
                    showSection(sectionId);
                }
            } else {
                showMessageBox("No tienes permisos para navegar las secciones. Por favor, verifica tu estado de administrador.", "warning");
            }
        });
    });

    // Manejar el formulario de Crear Categoría
    if (createCategoryForm) {
        createCategoryForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            if (!isAuthReady) {
                console.error("DEBUG: Fallo al crear categoría. Estado:", { db: !!db, userId: userId, isAuthReady: isAuthReady });
                showMessageBox("Usuario no autenticado o no autorizado. Intenta de nuevo.", "error");
                return;
            }
            const categoryName = document.getElementById('categoryName').value;
            const categoryImageUrl = document.getElementById('categoryImageUrl').value;

            if (!categoryName || !categoryImageUrl) {
                showMessageBox("Nombre y URL de imagen son obligatorios.", "warning");
                return;
            }

            try {
                await addDoc(categoriesCollectionRef, {
                    name: categoryName,
                    imageUrl: categoryImageUrl,
                    createdAt: serverTimestamp()
                });
                showMessageBox(`Categoría "${categoryName}" creada exitosamente.`, 'success');
                createCategoryForm.reset();
                loadCategoriesForEdit();
                loadCategoriesForProductForms();
            } catch (error) {
                console.error("Error al crear categoría:", error);
                showMessageBox("Error al crear categoría.", "error");
            }
        });
    }

    // Manejar la selección y guardado de Editar Categoría
    selectCategoryToEdit.addEventListener('change', function() {
        populateCategoryEditForm(this.value);
    });

    // Búsqueda en Editar Categoría
    if (searchCategoryToEditInput) {
        searchCategoryToEditInput.addEventListener('input', () => {
            renderCategoryEditOptions(searchCategoryToEditInput.value.trim());
        });
    }

    if (saveCategoryChangesButton) {
        saveCategoryChangesButton.addEventListener('click', async function() {
            const categoryId = selectCategoryToEdit.value;
            const newName = editedCategoryNameInput.value;
            const newImageUrl = editedCategoryImageUrlInput.value;

            if (!categoryId) {
                showMessageBox("Por favor, selecciona una categoría para editar.", "warning");
                return;
            }
            if (!newName || !newImageUrl) {
                showMessageBox("Ambos campos (nombre y URL de imagen) son requeridos.", "warning");
                return;
            }
            await updateCategoryViaApi(categoryId, newName, newImageUrl);
        });
    }

    // Añadir botón de Eliminar Categoría dinámicamente
    const deleteCategoryButton = document.createElement('button');
    deleteCategoryButton.className = 'action-button bg-red-600 hover:bg-red-700 w-full mt-4';
    deleteCategoryButton.textContent = 'Eliminar Categoría Seleccionada y Productos';
    if (editCategorySection) {
        editCategorySection.appendChild(deleteCategoryButton);
    }

    if (deleteCategoryButton) {
        deleteCategoryButton.addEventListener('click', async function() {
            const categoryId = selectCategoryToEdit.value;
            if (!categoryId) {
                showMessageBox("Por favor, selecciona una categoría para eliminar.", "warning");
                return;
            }
            await deleteCategoryAndProducts(categoryId);
        });
    }

    // Manejar el formulario de Crear Producto
    if (createProductForm) {
        createProductForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            if (!isAuthReady) {
                console.error("DEBUG: Fallo al crear producto. Estado:", { db: !!db, userId: userId, isAuthReady: isAuthReady });
                showMessageBox("Usuario no autenticado o no autorizado. Intenta de nuevo.", "error");
                return;
            }
            const productName = document.getElementById('productName').value;
            const productPrice = parseFloat(document.getElementById('productPrice').value);
            const productImageUrl = document.getElementById('productImageUrl').value;
            const productCategoryId = productCategorySelect.value;
            const productDescription = document.getElementById('productDescription').value;
            const productStock = parseInt(productStockInput.value);
            const productComponentsUrl = document.getElementById('productComponentsUrl').value;
            const productVideoUrl = document.getElementById('productVideoUrl').value;
            const productStatus = productStatusSelect.value;
            const productSpecifications = parseSpecifications(productSpecificationsTextarea?.value);
            const productWarranty = productWarrantyInput?.value?.trim() || null;

            if (!productName || isNaN(productPrice) || productPrice <= 0 || !productCategoryId || isNaN(productStock) || productStock < 0 || !productStatus) {
                showMessageBox("Nombre, precio (mayor a 0), categoría, stock (mayor o igual a 0) y estado son obligatorios.", "warning");
                return;
            }

            await apiFetch('/productos', { method: 'POST', body: JSON.stringify({
                name: productName,
                description: productDescription || '',
                price: Number(productPrice),
                image_url: productImageUrl,
                category_id: Number(productCategoryId),
                stock_quantity: Number(productStock),
                specifications: (productSpecificationsTextarea?.value || '').trim() || null
            })});
            showMessageBox(`Producto "${productName}" creado exitosamente.`, 'success');
            createProductForm.reset();
            loadProductsForEdit();
            loadProductsForStockManagement();
            productCategorySelect.value = '';
            productStockInput.value = 0;
            productStatusSelect.value = 'draft';
            if (productSpecificationsTextarea) productSpecificationsTextarea.value = '';
            if (productWarrantyInput) productWarrantyInput.value = '';
        });
    }

    // Manejar la selección y edición de productos
    selectProductToEdit.addEventListener('change', function() {
        populateProductEditForm(this.value);
    });

    // Búsqueda en Editar Producto
    if (searchProductToEditInput) {
        searchProductToEditInput.addEventListener('input', () => {
            renderProductEditOptions(searchProductToEditInput.value.trim());
        });
    }

    if (saveProductChangesButton) {
        saveProductChangesButton.addEventListener('click', async function() {
            const productId = selectProductToEdit.value;
            const newName = editedProductNameInput.value;
            const newPrice = parseFloat(editedProductPriceInput.value);
            const newImageUrl = editedProductImageUrlInput.value;
            const newCategoryId = editedProductCategorySelect.value;
            const newDescription = editedProductDescriptionInput.value;
            const newStock = parseInt(editedProductStockInput.value);
            const newComponentsUrl = editedProductComponentsUrlInput.value;
            const newVideoUrl = editedProductVideoUrlInput.value;
            const newStatus = editedProductStatusSelect.value;

            if (!productId) {
                showMessageBox("Por favor, selecciona un producto para editar.", "warning");
                return;
            }
            if (!newName || !newImageUrl || isNaN(newPrice) || newPrice <= 0 || !newCategoryId || isNaN(newStock) || newStock < 0 || !newStatus) {
                showMessageBox("Nombre, precio (mayor a 0), URL de imagen, categoría, stock (mayor o igual a 0) y estado son obligatorios.", "warning");
                return;
            }
            await updateProductViaApi(productId, newName, newPrice, newImageUrl, newCategoryId, newDescription, newStock, newComponentsUrl, newVideoUrl, newStatus);
        });
    }

    // Añadir botón de Eliminar Producto dinámicamente
    const deleteProductButton = document.createElement('button');
    deleteProductButton.className = 'action-button bg-red-600 hover:bg-red-700 w-full mt-4';
    deleteProductButton.textContent = 'Eliminar Producto Seleccionado';
    if (editProductSection) {
        editProductSection.appendChild(deleteProductButton);
    }

    if (deleteProductButton) {
        deleteProductButton.addEventListener('click', async function() {
            const productId = selectProductToEdit.value;
            if (!productId) {
                showMessageBox("Por favor, selecciona un producto para eliminar.", "warning");
                return;
            }
            await deleteProductFromApi(productId);
        });
    }

    // --- Event Listeners para Control de Stock ---
    selectProductToManageStock.addEventListener('change', function() {
        populateStockManagementForm(this.value);
    });

    increaseStockButton.addEventListener('click', async function() {
        const productId = selectProductToManageStock.value;
        const changeAmount = parseInt(stockChangeAmountInput.value);
        if (!productId) {
            showMessageBox("Por favor, selecciona un producto.", "warning");
            return;
        }
        if (isNaN(changeAmount) || changeAmount <= 0) {
            showMessageBox("Ingresa una cantidad positiva para aumentar el stock.", "warning");
            return;
        }
        await updateProductStockSafe(productId, changeAmount, "Ajuste de entrada desde Admin");
    });

    decreaseStockButton.addEventListener('click', async function() {
        const productId = selectProductToManageStock.value;
        const changeAmount = parseInt(stockChangeAmountInput.value);
        if (!productId) {
            showMessageBox("Por favor, selecciona un producto.", "warning");
            return;
        }
        if (isNaN(changeAmount) || changeAmount <= 0) {
            showMessageBox("Ingresa una cantidad positiva para disminuir el stock.", "warning");
            return;
        }
        await updateProductStockSafe(productId, -changeAmount, "Ajuste de salida desde Admin");
    });


    // Lógica para el botón de Cerrar Sesión
    if (logoutButton) {
        logoutButton.addEventListener('click', async function() {
            localStorage.removeItem('loggedIn');
            if (auth) {
                try {
                    await signOut(auth);
                    showMessageBox('Sesión cerrada. Redirigiendo a la página principal...', 'info');
                } catch (error) {
                    console.error("Error al cerrar sesión de Firebase:", error);
                    showMessageBox("Error al cerrar sesión.", "error");
                }
            } else {
                showMessageBox("No se pudo cerrar sesión de Firebase. Redirigiendo...", "warning");
            }
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);
        });
    }

    // Event listener para el botón de migración
    if (migrateDataButton) {
        migrateDataButton.addEventListener('click', migrateData);
    }

    // Event listener para el nuevo botón de envío de email de verificación
    if (sendVerificationEmailButton) {
        sendVerificationEmailButton.addEventListener('click', sendVerificationEmail);
    }

    const defaultSection = typeof window !== 'undefined' && window.DEFAULT_SECTION ? window.DEFAULT_SECTION : 'createCategory';
    showSection(defaultSection);
    loadCategoriesForProductForms();
});

window.showMessageBox = showMessageBox;
