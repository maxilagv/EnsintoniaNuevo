# -*- coding: utf-8 -*-
import re
p = r'frontend/admin.js'
with open(p,'r',encoding='utf-8') as f:
    s = f.read()

# 1) Redirect showSection orders branch to server loader
s, n1 = re.subn(r"(sectionId === 'orders'[^\n]*\{[\s\S]*?)loadOrdersAdmin\(\);","\\1loadOrdersAdminServer();", s, count=1)

# 2) Redirect delegated events to server handlers
s, n2 = re.subn(r"(ordersList\)\?\.addEventListener\([\s\S]*?if \(deliveredBtn\) \{[\s\S]*?\bid\)\s*)markOrderDelivered\(id\);","\\1markOrderDeliveredServer(id);", s, count=1)
# delete
s, n3 = re.subn(r"(ordersList\)\?\.addEventListener[\s\S]*?if \(deleteBtn\) \{[\s\S]*?\bid\)\s*)deleteOrderFromPanel\(id\);","\\1deleteOrderFromPanelServer(id);", s, count=1)

append_code = '''

// --- Fase 1: órdenes desde backend ---
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
        total: Number(r.total_amount || r.total || 0) || 0,
        status: String(r.status || 'PENDING').toLowerCase(),
        createdAt: r.order_date || r.created_at || r.createdAt || null,
        buyer: { nombre: r.buyer_name || '', apellido: '', dni: '' },
        items: []
      };
    });
    orders.sort(function(a,b){ return new Date(b.createdAt||0) - new Date(a.createdAt||0); });
    if (!orders.length) {
      box.innerHTML = '<p class="text-center text-gray-400">No hay compras registradas.</p>';
      return;
    }
    box.innerHTML = orders.map(renderOrderCard).join('');
    try { enhanceOrdersUI(); } catch(e) {}
  } catch(err) {
    console.warn('Fallo al listar /pedidos. Mostrando datos locales.', err && err.message ? err.message : err);
    const orders = loadLocalOrders();
    if (!orders.length) { box.innerHTML = '<p class="text-center text-gray-400">No hay compras registradas.</p>'; return; }
    orders.sort(function(a,b){ return new Date(b.createdAt||0) - new Date(a.createdAt||0); });
    box.innerHTML = orders.map(renderOrderCard).join('');
    try { enhanceOrdersUI(); } catch(e) {}
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
    const ok = window.confirm('¿Eliminar esta orden (solo si está entregada)?');
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
    const ok2 = window.confirm('¿Eliminar esta orden del panel local?');
    if (!ok2) return;
    orders.splice(idx, 1);
    saveLocalOrders(orders);
    showMessageBox('Orden eliminada del panel (local)', 'success');
    loadOrdersAdminServer();
  } catch (err) {
    console.error('Fallback delete error', err);
    showMessageBox('No se pudo eliminar la orden', 'error');
  }
}
'''

if append_code not in s:
    s = s + append_code

with open(p,'w',encoding='utf-8', newline='') as f:
    f.write(s)
print('Patched admin.js. showSection->server loader:', n1, 'mark:', n2, 'delete:', n3)