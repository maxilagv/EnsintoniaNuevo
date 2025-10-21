// Configuración global de la API
import { API_BASE } from './config.js';

// Variables globales de Firebase (proporcionadas por el entorno Canvas)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

let app; // (legacy Firebase, no usado al consumir API)
let userId;
let categoriesData = []; // Para almacenar las categorías cargadas

// Nuevas variables de estado para controlar la carga inicial
let categoriesInitialLoadComplete = false;
let productsInitialLoadComplete = false;

// Variable global para almacenar los intervalos de animación de las categorías
let categoryAnimationIntervals = {};

// Nuevo: cache global de productos (id + nombre en minúsculas) para búsqueda/sugerencias
let productsCache = [];
// Unsubscribe handler para listener activo de productos (onSnapshot)
let unsubscribeProducts = null;

// Cache completo para re-render
let productsFullCache = [];
let currentSort = 'recent';          // valor inicial coincide con <select>
window.productsFullCache = productsFullCache;

/**
 * @function checkAndHideMainLoader
 * @description Verifica si todas las cargas iniciales (categorías y productos) han finalizado
 * y oculta el loader principal si es así.
 */
function checkAndHideMainLoader() {
    console.log("checkAndHideMainLoader - called."); // Log de inicio
    console.log("checkAndHideMainLoader - categoriesInitialLoadComplete:", categoriesInitialLoadComplete);
    console.log("checkAndHideMainLoader - productsInitialLoadComplete:", productsInitialLoadComplete);

    if (categoriesInitialLoadComplete && productsInitialLoadComplete) {
        console.log("checkAndHideMainLoader - Ambas cargas iniciales completas. Ocultando loader futurista.");
        hideLoading('futuristic-loader');
    } else {
        console.log("checkAndHideMainLoader - Esperando a que todas las cargas iniciales se completen.");
    }
}

/**
 * @function initFirebase
 * @description Inicializa la aplicación Firebase y configura la autenticación.
 * Maneja el inicio de sesión con token personalizado o de forma anónima.
 * También escucha los cambios en el estado de autenticación para cargar las categorías.
 */
async function initFirebase() {
    console.log("initFirebase - Iniciando inicialización de Firebase...");
    try {
        // 'app' ahora se inicializa aquí usando la firebaseConfig importada
        app = initializeApp(firebaseConfig);
        // 'db' y 'auth' ya vienen importados de firebaseconfig.js

        // Iniciar sesión con token personalizado si está disponible, de lo contrario, de forma anónima
        if (initialAuthToken) {
            console.log("initFirebase - Intentando iniciar sesión con token personalizado.");
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            console.log("initFirebase - Intentando iniciar sesión anónimamente.");
            await signInAnonymously(auth);
        }

        // Escuchar cambios en el estado de autenticación
        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                console.log("initFirebase - Firebase inicializado. ID de Usuario:", userId);
                const userIdDisplay = document.getElementById('user-id-display');
                if (userIdDisplay) { // Check if element exists before accessing
                    userIdDisplay.textContent = `ID de Usuario: ${userId}`;
                }

                // Si la URL trae ?cat=Nombre: mostrar solo esa categoría y ocultar categorías
                try {
                  const u = new URL(window.location.href);
                  const cat = u.searchParams.get('cat') || u.searchParams.get('category');
                  if (cat) {
                    console.log("initFirebase - Parámetro cat= detectado:", cat, " -> solo productos de esa categoría, ocultando categorías.");

                    // Ocultar sección/caja de categorías
                    const categoriesSection = document.getElementById('productos');
                    if (categoriesSection) categoriesSection.style.display = 'none';
                    const categoriesContainer = document.getElementById('categories-container');
                    if (categoriesContainer) categoriesContainer.style.display = 'none';

                    // Título dinámico arriba de productos
                    const titleEl = document.getElementById('category-title');
                    if (titleEl) titleEl.textContent = `Mostrando productos de: ${cat}`;

                    // Marcar categorías como completas para el loader global
                    categoriesInitialLoadComplete = true;

                    // Cargar productos filtrados y salir de esta rama
                    loadProductsByCategory(cat);
                    return; // Evitar que se ejecuten loadCategories/loadAllProducts más abajo
                  }
                } catch (e) {
                  console.warn('initFirebase - No se pudo leer parámetro cat, seguimos flujo normal.', e);
                }


                // Cargar categorías y productos después de la autenticación
                console.log("initFirebase - Llamando a loadCategories y a la carga de productos adecuada según URL.");
                loadCategories();
                // Si la URL trae ?cat=Nombre, abrir la carga filtrada; si no, cargar todos.
                try {
                  const u = new URL(window.location.href);
                  const cat = u.searchParams.get('cat') || u.searchParams.get('category');
                  if (cat) {
                    console.log("initFirebase - Parámetro cat detectado en URL:", cat, " -> llamando a loadProductsByCategory.");
                    loadProductsByCategory(cat);
                  } else {
                    console.log("initFirebase - Sin parámetro cat en URL -> llamando a loadAllProducts.");
                    loadAllProducts();
                  }
                } catch (e) {
                  console.warn('initFirebase - error leyendo URL para parámetro cat, cargando todos los productos', e);
                  loadAllProducts();
                }
            } else {
                console.log("initFirebase - Ningún usuario ha iniciado sesión. Marcando cargas como completas.");
                userId = null;
                const userIdDisplay = document.getElementById('user-id-display');
                if (userIdDisplay) {
                    userIdDisplay.textContent = 'ID de Usuario: No autenticado';
                }
                // Si no hay usuario, marcar ambas cargas como completas para ocultar el loader
                categoriesInitialLoadComplete = true;
                productsInitialLoadComplete = true;
                checkAndHideMainLoader();
            }
        });

    } catch (error) {
        console.error("initFirebase - Error al inicializar Firebase:", error);
        showMessageBox("Error al inicializar la aplicación. Por favor, inténtalo de nuevo más tarde.");
        // Asegurar que el loader se oculte incluso si hay un error de inicialización de Firebase
        categoriesInitialLoadComplete = true;
        productsInitialLoadComplete = true;
        checkAndHideMainLoader();
    }
}

/**
 * @function showLoading
 * @description Muestra un spinner de carga específico.
 * @param {string} spinnerId - El ID del elemento del spinner a mostrar.
 */
function showLoading(spinnerId) {
    console.log("showLoading - Mostrando loader:", spinnerId);
    const loader = document.getElementById(spinnerId);
    if (loader) { // Asegurarse de que el loader existe
        loader.classList.remove('hidden');
        if (spinnerId === 'futuristic-loader') {
            document.body.style.overflow = 'hidden'; // Evita el scroll solo para el loader de página completa
        }
    }
}

/**
 * @function hideLoading
 * @description Oculta un spinner de carga específico.
 * @param {string} spinnerId - El ID del elemento del spinner a ocultar.
 */
function hideLoading(spinnerId) {
    console.log("hideLoading - Ocultando loader:", spinnerId);
    const loader = document.getElementById(spinnerId);
    if (loader) { // Asegurarse de que el loader existe
        if (spinnerId === 'futuristic-loader') {
            loader.style.opacity = '0'; // Inicia la transición
            loader.style.pointerEvents = 'none'; // Deshabilita los eventos del puntero inmediatamente
            console.log("hideLoading - Futuristic loader: opacity set to 0, pointer-events set to none.");

            // Eliminar el elemento del DOM después de la transición
            setTimeout(() => {
                loader.classList.add('hidden'); // Añade la clase 'hidden' después de la transición
                // loader.remove(); // Elimina el loader del DOM después de la transición
                document.body.style.overflow = ''; // Restaura el scroll
                console.log("hideLoading - Futuristic loader: 'hidden' class added after timeout.");
            }, 500); // 500ms coincide con la duración de la transición CSS
        } else {
            loader.classList.add('hidden');
        }
    }
}

/**
 * @function loadCategories
 * @description Carga las categorías desde Firestore en tiempo real y las renderiza en la página
 * y en el submenú de categorías del menú móvil. También carga una muestra de imágenes de productos
 * para cada categoría para la animación.
 */
