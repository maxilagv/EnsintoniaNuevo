// Importar módulos de Firebase
import { auth } from './firebaseconfig.js'; // Firebase queda para compatibilidad, pero no se usa para login
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { db } from './firebaseconfig.js';
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Resolución de appId compartido y helpers de rol
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

async function getUserRole(uid) {
    try {
        const ref = doc(db, `artifacts/${appId}/private/adminUsers/${uid}`);
        const snap = await getDoc(ref);
        if (snap.exists()) {
            const data = snap.data();
            return (data.role || '').toString();
        }
    } catch (e) {
        console.warn('No se pudo leer el rol del usuario:', e);
    }
    return '';
}

function pageForRole(role) {
    switch ((role || '').toLowerCase()) {
        case 'categories':
        case 'categorias':
            return 'admin_categorias.html';
        case 'products':
        case 'productos':
            return 'admin_productos.html';
        case 'stock':
            return 'admin_stock.html';
        case 'full':
        default:
            return 'admin.html';
    }
}

// Función para mostrar una caja de mensaje personalizada
function showMessageBox(message, type = 'info') {
    const existingMessageBox = document.querySelector('.message-box-overlay');
    if (existingMessageBox) {
        existingMessageBox.remove();
    }

    const messageBox = document.createElement('div');
    messageBox.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 message-box-overlay'; // Añadir clase de overlay
    
    const content = document.createElement('div');
    content.className = 'bg-white p-8 rounded-lg shadow-xl text-center max-w-sm mx-auto message-box-content'; // Añadir clase de contenido

    content.innerHTML = `
        <p class="text-xl font-semibold text-gray-800 mb-4">${message}</p>
        <button onclick="this.parentNode.parentNode.remove()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-md transition duration-300">Cerrar</button>
    `;

    // Aplicar animaciones después de que el contenido esté en el DOM virtual
    if (type === 'success') {
        content.classList.add('animate-bounce');
    } else if (type === 'error') {
        content.classList.add('animate-shake');
    }

    messageBox.appendChild(content); // Añadir el contenido a la caja de mensaje
    document.body.appendChild(messageBox); // Añadir la caja de mensaje al cuerpo

    setTimeout(() => {
        messageBox.classList.add('show'); // Activar la transición de opacidad
    }, 10);
}

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const buttonText = document.getElementById('buttonText');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const feedbackMessage = document.getElementById('feedbackMessage');
    const loginContainer = document.querySelector('.login-container');

    console.log("Login del panel usando API del servidor (JWT)");

    const API_BASE = localStorage.getItem('API_BASE') || 'http://localhost:3000/api';

    // Forzar autenticación: si entras a login.html, se limpia cualquier sesión previa
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('loggedIn');

    onAuthStateChanged(auth, async (user) => {
        if (user && localStorage.getItem('loggedIn') === 'true') {
            // AHORA, cualquier usuario logueado se considera admin para el panel.
            const isAdmin = true; 

            if (isAdmin) {
                console.log("Usuario ya autenticado. Redirigiendo a admin.html...");
                {
                    const role = await getUserRole(user.uid);
                    const target = pageForRole(role);
                    window.location.href = target;
                }
            } else {
                console.log("Usuario autenticado pero no es admin. Esto no debería pasar con la nueva lógica.");
                // Esto podría ser un fallback si la lógica en admin.js es diferente o si localStorage está mal.
                showMessageBox("No tienes permisos para acceder al panel de administración.", 'error');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1500);
            }
        }
    });

    if (loginForm) {
        console.log("Formulario de login encontrado en el DOM.");
    } else {
        console.error("ERROR: No se encontró el formulario de login con ID 'loginForm'.");
        return;
    }

    loginForm.addEventListener('submit', async function(event) {
        console.log("Evento de submit del formulario disparado.");

        event.preventDefault();

        feedbackMessage.classList.remove('show', 'success', 'error', 'animate-shake', 'animate-bounce');
        feedbackMessage.textContent = '';

        buttonText.classList.add('hidden');
        loadingIndicator.classList.remove('hidden');

        const email = usernameInput.value;
        const password = passwordInput.value;

        try {
            const resp = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
            const data = await resp.json();
            const { accessToken, refreshToken } = data || {};
            if (!accessToken) throw new Error('Sin token');

            // Guardar tokens y marcar sesión
            localStorage.setItem('accessToken', accessToken);
            if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
            localStorage.setItem('loggedIn', 'true');

            feedbackMessage.textContent = 'Acceso Exitoso';
            feedbackMessage.classList.add('show', 'success', 'animate-bounce');
            showMessageBox('¡Bienvenido, acceso exitoso!', 'success');

            setTimeout(() => { window.location.href = 'admin.html'; }, 900);
        } catch (error) {
            console.error('Error de login con API:', error.message);

            feedbackMessage.textContent = 'Acceso Denegado';
            feedbackMessage.classList.add('show', 'error', 'animate-shake');
            showMessageBox('Credenciales incorrectas. Verifica tu email y contraseña.', 'error');

            loginContainer.classList.add('animate-shake');
            loginContainer.addEventListener('animationend', () => {
                loginContainer.classList.remove('animate-shake');
            }, { once: true });
        } finally {
            buttonText.classList.remove('hidden');
            loadingIndicator.classList.add('hidden');
        }
    });


    // --- Lógica para la animación de fondo con cables ---
    const canvas = document.getElementById('backgroundCanvas');
    const ctx = canvas.getContext('2d');
    let mouse = { x: 0, y: 0 };
    let cables = [];
    const NUM_CABLES = 30;
    const CABLE_LENGTH = 150;
    const SEGMENTS_PER_CABLE = 5;
    const MOUSE_REPEL_RADIUS = 100;
    const MOUSE_REPEL_STRENGTH = 0.8;

    if (canvas && ctx) {
        console.log("Canvas para animación de fondo inicializado.");
    } else {
        console.error("No se pudo obtener el canvas o su contexto para la animación de fondo.");
    }


    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        initCables();
        console.log("Canvas redimensionado y cables reiniciados.");
    }

    function initCables() {
        cables = [];
        for (let i = 0; i < NUM_CABLES; i++) {
            let cable = [];
            let startX = Math.random() * canvas.width;
            let startY = Math.random() * canvas.height;
            for (let j = 0; j < SEGMENTS_PER_CABLE; j++) {
                cable.push({
                    x: startX + (Math.random() - 0.5) * 50,
                    y: startY + (Math.random() - 0.5) * 50,
                    vx: 0,
                    vy: 0,
                    originalX: startX + (Math.random() - 0.5) * 50,
                    originalY: startY + (Math.random() - 0.5) * 50
                });
            }
            cables.push(cable);
        }
    }

    function drawCables() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.5)';

        cables.forEach(cable => {
            ctx.beginPath();
            ctx.moveTo(cable[0].x, cable[0].y);
            for (let i = 1; i < cable.length; i++) {
                ctx.lineTo(cable[i].x, cable[i].y);
            }
            ctx.stroke();

            ctx.fillStyle = 'rgba(14, 165, 233, 0.8)';
            cable.forEach(point => {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
                ctx.fill();
            });
        });
    }

    function updateCables() {
        cables.forEach(cable => {
            for (let i = 0; i < cable.length; i++) {
                let point = cable[i];

                let dx_orig = point.originalX - point.x;
                let dy_orig = point.originalY - point.y;
                point.vx += dx_orig * 0.01;
                point.vy += dy_orig * 0.01;

                let dx_mouse = point.x - mouse.x;
                let dy_mouse = point.y - mouse.y;
                let dist_mouse = Math.sqrt(dx_mouse * dx_mouse + dy_mouse * dy_mouse);

                if (dist_mouse < MOUSE_REPEL_RADIUS) {
                    let repelForce = (MOUSE_REPEL_RADIUS - dist_mouse) / MOUSE_REPEL_RADIUS * MOUSE_REPEL_STRENGTH;
                    point.vx += (dx_mouse / dist_mouse) * repelForce;
                    point.vy += (dy_mouse / dist_mouse) * repelForce;
                }

                point.vx += (Math.random() - 0.5) * 0.1;
                point.vy += (Math.random() - 0.5) * 0.1;

                point.vx *= 0.95;
                point.vy *= 0.95;

                point.x += point.vx;
                point.y += point.vy;

                point.x = Math.max(0, Math.min(canvas.width, point.x));
                point.y = Math.max(0, Math.min(canvas.height, point.y));
            }
        });
    }

    function animate() {
        updateCables();
        drawCables();
        requestAnimationFrame(animate);
    }

    canvas.addEventListener('mousemove', function(e) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });

    window.addEventListener('resize', resizeCanvas);

    resizeCanvas();
    animate();
});
