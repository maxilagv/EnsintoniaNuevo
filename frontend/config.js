// Configuración global del frontend para la API del backend
// Prioriza window.__API_BASE si está definido en el HTML.
// Por defecto en desarrollo usa localhost:3000 (backend Express).

// Permite inyectar en HTML: <script>window.__API_BASE = 'https://mi-backend/api';</script>
const detected = (typeof window !== 'undefined' && window.__API_BASE)
  ? String(window.__API_BASE).replace(/\/$/, '')
  : '';

// Nota: evitamos same-origin automático para no apuntar a servidores estáticos
// (ej. 127.0.0.1:5500). Usa __API_BASE o localhost:3000 por defecto.
export const API_BASE = "https://ensintonianuevo-4f5p.onrender.com/api";