async function loadCategories() {
    console.log("loadCategories - Iniciando carga de categorías.");
    if (!db) {
        console.error("loadCategories - Firestore no inicializado. No se pueden cargar categorías.");
        categoriesInitialLoadComplete = true;
        checkAndHideMainLoader();
        return;
    }
    showLoading('categories-loading-spinner');

    const categoriesCol = collection(db, `artifacts/${appId}/public/data/categories`);

    onSnapshot(categoriesCol, async (snapshot) => {
        console.log("loadCategories - onSnapshot recibido. Número de categorías:", snapshot.size);
        categoriesData = []; // Limpiar datos de categorías anteriores
        const categoriesContainer = document.getElementById('categories-container');
        const categoriesSubmenu = document.getElementById('categories-submenu');

        if (categoriesContainer) {
            categoriesContainer.innerHTML = ''; // Limpiar categorías existentes en la sección principal
        } else {
            console.warn('loadCategories - elemento #categories-container no encontrado en el DOM.');
        }
        if (categoriesSubmenu) {
            categoriesSubmenu.innerHTML = ''; // Limpiar categorías existentes en el submenú
        } else {
            console.warn('loadCategories - elemento #categories-submenu no encontrado en el DOM.');
        }

        if (snapshot.empty) {
            console.log("loadCategories - No hay categorías en Firestore.");
            if (categoriesContainer) {
                categoriesContainer.innerHTML = '<p class="text-center text-futuristic-mute col-span-full">No hay categorías disponibles en este momento.</p>';
            }
            if (categoriesSubmenu) {
                categoriesSubmenu.innerHTML = '<li class="text-futuristic-mute text-base py-2">No hay categorías.</li>';
            }
        } else {
            const categoryPromises = snapshot.docs.map(async doc => { // Procesar cada categoría asíncronamente
                const category = { id: doc.id, ...doc.data() };

                // Sub-consulta: intentar primero con categoryName, fallback a category
                const baseCol = collection(db, `artifacts/${appId}/public/data/products`);
                let productsForCategoryQuery = query(
                    baseCol,
                    where("categoryName", "==", category.name),
                    limit(3)
                );
                let productsSnapshot = await getDocs(productsForCategoryQuery);

                if (productsSnapshot.empty) {
                    productsForCategoryQuery = query(
                        baseCol,
                        where("category", "==", category.name),
                        limit(3)
                    );
                    productsSnapshot = await getDocs(productsForCategoryQuery);
                }

                const productImages = productsSnapshot.docs
                    .map(pDoc => pDoc.data().imageUrl)
                    .filter(url => url && url !== category.imageUrl);

                if (category.imageUrl) productImages.unshift(category.imageUrl);
                if (productImages.length === 0 && category.imageUrl) productImages.push(category.imageUrl);

                category.productImages = productImages;
                categoriesData.push(category);
                return category;
            });

            // Esperar a que todas las sub-consultas de imágenes de productos se completen
            const loadedCategories = await Promise.all(categoryPromises);

            loadedCategories.forEach(category => {
                // Crear el elemento de la tarjeta de categoría
                const categoryCardDiv = document.createElement('div');
                // Usar class category-card para no interferir con product-card
                categoryCardDiv.className = "category-card group rounded-2xl flex flex-col"; // Clases del product-card para aplicar estilos futuristas
                // Apuntar a la página de catálogo con parámetro ?cat=para navegación cross-page
                categoryCardDiv.addEventListener('click', (e) => {
                    e.preventDefault();
                    goToCategory(category.name);
                });

                categoryCardDiv.setAttribute('data-category-name', category.name);
                categoryCardDiv.setAttribute('data-original-image', category.imageUrl || 'https://placehold.co/600x400/cccccc/333333?text=Sin+Imagen');
                categoryCardDiv.setAttribute('data-product-images', JSON.stringify(category.productImages));
 
                // Rellenar el contenido HTML de la tarjeta
                // La imagen tiene un onclick para abrir el modal de zoom
                categoryCardDiv.innerHTML = `
                    <div class="relative aspect-[4/3] overflow-hidden rounded-t-2xl">
                        <img loading="lazy" decoding="async"
                             src="${category.imageUrl || 'https://placehold.co/600x400/cccccc/333333?text=Sin+Imagen'}"
                             alt="${category.name}"
                             class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02] category-image-animated"
                             onerror="this.onerror=null;this.src='https://placehold.co/600x400/cccccc/333333?text=Sin+Imagen';">
                    </div>
                    <div class="p-6 sm:p-7">
                        <h3 class="text-xl sm:text-2xl font-semibold mb-2 line-clamp-2 text-futuristic-ink">${category.name}</h3>
                        <p class="text-base text-futuristic-mute mb-4 line-clamp-2">${category.description || 'Descripción no disponible.'}</p>
                        <button class="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 shadow-sm focus:ring-2 focus:ring-brand-500/30 active:translate-y-px w-full btn">Ver Categoría</button>
                    </div>
                `;
                 
                 // Añadir listeners directamente a la tarjeta creada para la animación en PC
                 categoryCardDiv.addEventListener('mouseenter', () => startCategoryImageAnimation(categoryCardDiv));
                 categoryCardDiv.addEventListener('mouseleave', () => stopCategoryImageAnimation(categoryCardDiv)); // <--- Cambiado aquí

                 if (categoriesContainer) {
                    categoriesContainer.appendChild(categoryCardDiv);
                 } else {
                    console.warn('loadCategories - no se puede append; #categories-container ausente.');
                 }

                // Renderizar en el submenú móvil: link directo a catalogo.html?cat=
                const submenuItem = `
                    <li>
                        <a href="/catalogo.html?cat=${encodeURIComponent(category.name)}"
                           data-cat="${(category.name || '').replace(/\"/g,'&quot;')}"
                           onclick="goToCategory(this.dataset.cat); return false;"
                           class="block py-2 text-base text-futuristic-ink hover:text-brand-1 transition duration-200">
                            ${category.name}
                        </a>
                    </li>
                `;

                if (categoriesSubmenu) {
                    categoriesSubmenu.innerHTML += submenuItem;
                } else {
                    console.warn('loadCategories - submenú de categorías ausente; salto render en mobile submenu.');
                }
            });
        }
        hideLoading('categories-loading-spinner'); // Oculta el loader de categorías
        categoriesInitialLoadComplete = true; // Marcar categorías como cargadas
        checkAndHideMainLoader(); // Verificar si el loader principal puede ocultarse
    }, (error) => {
        console.error("loadCategories - Error al obtener categorías:", error);
        showMessageBox("Error al cargar las categorías. Por favor, inténtalo de nuevo.");
        hideLoading('categories-loading-spinner'); // Oculta el loader de categorías incluso si hay un error
        categoriesInitialLoadComplete = true; // Marcar categorías como cargadas incluso con error
        checkAndHideMainLoader(); // Verificar si el loader principal puede ocultarse
    });
}

/**
 * @function addCategory
 * @description Añade una nueva categoría a Firestore. Esta función sería utilizada por un panel de administración.
 * @param {string} name - Nombre de la categoría.
 * @param {string} description - Descripción de la categoría.
 * @param {string} imageUrl - URL de la imagen de la categoría (debería provenir de Cloud Storage).
 */
async function addCategory(name, description, imageUrl) {
    if (!db || !userId) {
        showMessageBox("Error: Firebase o usuario no autenticado. No se puede añadir la categoría.");
        return;
    }
    try {
        const newCategoryRef = await addDoc(collection(db, `artifacts/${appId}/public/data/categories`), {
            name: name,
            description: description,
            imageUrl: imageUrl,
            createdAt: new Date()
        });
        console.log("Categoría añadida con ID: ", newCategoryRef.id);
        showMessageBox(`Categoría "${name}" añadida con éxito.`);
    }
    catch (e) {
        console.error("Error al añadir la categoría: ", e);
        showMessageBox("Error al añadir la categoría. Inténtalo de nuevo.");
    }
}

/**
 * @function addProduct
 * @description Añade un nuevo producto a Firestore. Esta función sería utilizada por un panel de administración.
 * @param {string} name - Nombre del producto.
 * @param {number} price - Precio del producto.
 * @param {string} imageUrl - URL de la imagen del producto (debería provenir de Cloud Storage).
 * @param {string} categoryName - Nombre de la categoría a la que pertenece el producto.
 * @param {string} description - Descripción del producto.
 * @param {string} [componentsUrl] - URL opcional a la página de componentes del producto.
 * @param {string} [videoUrl] - URL opcional de un video para el producto (ej. YouTube embed URL o link directo a .mp4).
 */
async function addProduct(name, price, imageUrl, categoryName, description, componentsUrl = null, videoUrl = null) {
    if (!db || !userId) {
        showMessageBox("Error: Firebase o usuario no autenticado. No se puede añadir el producto.");
        return;
    }
    try {
        const newProductRef = await addDoc(collection(db, `artifacts/${appId}/public/data/products`), {
            name: name,
            price: price,
            imageUrl: imageUrl,
            category: categoryName, // Se guarda el nombre de la categoría
            description: description,
            componentsUrl: componentsUrl,
            videoUrl: videoUrl, // ¡Nuevo campo para el link de video!
            createdAt: new Date()
        });
        console.log("Producto añadido con ID: ", newProductRef.id);
        showMessageBox(`Producto "${name}" añadido con éxito.`);
    }
    catch (e) {
        console.error("Error al añadir el producto: ", e);
        showMessageBox("Error al añadir el producto. Inténtalo de nuevo.");
    }
}

