// Remito download override: ensure remitos are downloaded, not opened in a new tab
// This module intercepts clicks before admin.js handlers and performs a direct download.
// It also works for the injected .view-remito button in delivered orders.

import { API_BASE } from './config.js';

function getAccessToken() {
  try { return localStorage.getItem('accessToken') || ''; } catch { return ''; }
}

async function downloadPdfWithAuth(url, filename) {
  const token = getAccessToken();
  const headers = new Headers();
  headers.set('Accept', 'application/pdf');
  if (token) headers.set('Authorization', 'Bearer ' + token);
  const resp = await fetch(url, { credentials: 'include', headers });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const blob = await resp.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = filename || 'remito.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
}

function getOrderIdFromContainer(node) {
  if (!node) return null;
  // look for sibling mark-delivered button with data-order-id
  const delivered = node.parentElement ? (node.parentElement.querySelector('.mark-delivered')) : null;
  if (delivered && delivered.getAttribute) {
    const id = delivered.getAttribute('data-order-id');
    if (id) return id;
  }
  return null;
}

document.addEventListener('click', async (e) => {
  try {
    const target = e.target;
    // Case 1: anchor to remito
    const a = target && target.closest ? target.closest('a[href]') : null;
    if (a) {
      const href = a.getAttribute('href') || '';
      if (/\/pedidos\/.+\/remito(\b|$)/.test(href)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        // Use provided absolute URL
        const idMatch = /\/pedidos\/(\d+)/.exec(href);
        const orderId = idMatch ? idMatch[1] : 'orden';
        await downloadPdfWithAuth(href, `REMITO-${orderId}.pdf`);
        return;
      }
    }

    // Case 2: injected button .view-remito
    const btn = target && target.closest ? target.closest('.view-remito') : null;
    if (btn) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const orderId = getOrderIdFromContainer(btn) || 'orden';
      const url = `${API_BASE}/pedidos/${encodeURIComponent(orderId)}/remito`;
      await downloadPdfWithAuth(url, `REMITO-${orderId}.pdf`);
      return;
    }
  } catch (err) {
    console.error('remito-override download error', err);
  }
}, true); // capture phase to run before other handlers

// Also wrap window.fetchWithAuth to download remito after marking as delivered
try {
  const _orig = window.fetchWithAuth;
  if (typeof _orig === 'function') {
    window.fetchWithAuth = async function(url, opt = {}, retry = true) {
      const resp = await _orig(url, opt, retry);
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
            const orderId = (u.pathname.match(/\/(\d+)$/) || [, 'orden'])[1];
            await downloadPdfWithAuth(finalUrl, `REMITO-${orderId}.pdf`);
          }
        }
      } catch {}
      return resp;
    };
  }
} catch {}
