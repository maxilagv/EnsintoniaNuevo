// Configuración global del frontend para la API del backend
// Comportamiento:
//  - Si se está ejecutando en localhost (desarrollo), usa http://localhost:3000/api
//  - En otros orígenes:
//      * si window.__API_BASE está definido en el HTML, lo usa como base
//      * en caso contrario, usa el backend de Render: https://ensintonianuevo-4f5p.onrender.com/api

let base = '';

if (typeof window !== 'undefined') {
  const host = String((window.location && window.location.hostname) || '').toLowerCase();

  // Entorno local: siempre hablar con backend en localhost:3000
  if (host === 'localhost' || host === '127.0.0.1') {
    base = 'http://localhost:3000/api';
  } else if (window.__API_BASE) {
    // Producción u otros entornos: usar __API_BASE si está definido
    base = String(window.__API_BASE).replace(/\/$/, '');
  } else {
    // Fallback de producción: backend Render
    base = 'https://ensintonianuevo-4f5p.onrender.com/api';
  }
}

// Fallback final (por si window no existe)
export const API_BASE = base || 'https://ensintonianuevo-4f5p.onrender.com/api';