/**
 * @function loadAllProducts
 * @description Carga todos los productos desde Firestore y los muestra en el contenedor de productos.
 */
async function loadAllProducts() {
    console.log("loadAllProducts - Iniciando carga de todos los productos.");
    if (!db) {
        console.error("loadAllProducts - Firestore no inicializado. No se pueden cargar productos.");
        productsInitialLoadComplete = true; // Marcar como cargado incluso si Firestore no está listo
        checkAndHideMainLoader();
        return;
    }

    // Si hay un listener de productos activo, lo desuscribimos antes de crear uno nuevo
    try { if (typeof unsubscribeProducts === 'function' || unsubscribeProducts) { unsubscribeProducts(); } } catch(e){ console.warn('loadAllProducts - error al unsubscribe previous listener', e); }
    unsubscribeProducts = null;

    showLoading('products-loading-spinner'); // Muestra el loader de productos
    // Limpiar cache global antes de renderizar lista completa
    productsCache = [];
     const productContainer = document.getElementById("contenedor-productos");
     if (!productContainer) {
         console.warn('loadAllProducts - #contenedor-productos no encontrado en el DOM. Abortando render de productos.');
         hideLoading('products-loading-spinner');
         productsInitialLoadComplete = true;
         checkAndHideMainLoader();
         return;
     }
     productContainer.innerHTML = ''; // Limpia antes de agregar

    try {
        const productsColRef = collection(db, `artifacts/${appId}/public/data/products`);
        // Asignar el unsubscribe devuelto por onSnapshot para poder cancelarlo luego
        unsubscribeProducts = onSnapshot(productsColRef, (snapshot) => {
            console.log("loadAllProducts - onSnapshot recibido. Número de productos:", snapshot.size);
            // productContainer.innerHTML = '';
            productsFullCache = [];
            snapshot.forEach(docSnap=>{
              productsFullCache.push({ id: docSnap.id, ...docSnap.data() });
            });
            // reconstruir productsCache para búsqueda
            productsCache = productsFullCache.map(p=>({ id: p.id, name: (p.name||'').toLowerCase() }));
            applySortAndRender();
        }, (error) => {
            console.error("loadAllProducts - Error al cargar productos:", error);
            showMessageBox("Error al cargar productos. Inténtalo más tarde.");
            hideLoading('products-loading-spinner'); // Oculta el loader de productos incluso si hay un error
            productsInitialLoadComplete = true; // Marcar productos como cargados incluso con error
            checkAndHideMainLoader(); // Verificar si el loader principal puede ocultarse
        });
    } catch (error) {
        console.error("loadAllProducts - Error al configurar listener de productos:", error);
        showMessageBox("Error al cargar productos. Inténtalo más tarde.");
        hideLoading('products-loading-spinner'); // Oculta el loader de productos
        productsInitialLoadComplete = true; // Marcar productos como cargados incluso con error
        checkAndHideMainLoader(); // Verificar si el loader principal puede ocultarse
    }
}

/**
 * @function loadProductsByCategory
 * @description Carga productos filtrados por categoría desde Firestore y los muestra.
 * @param {string} categoryName - El NOMBRE de la categoría para filtrar.
 */
async function loadProductsByCategory(categoryName) {
    console.log("loadProductsByCategory - Iniciando carga de productos por categoría:", categoryName);
    if (!db) {
        console.error("loadProductsByCategory - Firestore no inicializado. No se pueden cargar productos por categoría.");
        return;
    }

    // Si hay un listener de productos activo, lo desuscribimos antes de crear uno nuevo
    try { if (typeof unsubscribeProducts === 'function' || unsubscribeProducts) { unsubscribeProducts(); } } catch(e){ console.warn('loadProductsByCategory - error al unsubscribe previous listener', e); }
    unsubscribeProducts = null;

    showLoading('products-loading-spinner'); // Muestra el loader de productos
    const productContainer = document.getElementById("contenedor-productos");
    productContainer.innerHTML = ''; // Limpia antes de agregar

    try {
        const productsColRef = collection(db, `artifacts/${appId}/public/data/products`);

        // Resolución progresiva: primero intenta con categoryName, luego con category
        let qResolved = query(productsColRef, where("categoryName", "==", categoryName));
        let testSnap = await getDocs(qResolved);
        if (testSnap.empty) {
            console.log("loadProductsByCategory - Sin resultados en categoryName, probando con category legacy.");
            qResolved = query(productsColRef, where("category", "==", categoryName));
            testSnap = await getDocs(qResolved);
        } else {
            console.log("loadProductsByCategory - Usando campo categoryName para el listener.");
        }

        unsubscribeProducts = onSnapshot(qResolved, (snapshot) => {
            console.log("loadProductsByCategory - onSnapshot recibido para categoría. Número de productos:", snapshot.size);
            productsFullCache = [];
            snapshot.forEach(docSnap=>{
              productsFullCache.push({ id: docSnap.id, ...docSnap.data() });
            });
            productsCache = productsFullCache.map(p=>({ id: p.id, name: (p.name||'').toLowerCase() }));
            applySortAndRender();
        }, (error) => {
            console.error("loadProductsByCategory - Error al cargar productos por categoría:", error);
            showMessageBox("Error al cargar productos por categoría. Inténtalo más tarde.");
            hideLoading('products-loading-spinner');
            productsInitialLoadComplete = true;
            checkAndHideMainLoader();
        });
    } catch (error) {
        console.error("loadProductsByCategory - Error al configurar listener de productos por categoría:", error);
        showMessageBox("Error al cargar productos por categoría. Inténtalo más tarde.");
        hideLoading('products-loading-spinner');
        const existingMessageBox = document.querySelector('.message-box-autodismiss');
        if (existingMessageBox) existingMessageBox.remove();
    }
}

/**
 * @function showMessageBox
 * @description Muestra un cuadro de mensaje personalizado en lugar de la alerta del navegador.
 * @param {string} message - El mensaje a mostrar.
 * @param {number} [duration] - Duración en milisegundos para que el mensaje se cierre automáticamente.
 * @returns {HTMLElement} El elemento del messageBox creado.
 */
function showMessageBox(message, duration = null) {
    const messageBox = document.createElement('div');
    messageBox.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[120]'; // Aumentar z-index
    messageBox.innerHTML = `
        <div class="bg-gray-900/90 backdrop-blur-sm p-8 rounded-2xl shadow-xl text-center max-w-sm mx-auto flex flex-col items-center border border-white/20 text-futuristic-ink">
            <p class="text-xl font-semibold mb-4">${message}</p>
            ${duration === null ? '<button onclick="this.parentNode.parentNode.remove()" class="px-5 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 shadow-sm focus:ring-2 focus:ring-brand-500/30 active:translate-y-px btn">Cerrar</button>' : ''}

            ${duration !== null ? '<div class="loader-circle border-t-2 border-b-2 border-brand-1 rounded-full w-8 h-8 animate-spin mt-4"></div>' : ''}

        </div>
    `;
    document.body.appendChild(messageBox);

    if (duration !== null) {
        // Añadir una clase para identificar el messageBox que se autodismisará
        messageBox.classList.add('message-box-autodismiss');
        setTimeout(() => {
            if (messageBox.parentNode) { // Asegurarse de que el elemento todavía existe
                messageBox.remove();
            }
        }, duration);
    }

    return messageBox; // Retorna el elemento para poder manipularlo si es necesario
}

/**
 * @function goToCategory
 * @description Maneja la navegación a una categoría. Si no estás en catalogo.html redirige a /catalogo.html?cat=...
 * Si ya estás en catalogo.html, carga la categoría en la misma página.
 * @param {string} categoryName
 */
function goToCategory(categoryName) {
    const currentPath = window.location.pathname || '';
    const onCatalogPage = currentPath.toLowerCase().includes('/catalogo.html') || currentPath.toLowerCase().endsWith('/catalogo') || currentPath.toLowerCase().includes('/catalogo');

    if (!onCatalogPage) {
        // Redirigir al catálogo con el parámetro de categoría
        const target = `/catalogo.html?cat=${encodeURIComponent(categoryName)}`;
        window.location.href = target;
        return;
    }

    // Si ya estamos en catalogo.html, filtrar aquí sin recargar
    showMessageBox(`Cargando productos de la categoría: ${categoryName}...`, 900);
    loadProductsByCategory(categoryName);
    try { history.pushState({ cat: categoryName }, "", `/catalogo.html?cat=${encodeURIComponent(categoryName)}`); } catch (_) {}
    closeMobileMenu();
    const catalogEl = document.getElementById('catalogo-productos');
    if (catalogEl) catalogEl.scrollIntoView({ behavior: 'smooth' });
}

