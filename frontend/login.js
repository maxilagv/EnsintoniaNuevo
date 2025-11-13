import { API_BASE } from './config.js';

/* ==========================================================
   Función visual para mostrar mensajes (éxito / error)
========================================================== */
function showMessageBox(message, type = 'info') {
  const existingMessageBox = document.querySelector('.message-box-overlay');
  if (existingMessageBox) existingMessageBox.remove();

  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 message-box-overlay';

  const content = document.createElement('div');
  content.className = 'bg-white p-8 rounded-lg shadow-xl text-center max-w-sm mx-auto message-box-content';

  content.innerHTML = `
    <p class="text-xl font-semibold text-gray-800 mb-4">${message}</p>
    <button onclick="this.parentNode.parentNode.remove()" 
      class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-md transition duration-300">
      Cerrar
    </button>
  `;

  if (type === 'success') content.classList.add('animate-bounce');
  if (type === 'error') content.classList.add('animate-shake');

  overlay.appendChild(content);
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 10);
}

/* ==========================================================
   Redirección automática si ya hay sesión activa
========================================================== */
try {
  if (localStorage.getItem('accessToken') && localStorage.getItem('loggedIn') === 'true') {
    window.location.href = 'admin.html';
  }
} catch (_) {
  console.warn('No se pudo verificar sesión previa');
}

/* ==========================================================
   Lógica principal de login con backend
========================================================== */
document.addEventListener('DOMContentLoaded', () => {
  console.log("Usando autenticación del backend propio (API_BASE):", API_BASE);

  const form = document.getElementById('loginForm');
  if (!form) {
    console.error("No se encontró el formulario de login (#loginForm).");
    return;
  }

  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const feedbackMessage = document.getElementById('feedbackMessage');
  const loginContainer = document.querySelector('.login-container');
  const buttonText = document.getElementById('buttonText');
  const loadingIndicator = document.getElementById('loadingIndicator');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();

    const email = (usernameInput?.value || '').trim();
    const password = (passwordInput?.value || '').trim();

    if (!email || !password) {
      showMessageBox('Por favor, completa ambos campos.', 'error');
      return;
    }

    try {
      buttonText?.classList.add('hidden');
      loadingIndicator?.classList.remove('hidden');

      // Intentar primero login de usuarios desde DB y fallback a admin por .env
      let resp = await fetch(`${API_BASE}/login-db`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!resp.ok) {
        // Fallback a login admin
        resp = await fetch(`${API_BASE}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        if (!resp.ok) throw new Error(`Error HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const { accessToken, refreshToken, user } = data || {};

      if (!accessToken || !refreshToken) throw new Error('Respuesta inválida del servidor');

      localStorage.setItem('loggedIn', 'true');
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      if (user) localStorage.setItem('userData', JSON.stringify(user));

      // Mensaje visual de éxito
      feedbackMessage.textContent = 'Acceso Exitoso';
      feedbackMessage.classList.add('show', 'success', 'animate-bounce');
      showMessageBox('¡Bienvenido! Acceso exitoso.', 'success');

      setTimeout(() => window.location.href = 'admin.html', 1000);

    } catch (err) {
      console.error('Login error:', err);
      feedbackMessage.textContent = 'Acceso Denegado';
      feedbackMessage.classList.add('show', 'error', 'animate-shake');
      showMessageBox('Usuario o contraseña incorrectos.', 'error');
      loginContainer?.classList.add('animate-shake');
      loginContainer?.addEventListener('animationend', () =>
        loginContainer.classList.remove('animate-shake'), { once: true });
    } finally {
      buttonText?.classList.remove('hidden');
      loadingIndicator?.classList.add('hidden');
    }
  });
});

/* ==========================================================
   Animación de fondo (cables dinámicos futuristas)
========================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('backgroundCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let mouse = { x: 0, y: 0 };
  let cables = [];
  const NUM_CABLES = 30;
  const SEGMENTS_PER_CABLE = 5;
  const MOUSE_REPEL_RADIUS = 100;
  const MOUSE_REPEL_STRENGTH = 0.8;

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initCables();
  }

  function initCables() {
    cables = [];
    for (let i = 0; i < NUM_CABLES; i++) {
      let cable = [];
      const startX = Math.random() * canvas.width;
      const startY = Math.random() * canvas.height;
      for (let j = 0; j < SEGMENTS_PER_CABLE; j++) {
        cable.push({
          x: startX + (Math.random() - 0.5) * 50,
          y: startY + (Math.random() - 0.5) * 50,
          vx: 0, vy: 0,
          originalX: startX,
          originalY: startY
        });
      }
      cables.push(cable);
    }
  }

  function drawCables() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(14,165,233,0.5)';
    ctx.fillStyle = 'rgba(14,165,233,0.8)';

    cables.forEach(cable => {
      ctx.beginPath();
      ctx.moveTo(cable[0].x, cable[0].y);
      for (let i = 1; i < cable.length; i++) ctx.lineTo(cable[i].x, cable[i].y);
      ctx.stroke();
      cable.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }

  function updateCables() {
    cables.forEach(cable => {
      for (let i = 0; i < cable.length; i++) {
        const p = cable[i];
        const dxO = p.originalX - p.x;
        const dyO = p.originalY - p.y;
        p.vx += dxO * 0.01;
        p.vy += dyO * 0.01;

        const dxM = p.x - mouse.x;
        const dyM = p.y - mouse.y;
        const dist = Math.sqrt(dxM * dxM + dyM * dyM);
        if (dist < MOUSE_REPEL_RADIUS) {
          const force = (MOUSE_REPEL_RADIUS - dist) / MOUSE_REPEL_RADIUS * MOUSE_REPEL_STRENGTH;
          p.vx += (dxM / dist) * force;
          p.vy += (dyM / dist) * force;
        }

        p.vx *= 0.95;
        p.vy *= 0.95;
        p.x += p.vx;
        p.y += p.vy;
      }
    });
  }

  function animate() {
    updateCables();
    drawCables();
    requestAnimationFrame(animate);
  }

  canvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener('resize', resizeCanvas);

  resizeCanvas();
  animate();
});