/* NOTE: openMobileMenu() y closeMobileMenu() se movieron a la sección de "helpers seguros"
   más abajo en el archivo para evitar duplicados y para que consulten el DOM al vuelo.
   Si necesitás modificar la lógica del menú, editá las funciones en la sección de helpers. */

/**
 * @function toggleCategoriesSubmenu
 * @description Alterna la visibilidad del submenú de categorías.
 */
function toggleCategoriesSubmenu() {
    const categoriesSubmenu = document.getElementById('categories-submenu');
    const categoriesToggleIcon = document.getElementById('categories-toggle-icon');
    if (categoriesSubmenu && categoriesToggleIcon) {
        categoriesSubmenu.classList.toggle('hidden');
        categoriesToggleIcon.classList.toggle('fa-chevron-down');
        categoriesToggleIcon.classList.toggle('fa-chevron-up');
    }
}

/**
 * @function closeCategoriesSubmenu
 * @description Cierra el submenú de categorías.
 */
function closeCategoriesSubmenu() {
    const categoriesSubmenu = document.getElementById('categories-submenu');
    const categoriesToggleIcon = document.getElementById('categories-toggle-icon');
    if (categoriesSubmenu && categoriesToggleIcon && !categoriesSubmenu.classList.contains('hidden')) {
        categoriesSubmenu.classList.add('hidden');
        categoriesToggleIcon.classList.remove('fa-chevron-up');
        categoriesToggleIcon.classList.add('fa-chevron-down');
    }
}

/**
 * @function openFullscreenImage
 * @description Abre un modal para mostrar la imagen del producto en pantalla completa.
 * @param {string} imageUrl - La URL de la imagen a mostrar.
 * @param {string} altText - El texto alternativo para la imagen.
 */
window.openFullscreenImage = function(imageUrl, altText) {
    console.log("openFullscreenImage - Llamada. URL:", imageUrl, "Alt:", altText); // Log de la llamada
    const modal = document.getElementById('image-fullscreen-modal');
    const image = document.getElementById('fullscreen-image');

    // **VERIFICACIÓN CRÍTICA**: Asegurarse de que el modal y la imagen existen en el DOM
    if (!modal || !image) {
        console.error("openFullscreenImage - Error: Elementos del modal de zoom no encontrados en el DOM.");
        showMessageBox("No se pudo iniciar el zoom. Por favor, asegúrate de que el modal de imagen esté presente en la página.");
        return; // Salir de la función si los elementos no existen
    }

    // Limpiar cualquier manejador de errores anterior y atributo src para una carga limpia
    image.onerror = null;
    image.src = ''; 
    image.alt = '';

    // Configurar el manejador de errores antes de establecer el src
    image.onerror = function() {
        console.error("openFullscreenImage - Error al cargar la imagen en pantalla completa:", imageUrl);
        image.src = 'https://placehold.co/600x400/FF0000/FFFFFF?text=Error+Carga+Imagen'; // Imagen de fallback
        image.alt = 'Error al cargar la imagen';
        showMessageBox("No se pudo cargar la imagen en pantalla completa. Por favor, inténtalo de nuevo.");
    };

    image.src = imageUrl;
    image.alt = altText;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden'; // Evita el scroll del cuerpo
}

/**
 * @function closeFullscreenImage
 * @description Cierra el modal de imagen en pantalla completa.
 */
window.closeFullscreenImage = function() {
    console.log("closeFullscreenImage - Llamada."); // Log de la llamada
    const modal = document.getElementById('image-fullscreen-modal');
    const image = document.getElementById('fullscreen-image'); // Necesitamos obtener la referencia de la imagen aquí también

    // **VERIFICACIÓN CRÍTICA**: Asegurarse de que el modal y la imagen existen en el DOM
    if (!modal || !image) {
        console.error("closeFullscreenImage - Error: Elementos del modal de zoom no encontrados en el DOM.");
        return; // Salir de la función si los elementos no existen
    }

    modal.classList.remove('open');
    document.body.style.overflow = ''; // Restaura el scroll del cuerpo

    // Limpiar la imagen y su manejador de errores para liberar recursos
    image.src = ''; // Vaciar el src para asegurar una carga limpia la próxima vez
    image.onerror = null;
}

/**
 * @function startCategoryImageAnimation
 * @description Inicia la animación de cambio de imagen para una tarjeta de categoría al pasar el ratón.
 * @param {HTMLElement} cardElement - El elemento de la tarjeta de categoría.
 */
function startCategoryImageAnimation(cardElement) {
    const imgElement = cardElement.querySelector('.category-image-animated');
    if (!imgElement) return;

    const originalImageUrl = cardElement.dataset.originalImage;
    const productImages = JSON.parse(cardElement.dataset.productImages || '[]');

    // Si no hay suficientes imágenes para animar (menos de 2), no hacer nada.
    if (productImages.length <= 1) {
        // Asegurarse de que el intervalo si existía, se limpie y se elimine
        stopCategoryImageAnimation(cardElement);
        return;
    }

    // Limpiar cualquier intervalo existente para esta tarjeta
    stopCategoryImageAnimation(cardElement);

    let currentIndex = productImages.indexOf(imgElement.src);
    if (currentIndex === -1 || currentIndex >= productImages.length - 1) {
        currentIndex = -1; // Si la imagen actual no está en la lista o es la última, empezar desde el principio
    }

    const intervalId = setInterval(() => {
        currentIndex = (currentIndex + 1) % productImages.length;
        // Aplicar un efecto de desvanecimiento sutil
        imgElement.classList.add('fade-out');
        setTimeout(() => {
            imgElement.src = productImages[currentIndex];
            imgElement.classList.remove('fade-out');
            imgElement.classList.add('fade-in');
            setTimeout(() => imgElement.classList.remove('fade-in'), 600);
        }, 300); // 300ms coincide con la duración de la transición CSS
    }, 2000); // Cambiar imagen cada 2 segundos

    categoryAnimationIntervals[cardElement.dataset.categoryName] = intervalId;
}

/**
 * @function stopCategoryImageAnimation
 * @description Detiene la animación de cambio de imagen para una tarjeta de categoría.
 * @param {HTMLElement} cardElement - El elemento de la tarjeta de categoría.
 */
function stopCategoryImageAnimation(cardElement) {
    const categoryName = cardElement.dataset.categoryName;
    if (categoryAnimationIntervals[categoryName]) {
        clearInterval(categoryAnimationIntervals[categoryName]);
        delete categoryAnimationIntervals[categoryName];

        const imgElement = cardElement.querySelector('.category-image-animated');
        if (imgElement) {
            // Revertir la imagen a la original con un desvanecimiento
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


// Lógica para el menú de hamburguesa y submenús
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOMContentLoaded - DOM completamente cargado."); // Log de DOMContentLoaded
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileNav = document.getElementById('mobile-nav');
    const categoriesToggleButton = document.getElementById('categories-toggle-button');
    const closeImageModalButton = document.getElementById('close-image-modal');
    const imageFullscreenModal = document.getElementById('image-fullscreen-modal');


    // Referencias a los enlaces de Catálogo
    const catalogLinkMobile = document.getElementById('catalog-link-mobile');
    const catalogLinkDesktop = document.getElementById('catalog-link-desktop');

    // ** Lógica para el botón de hamburguesa: Alterna abrir/cerrar **
    // Inicialización segura (evita doble inicialización)
    if (window.__menuInit) {
        // ya inicializado
    } else {
        window.__menuInit = true;
        const { btn, nav } = getMobileMenuEls();
        if (btn && nav) {
            let isOpen = false;

            // Conectar la "X" de cierre del panel móvil
            const mobileNavClose = document.getElementById('mobile-nav-close');
            if (mobileNavClose) {
                mobileNavClose.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeMobileMenu();
                    isOpen = false;
                });
            }

            // Toggle del botón hamburguesa (actualiza isOpen)
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isOpen) {
                    closeMobileMenu();
                } else {
                    openMobileMenu();
                }
                isOpen = !isOpen;
            });

            // Cerrar al tocar fuera
            document.body.addEventListener('click', (e) => {
                if (!isOpen) return;
                const { btn: b, nav: n } = getMobileMenuEls();
                if (!n || !b) return;
                if (!n.contains(e.target) && e.target !== b && !b.contains(e.target)) { // Added !b.contains(e.target)
                    closeMobileMenu();
                    isOpen = false;
                }
            });
        } else {
            console.warn('DOMContentLoaded - elementos de menú móvil ausentes; inicialización omitida.');
        }
    }

    // Toggle del submenú de categorías
    // Bind seguro y único para el botón "Categorías" en el menú móvil.
    // Usa toggle de la clase 'hidden' y rotación del icono para animación simple.
    if (categoriesToggleButton) {
        const categoriesIcon = document.getElementById('categories-toggle-icon');
        const categoriesMenu = document.getElementById('categories-submenu');
        if (categoriesMenu && categoriesIcon && !categoriesToggleButton.dataset.toggleInit) {
            categoriesToggleButton.addEventListener('click', (e) => {
                e.stopPropagation();
                categoriesMenu.classList.toggle('hidden');
                categoriesIcon.classList.toggle('rotate-180');
            });
            // marcar como inicializado para evitar binds dobles
            categoriesToggleButton.dataset.toggleInit = '1';
        }
    }

    // Event listener para el enlace "Catálogo" en la navegación móvil
    if (catalogLinkMobile) {
        catalogLinkMobile.addEventListener('click', function(event) {
            event.preventDefault(); // Evitar el comportamiento predeterminado del ancla
            loadAllProducts(); // Cargar todos los productos
            closeMobileMenu(); // Cerrar el menú móvil
            // Desplazar la vista a la sección de productos
            const catalogEl = document.getElementById('catalogo-productos');
            if (catalogEl) catalogEl.scrollIntoView({ behavior: 'smooth' });
        });
    }

    // Event listener para el enlace "Catálogo" en la navegación de escritorio
    if (catalogLinkDesktop) {
        catalogLinkDesktop.addEventListener('click', function(event) {
            event.preventDefault(); // Evitar el comportamiento predeterminado del ancla
            loadAllProducts(); // Cargar todos los productos
            // Desplazar la vista a la sección de productos
            const catalogEl = document.getElementById('catalogo-productos');
            if (catalogEl) catalogEl.scrollIntoView({ behavior: 'smooth' });
        });
    }

    // Cerrar menú y submenús al hacer clic fuera
    // Cerrar solo el submenú de categorías al hacer clic fuera.
    // NOTA: El cierre/abierto del panel móvil se maneja exclusivamente en el init seguro que usa `isOpen`.
    document.body.addEventListener('click', function(event) {
        const categoriesSubmenu = document.getElementById('categories-submenu');
        const categoriesToggleBtn = document.getElementById('categories-toggle-button');
        if (categoriesSubmenu && !categoriesSubmenu.classList.contains('hidden')) {
            const clickedInsideSubmenu = categoriesSubmenu.contains(event.target);
            const clickedToggle = categoriesToggleBtn && categoriesToggleBtn.contains(event.target);
            if (!clickedInsideSubmenu && !clickedToggle) {
                closeCategoriesSubmenu();
            }
        }
    });

    // Cerrar modal de imagen al hacer clic en el botón de cerrar
    if (closeImageModalButton) {
        closeImageModalButton.addEventListener('click', window.closeFullscreenImage); // Usar window.closeFullscreenImage
    }

    // Cerrar modal de imagen al hacer clic fuera de la imagen (en el overlay)
    if (imageFullscreenModal) {
        imageFullscreenModal.addEventListener('click', function(event) {
            if (event.target === imageFullscreenModal) { // Solo si el click es directamente en el overlay
                window.closeFullscreenImage(); // Usar window.closeFullscreenImage
            }
        });
    }

    // Opcional: Cerrar el menú móvil cuando se hace clic en un enlace interno (excepto Categorías)
    // Los enlaces del submenú de categorías ya tienen closeMobileMenu() en su onclick
    if (mobileNav) {
        mobileNav.querySelectorAll('a[href^="#"]').forEach(link => {
         // Asegurarse de que no sea el enlace de "Categorías" que abre el submenú
         if (link.id !== 'categories-toggle-button') {
             link.addEventListener('click', () => {
                 closeMobileMenu();
             });
         }
        });
    }

    // --- Lógica para animaciones de imágenes de categoría (para dispositivos táctiles) ---
    const categoriesContainer = document.getElementById('categories-container');
    if (categoriesContainer) {
        // Para dispositivos táctiles: un toque inicia, otro lo detiene o click fuera
        categoriesContainer.addEventListener('touchstart', (event) => {
            const card = event.target.closest('.category-card');
            if (card) {
                // Detener animaciones de otras tarjetas activas
                for (const key in categoryAnimationIntervals) {
                    if (key !== card.dataset.categoryName) {
                        const otherCard = document.querySelector(`[data-category-name="${key}"]`);
                        if (otherCard) stopCategoryImageAnimation(otherCard);
                    }
                }
                // Alternar animación para la tarjeta tocada
                if (categoryAnimationIntervals[card.dataset.categoryName]) {
                    stopCategoryImageAnimation(card);
                } else {
                    startCategoryImageAnimation(card);
                }
            }
        });

        // Listener global para detener la animación si se hace clic fuera de una tarjeta activa
        document.body.addEventListener('click', (event) => {
            const card = event.target.closest('.category-card');
            if (!card && Object.keys(categoryAnimationIntervals).length > 0) {
                for (const key in categoryAnimationIntervals) {
                    const activeCard = document.querySelector(`[data-category-name="${key}"]`);
                    if (activeCard) stopCategoryImageAnimation(activeCard);
                }
            }
        });
    } else {
        console.warn('DOMContentLoaded - #categories-container ausente; deshabilitando touch animation handlers.');
    }
    // --- Fin de la lógica para animaciones de imágenes de categoría ---

    // Search UI: sugerencias y salto a producto
    /* Reemplazo de la función de búsqueda: parametrizada para desktop + mobile.
       Evita doble bind en el mismo input usando dataset.searchInit. */
    function setupSearch(inputId, listId) {
      const input = document.getElementById(inputId);
      const list  = document.getElementById(listId);
      if (!input || !list) return;
      if (input.dataset.searchInit) return; // ya inicializado
      input.dataset.searchInit = '1';

      const renderSuggestions = (q) => {
        const term = (q || '').trim().toLowerCase();
        if (!term) { list.innerHTML = ''; list.classList.add('hidden'); input.setAttribute('aria-expanded','false'); return; }
        // Busqueda simple: exacto primero, luego parciales
        const exact  = productsCache.filter(p => p.name === term);
        const rest   = productsCache.filter(p => p.name.includes(term) && p.name !== term);
        const matches = [...exact, ...rest].slice(0, 8);

        // Update list classes for dark theme
        list.className = 'absolute mt-1 w-full bg-gray-900 border border-white/20 rounded-xl shadow-md hidden overflow-hidden z-50 text-white';

        list.innerHTML = matches.map(m =>
          `<li role="option" data-id="${m.id}" class="px-3 py-2 cursor-pointer hover:bg-white/10">${m.name}</li>`
        ).join('');
        list.classList.toggle('hidden', matches.length === 0);
        input.setAttribute('aria-expanded', String(matches.length > 0));
      };

      const go = (id) => {
        const el = document.getElementById(`product-${id}`);
        if (el) {
          list.classList.add('hidden');
          input.setAttribute('aria-expanded','false');
          el.scrollIntoView({ behavior:'smooth', block:'start' });
          el.classList.add('ring-2','ring-brand-1'); // Adjusted ring color for dark theme
          setTimeout(()=> el.classList.remove('ring-2','ring-brand-1'), 1500); // Adjusted ring color
          // si el input es mobile, cerramos el menú
          if (inputId === 'search-input-mobile' && typeof closeMobileMenu === 'function') closeMobileMenu();
        } else {
          // reintento breve si aún no está renderizado
          const t = setInterval(()=>{
            const el2 = document.getElementById(`product-${id}`);
            if (el2) { clearInterval(t); go(id); }
          }, 250);
          setTimeout(()=> clearInterval(t), 3000);
        }
      };

      input.addEventListener('input', e => renderSuggestions(e.target.value));

      list.addEventListener('click', e => {
        const li = e.target.closest('li[data-id]');
        if (li) go(li.dataset.id);
      });

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          const first = list.querySelector('li[data-id]');
          if (first) go(first.dataset.id);
        } else if (e.key === 'Escape') {
          list.classList.add('hidden');
          input.setAttribute('aria-expanded','false');
        }
      });

      // Cerrar lista al click fuera (cada setup instala su handler; inputs están protegidos por dataset)
      document.addEventListener('click', (e) => {
        if (!list.contains(e.target) && e.target !== input) {
          list.classList.add('hidden');
          input.setAttribute('aria-expanded','false');
        }
      });

      // Atajo Ctrl/Cmd+K para enfocar el input correspondiente
      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
          // Si el usuario ya está enfocado en un input distinto, preferir desktop input; si mobile, enfocar mobile
          e.preventDefault();
          input.focus();
          input.select();
        }
      });
    }

    // Añadir scroll listener para el header dinámico
    window.addEventListener('scroll', () => {
      const header = document.getElementById('main-header');
      if (header) {
        if (window.scrollY > 50) { // Adjust scroll threshold as needed
          header.classList.add('scrolled');
        } else {
          header.classList.remove('scrolled');
        }
      }
    });

    // Llamar a setupSearch dentro del DOMContentLoaded principal (inicializar desktop + mobile)
    try {
      setupSearch('search-input', 'search-results');                // desktop (si existe)
      setupSearch('search-input-mobile', 'search-results-mobile');  // mobile (nuevo)
    } catch (err) {
      console.warn('setupSearch error', err);
    }

    // Animación del logo al cargar la página
    document.addEventListener('DOMContentLoaded', () => {
      const logoBig = document.querySelector('.logo-big');
      const logoText = document.getElementById('logo-text');
      const logoUnderline = document.getElementById('logo-underline');

      if (logoBig) setTimeout(() => logoBig.classList.add('logo-animate'), 50);
      if (logoText) setTimeout(() => logoText.classList.add('show'), 120);
      if (logoUnderline) setTimeout(() => logoUnderline.classList.add('show'), 380);
    });

    // Mobile search toggle (para la barra de búsqueda que aparece/desaparece)
    const mobileSearchToggle = document.getElementById('mobile-search-toggle');
    const mobileSearchDiv = document.getElementById('mobile-search');
    if (mobileSearchToggle && mobileSearchDiv) {
        mobileSearchToggle.addEventListener('click', () => {
            mobileSearchDiv.classList.toggle('hidden');
        });
    }
});


// Inicializar Firebase cuando el DOM esté completamente cargado
// document.addEventListener('DOMContentLoaded', initFirebase);

// Hacer que las funciones sean accesibles globalmente para eventos onclick en el HTML
window.showMessageBox = showMessageBox;
window.goToCategory = goToCategory;
window.addCategory = addCategory; // Exponer para posibles llamadas desde un futuro panel de administración
window.addProduct = addProduct;   // Exponer para posibles llamadas desde un futuro panel de administración
window.loadAllProducts = loadAllProducts; // Exponer para ser llamada desde los enlaces de catálogo
window.loadProductsByCategory = loadProductsByCategory; // Exponer para ser llamada desde los enlaces de categoría
window.closeMobileMenu = closeMobileMenu; // Exponer para ser llamada desde los enlaces del submenú
window.openMobileMenu = openMobileMenu; // Exponer para ser llamada
window.openFullscreenImage = openFullscreenImage; // Exponer para abrir imágenes en pantalla completa
window.closeFullscreenImage = closeFullscreenImage; // Exponer para cerrar imágenes en pantalla completa
window.startCategoryImageAnimation = startCategoryImageAnimation; // Exponer la función de animación de categoría
window.stopCategoryImageAnimation = stopCategoryImageAnimation;   // Exponer la función de detener animación de categoría

// helpers para menú móvil (reemplazados/ajustados)
function getMobileMenuEls() {
    return {
        btn: document.getElementById('mobile-menu-button'),
        nav: document.getElementById('mobile-nav'),
    };
}

function openMobileMenu() {
    const { nav, btn } = getMobileMenuEls();
    if (!nav || !btn) return;

    // mostrar panel
    nav.classList.remove('hidden', 'translate-x-full');
    nav.classList.add('translate-x-0', 'open');

    // accesibilidad: el panel ya NO está oculto
    nav.removeAttribute('aria-hidden');
    nav.removeAttribute('inert');

    // animación del botón hamburguesa
    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');

    // mover el foco a la "X" para evitar focos perdidos
    const closeBtn = document.getElementById('mobile-nav-close');
    if (closeBtn) closeBtn.focus();
}

function closeMobileMenu() {
    const { nav, btn } = getMobileMenuEls();
    if (!nav || !btn) return;

    // iniciar cierre (slide out)
    nav.classList.remove('translate-x-0', 'open');
    nav.classList.add('translate-x-full');
    setTimeout(() => {
        nav.classList.add('hidden');
    }, 300);

    // accesibilidad: volver a ocultar
    nav.setAttribute('aria-hidden', 'true');
    nav.setAttribute('inert', '');

    // revertir botón hamburguesa
    btn.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');

    // devolver el foco al botón que abrió el panel
    try { btn.focus(); } catch (e) { /* noop */ }

    try { closeCategoriesSubmenu(); } catch (e) { /* noop */ }
}

/* === Product Detail Modal: fetch + rendering + open/close + deep-link === */

// intenta obtener desde productsCache completo (si tu app lo llena con objetos completos)
function getProductByIdLocal(id) {
  if (!window.productsFullCache) return null;
  return window.productsFullCache.find(p => String(p.id) === String(id)) || null;
}

async function getProductByIdFS(id) {
  if (!db) return null;
  try {
    const ref = doc(db, `artifacts/${appId}/public/data/products`, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (e) {
    console.error('getProductByIdFS error', e);
    return null;
  }
}

async function fetchProductById(id) {
  let prod = getProductByIdLocal(id);
  if (prod) return prod;
  prod = await getProductByIdFS(id);
  return prod;
}

/**
 * Cargar y renderizar productos similares por categor
 * @param {string} categoryName - Nombre de la categor a filtrar
 * @param {string} excludeId - ID del producto actual a excluir
 */
async function loadSimilarProducts(categoryName, excludeId) {
  const wrap = document.getElementById('similar-products-container');
  if (!wrap) return;
  if (!categoryName) { wrap.innerHTML = ''; return; }

  wrap.innerHTML = '<p class="col-span-full text-center text-futuristic-mute">Cargando productos similares...</p>';
  try {
    const productsColRef = collection(db, `artifacts/${appId}/public/data/products`);
    let q1 = query(productsColRef, where('categoryName', '==', categoryName), limit(6));
    let snapshot = await getDocs(q1);
    if (snapshot.empty) {
      const q2 = query(productsColRef, where('category', '==', categoryName), limit(6));
      snapshot = await getDocs(q2);
    }

    wrap.innerHTML = '';
    let count = 0;
    snapshot.forEach(docSnap => {
      const id = docSnap.id;
      if (excludeId && id === excludeId) return;
      const p = docSnap.data() || {};
      const name = p.name || p.nombre || 'Producto';
      const imageUrl = (Array.isArray(p.images) && p.images[0])
                    || (Array.isArray(p.imagenes) && p.imagenes[0])
                    || p.imageUrl || p.imagen || 'https://placehold.co/400x300/cccccc/333333?text=Sin+Imagen';
      const price = (p.price !== undefined ? p.price : p.precio);
      const priceHtml = (price !== undefined && price !== null)
        ? `<div class="mt-2"><span class="price-chip"><i class="fa-solid fa-tag text-white/80 text-xs"></i>$${Number(price).toLocaleString('es-AR',{minimumFractionDigits:2, maximumFractionDigits:2})}</span></div>`
        : '';

      const card = document.createElement('div');
      card.className = 'product-card group rounded-2xl flex flex-col cursor-pointer';
      card.dataset.id = id;
      card.innerHTML = `
        <div class="relative aspect-[4/3] overflow-hidden rounded-t-2xl">
          <img src="${imageUrl}" alt="${name}" class="w-full h-full object-cover" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/400x300/cccccc/333333?text=Sin+Imagen';">
        </div>
        <div class="p-3">
          <h4 class="text-sm font-medium text-futuristic-ink line-clamp-2">${name}</h4>
          ${priceHtml}
        </div>`;
      wrap.appendChild(card);
      count++;
    });

    if (count === 0) {
      wrap.innerHTML = '<p class="col-span-full text-center text-futuristic-mute">No hay productos similares.</p>';
    }
  } catch (e) {
    console.error('loadSimilarProducts - Error:', e);
    wrap.innerHTML = '<p class="col-span-full text-center text-futuristic-mute">No se pudieron cargar productos similares.</p>';
  }
}

/* UI references */
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
  add: document.getElementById('pd-add'),
  closeBtn: document.getElementById('pd-close')
};

function currency(n) {
  try { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n); } catch { return n; }
}
function openPD(){ if($pd.overlay){ $pd.overlay.classList.remove('hidden'); $pd.overlay.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; } }
function closePD(){ if($pd.overlay){ $pd.overlay.classList.add('hidden'); $pd.overlay.setAttribute('aria-hidden','true'); document.body.style.overflow=''; clearHashParam(); } }

function setHashParam(id){ const u = new URL(window.location.href); u.searchParams.set('p', id); history.replaceState(null,'',u); }
function clearHashParam(){ const u = new URL(window.location.href); u.searchParams.delete('p'); history.replaceState(null,'',u); }

function renderThumbs(imgs=[]){
  if(!$pd.thumbs) return;
  $pd.thumbs.innerHTML = '';
  imgs.forEach((src,i) => {
    const b = document.createElement('button');
    b.className = 'w-16 h-16 rounded-lg overflow-hidden border border-white/20 bg-white/5 hover:border-brand-1'; // Adjusted classes for dark theme
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
  if (prod.envio24) items.push('<span class="px-2 py-1 rounded-full text-xs bg-emerald-700/30 text-emerald-300">Envío 24/48h</span>'); // Adjusted colors
  if (prod.garantiaMeses) items.push(`<span class="px-2 py-1 rounded-full text-xs bg-indigo-700/30 text-indigo-300">${prod.garantiaMeses}m Garantía</span>`); // Adjusted colors
  if (prod.stock > 0) items.push('<span class="px-2 py-1 rounded-full text-xs bg-blue-700/30 text-blue-300">Stock disponible</span>'); // Adjusted colors
  $pd.badges.innerHTML = items.join(' ');
}

function activateTab(tab){
  document.querySelectorAll('.pd-tab').forEach(b => {
      if (b.dataset.tab === tab) {
          b.dataset.active = 'true';
          b.classList.add('text-brand-1', 'border-b-2', 'border-brand-1'); // Active tab style
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

function renderProductDetail(prod){
  if(!$pd.title) return;
  $pd.title.textContent = prod.nombre || prod.title || prod.name || 'Producto';
  $pd.price.textContent = prod.precio ?? prod.price ?? 'Consultar';
  $pd.id.textContent = prod.id || '—';
  $pd.stock.textContent = (prod.stock ?? '—');

  $pd.paneDesc.innerHTML = prod.descripcionLarga || prod.descripcion || prod.description || 'Sin descripción.';

  // --- MOD INICIO: soporte specs/specifications/especificaciones (objeto | array {key,value} | string) ---
  (function renderSpecs(){
    let source = prod.specs ?? prod.specifications ?? prod.especificaciones;
    let html = '—';

    if (source && typeof source === 'object') {
      if (Array.isArray(source)) {
        const items = source
          .filter(it => it && typeof it === 'object')
          .map(it => {
            const k = it.key ?? it.clave ?? it.nombre ?? it.name;
            const v = it.value ?? it.valor ?? it.val;
            if (k != null && v != null) {
              return `<li><strong>${String(k)}:</strong> ${String(v)}</li>`;
            }
            return null;
          })
          .filter(Boolean);
        if (items.length) {
          html = `<ul class="list-disc pl-5">${items.join('')}</ul>`;
        }
      } else {
        const entries = Object.entries(source)
          .filter(([k,v]) => k && v !== undefined && v !== null);
        if (entries.length) {
          html = `<ul class="list-disc pl-5">${entries
            .map(([k,v])=>`<li><strong>${k}:</strong> ${v}</li>`).join('')}</ul>`;
        }
      }
    } else if (typeof source === 'string') {
      const txt = source.trim();
      if (txt) html = txt;
    }

    $pd.paneSpecs.innerHTML = html;
  })();
  // --- MOD FIN ---

  // CAMBIO: normalizar garantía con prioridades garantia > warranty > garantiaTexto > garantiaMeses
  function normalizeWarranty(p){
    const candidates = [
      p.garantia,
      p.warranty,
      p.garantiaTexto,
      p.garantiaMeses
    ];
    for (let raw of candidates){
      if (raw === undefined || raw === null) continue;
      // Número directo
      if (typeof raw === 'number' && !isNaN(raw) && raw > 0) {
        return `${raw} meses de garantía.`;
      }
      // String
      if (typeof raw === 'string') {
        const txt = raw.trim();
        if (!txt) continue;
        if (/^\d+$/.test(txt)) {
          return `${parseInt(txt,10)} meses de garantía.`;
        }
        return txt; // texto libre
      }
    }
    return null;
  }
  $pd.paneWarranty.innerHTML = normalizeWarranty(prod) || 'Consultar garantía.';

  // --- FIX: reemplaza Array.isClassName por lógica robusta ---
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

  // Cargar productos similares segn su categora
  try {
    const catName = prod.categoryName || prod.category || prod.categoria || prod.categoriaNombre;
    const excludeId = prod.id;
    loadSimilarProducts(catName, excludeId);
  } catch(_) { /* noop */ }
}

/* Delegación: abrir modal al clickear .product-card (usa data-id o id product-*) */
document.addEventListener('click', async (e) => {
  const card = e.target.closest('.product-card');
  if(!card) return;
  // evitar abrir modal si click fue en un enlace interno (ej. botones componentes)
  if (e.target.closest('a')) return;
  const id = card.dataset.id || (card.id && card.id.startsWith('product-') ? card.id.replace(/^product-/, '') : null);
  if(!id) return;
  const prod = await fetchProductById(id);
  if(!prod) { showMessageBox('No se encontró el producto.'); return; }
  renderProductDetail(prod);
  openPD();
  setHashParam(id);
});

/* Cerrar modal (backdrop, botón, ESC) */
document.addEventListener('click', (e) => {
  if(e.target.matches('[data-close]') || e.target.id === 'pd-overlay') closePD();
});
if($pd.closeBtn) $pd.closeBtn.addEventListener('click', closePD);
document.addEventListener('keydown', (e) => { if(e.key === 'Escape') closePD(); });

/* Tabs */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.pd-tab');
  if(!btn) return;
  activateTab(btn.dataset.tab);
});

/* Deep-link: ?p=ID abre el modal directo */
(function openFromURL(){
  try {
    const u = new URL(window.location.href);
    const id = u.searchParams.get('p');
    if(!id) return;
    fetchProductById(id).then(prod => {
      if(!prod) return;
      renderProductDetail(prod);
      openPD();
    });
  } catch(e){ /* noop */ }
})();

// Auto-aplicar filtro en catalogo.html si viene ?cat=Nombre
(function applyCatQueryIfPresent() {
  try {
    const u = new URL(window.location.href);
       const cat = u.searchParams.get('cat');
    if (!cat) return;
    const path = (window.location.pathname || '').toLowerCase();
    if (path.includes('catalogo.html') || path.includes('/catalogo')) {
      // esperar a que firebase y listeners estén listos (retry)
      const attempt = () => {
        if (typeof loadProductsByCategory === 'function') {
          loadProductsByCategory(cat);
        } else {
          setTimeout(attempt, 300);
        }
      };
      attempt();
    }
  } catch (e) { /* noop */ }
})();
// Manejar navegación con botón "Atrás" para alternar entre catálogo general y por categoría
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
      await loadProductsByCategoryApi(cat);
    } else {
      if (categoriesSectionEl) categoriesSectionEl.style.display = '';
      if (categoriesContainerEl) categoriesContainerEl.style.display = '';
      if (titleEl) titleEl.textContent = 'Todos Nuestros Productos';
      await loadCategoriesApi();
      await loadAllProductsApi();
    }
  } catch (_) { /* noop */ }
});
/* === end product detail modal logic === */

/* === SORT + RENDER (añadido) === */
function applySortAndRender() {
  const container = document.getElementById('contenedor-productos');
  if (!container) return;
  const activeFiltered = (typeof window !== 'undefined') ? (window.__filteredList || null) : null;
  let list = [...(activeFiltered && Array.isArray(activeFiltered) ? activeFiltered : productsFullCache)];

  const getTS = v => {
    if(!v) return 0;
    if (typeof v.seconds === 'number') return v.seconds * 1000 + (v.nanoseconds||0)/1e6;
    if (v instanceof Date) return v.getTime();
    return 0;
  };

  list.sort((a,b)=>{
    if (currentSort === 'recent') return getTS(b.createdAt) - getTS(a.createdAt);
    if (currentSort === 'old')    return getTS(a.createdAt) - getTS(b.createdAt);
    if (currentSort === 'az')     return (a.name||'').localeCompare(b.name||'', 'es', {sensitivity:'base'});
    if (currentSort === 'za')     return (b.name||'').localeCompare(a.name||'', 'es', {sensitivity:'base'});
    return 0;
  });

  container.innerHTML = '';
  if (!list.length) {
    container.innerHTML = '<p class="col-span-full text-center text-futuristic-mute">No hay productos disponibles.</p>';
  } else {
    list.forEach(p => {
      const {
        id,
        name = 'Producto',
        price,
        imageUrl,
        description = '',
        componentsUrl,
        videoUrl,
        category,
        categoryName
      } = p;

      const catLabel = categoryName || category; // <--- compat legacy + nuevo

      let mediaHtml = '';
      if (videoUrl && typeof videoUrl === 'string') {
        const yt = videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([\w-]{11})/);
        if (yt && yt[1]) {
          mediaHtml = `<div class="media-frame aspect-[4/3]">
              <iframe class="absolute inset-0 w-full h-full rounded-t-2xl"
                      src="https://www.youtube.com/embed/${yt[1]}?autoplay=0&mute=1&rel=0"
                      loading="lazy" allowfullscreen></iframe>
            </div>`;
        }
      }
      if (!mediaHtml) {
        mediaHtml = `
          <div class="media-frame relative aspect-[4/3] overflow-hidden rounded-t-2xl">
            ${catLabel ? `<span class="cat-badge">${catLabel}</span>` : ''}
            <img loading="lazy" decoding="async"
                 src="${imageUrl || 'https://placehold.co/600x400/cccccc/333333?text=Sin+Imagen'}"
                 alt="${name}"
                 class="w-full h-full object-cover"
                 onerror="this.onerror=null;this.src='https://placehold.co/600x400/cccccc/333333?text=Sin+Imagen';">
          </div>`;
      }

      const priceHtml = price != null
        ? `<div class="mt-3"><span class="price-chip"><i class="fa-solid fa-tag text-white/80 text-xs"></i>$${Number(price).toLocaleString('es-AR',{minimumFractionDigits:2, maximumFractionDigits:2})}</span></div>`
        : `<p class="text-futuristic-mute italic mt-3 text-sm">Consultar</p>`; // Adjusted color

      const componentsBtn = componentsUrl ? `
        <a href="${componentsUrl}" target="_blank" rel="noopener noreferrer"
           class="mt-4 px-4 py-2 rounded-xl bg-white/5 text-brand-1 text-xs font-medium hover:bg-white/10 transition flex items-center justify-center gap-2 components-btn">
          <i class="fas fa-microchip text-brand-1/70"></i> Componentes
        </a>` : ''; // Adjusted colors

      const card = document.createElement('div');
      card.id = `product-${id}`;
      card.dataset.id = id;
      card.dataset.reveal = '1';
      card.className = "product-card group rounded-2xl flex flex-col";
      card.innerHTML = `
        ${mediaHtml}
        <div class="p-4 flex flex-col flex-grow">
          <h3 class="text-[15px] leading-snug line-clamp-2 text-futuristic-ink">${name}</h3>
          <p class="text-futuristic-mute text-xs mt-1 flex-grow line-clamp-3">${description}</p>
          ${priceHtml}
          ${componentsBtn}
        </div>
      `;
      container.appendChild(card);
    });
  }

  hideLoading('products-loading-spinner');
  productsInitialLoadComplete = true;
  checkAndHideMainLoader();
  enhanceProductCardsForReveal();
}

// Intersection reveal
function enhanceProductCardsForReveal() {
  const cards = document.querySelectorAll('.product-card[data-reveal]');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('reveal-show');
        obs.unobserve(en.target);
      }
    });
  }, { threshold:0.15 });
  cards.forEach(c => {
    if (!c.dataset.revealInit) {
      c.dataset.revealInit = '1';
      obs.observe(c);
    }
  });
}

// Init sort select (si no estaba)
document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('product-sort');
  if (sel && !sel.dataset.sortInit) {
    sel.dataset.sortInit = '1';
    sel.addEventListener('change', e => {
      currentSort = e.target.value;
      applySortAndRender();
    });
  }
  // Permitir Enter para aplicar filtro de precio
  const minI = document.getElementById('min-price');
  const maxI = document.getElementById('max-price');
  [minI, maxI].forEach(inp => {
    if (inp && !inp.dataset.bindEnter) {
      inp.dataset.bindEnter = '1';
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { if (typeof window.applyPriceFilter === 'function') window.applyPriceFilter(); } });
    }
  });
});

// Filtro por rango de precio (sobre el conjunto cargado actual)
function applyPriceFilter() {
  const minEl = document.getElementById('min-price');
  const maxEl = document.getElementById('max-price');
  const min = minEl ? parseFloat(minEl.value) : NaN;
  const max = maxEl ? parseFloat(maxEl.value) : NaN;
  const minV = isNaN(min) ? 0 : min;
  const maxV = isNaN(max) ? Infinity : max;

  try { console.log(`Filtrando por rango de precio: ${minV} - ${maxV}`); } catch(_){}

  if (minV === 0 && maxV === Infinity) {
    // limpiar filtro
    if (typeof window !== 'undefined') window.__filteredList = null;
    applySortAndRender();
    return;
  }

  const filtered = (productsFullCache || []).filter(p => {
    const priceNum = Number(p.price ?? p.precio);
    const val = isFinite(priceNum) ? priceNum : 0;
    return val >= minV && val <= maxV;
  });

  if (typeof window !== 'undefined') window.__filteredList = filtered;
  applySortAndRender();
}

// Exponer para onclick en HTML (script type=module)
if (typeof window !== 'undefined') {
  window.applyPriceFilter = applyPriceFilter;
}

// =====================
// Capa fetch → API backend
// =====================
async function fetchJson(url, opts = {}) {
  const resp = await fetch(url, opts);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const ct = resp.headers.get('content-type') || '';
  return ct.includes('application/json') ? resp.json() : null;
}

async function loadCategoriesApi() {
  try {
    showLoading('categories-loading-spinner');
    const rows = await fetchJson(`${API_BASE}/categorias`);
    const categoriesContainer = document.getElementById('categories-container');
    const categoriesSubmenu = document.getElementById('categories-submenu');
    if (categoriesContainer) categoriesContainer.innerHTML = '';
    if (categoriesSubmenu) categoriesSubmenu.innerHTML = '';

    (rows || []).forEach((cat) => {
      const name = cat.name || '';
      const img = cat.image_url || cat.image_file_path || '';

      if (categoriesContainer) {
        const card = document.createElement('div');
        card.className = 'category-card rounded-xl overflow-hidden shadow-md bg-white/5 border border-white/10';
        card.dataset.categoryName = name;
        card.dataset.originalImage = img;
        card.innerHTML = `
          <a href="catalogo.html?cat=${encodeURIComponent(name)}" class="block">
            <img src="${img}" alt="${name}" class="w-full h-40 object-cover category-image-animated" onerror="this.onerror=null;this.src='https://placehold.co/600x300/cccccc/333333?text=Categoria'">
            <div class="p-3 text-center text-white/90 font-semibold">${name}</div>
          </a>`;
        categoriesContainer.appendChild(card);
      }

      if (categoriesSubmenu) {
        const li = document.createElement('li');
        li.innerHTML = `<a data-cat="${name}" href="catalogo.html?cat=${encodeURIComponent(name)}" class="text-white/90 hover:text-white">${name}</a>`;
        categoriesSubmenu.appendChild(li);
      }
    });
  } catch (e) {
    console.error('loadCategoriesApi error', e);
  } finally {
    hideLoading('categories-loading-spinner');
    categoriesInitialLoadComplete = true;
    checkAndHideMainLoader();
  }
}

function mapApiProduct(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    price: row.price,
    imageUrl: row.image_url || row.image_file_path || '',
    categoryName: row.category_name,
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
    stock: row.stock_quantity,
    specifications: row.specifications
  };
}

async function loadAllProductsApi() {
  try {
    showLoading('products-loading-spinner');
    const rows = await fetchJson(`${API_BASE}/productos`);
    productsFullCache = (rows || []).map(mapApiProduct);
    productsCache = productsFullCache.map(p => ({ id: p.id, name: (p.name || '').toLowerCase() }));
    applySortAndRender();
  } catch (e) {
    console.error('loadAllProductsApi error', e);
  } finally {
    hideLoading('products-loading-spinner');
    productsInitialLoadComplete = true;
    checkAndHideMainLoader();
  }
}

async function loadProductsByCategoryApi(categoryName) {
  try {
    showLoading('products-loading-spinner');
    const rows = await fetchJson(`${API_BASE}/productos`);
    const mapped = (rows || []).map(mapApiProduct);
    const filtered = mapped.filter(p => (p.categoryName || '').toLowerCase() === String(categoryName || '').toLowerCase());
    if (typeof window !== 'undefined') window.__filteredList = filtered;
    productsFullCache = mapped;
    productsCache = mapped.map(p => ({ id: p.id, name: (p.name || '').toLowerCase() }));
    applySortAndRender();
  } catch (e) {
    console.error('loadProductsByCategoryApi error', e);
  } finally {
    hideLoading('products-loading-spinner');
    productsInitialLoadComplete = true;
    categoriesInitialLoadComplete = true;
    checkAndHideMainLoader();
  }
}
