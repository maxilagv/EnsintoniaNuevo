# -*- coding: utf-8 -*-
import io, os, sys
path = r'frontend/admin.js'
with open(path, 'r', encoding='utf-8') as f:
    s = f.read()

def find_header(src, name):
    for hdr in (f"async function {name}(){{", f"async function {name}() {{"):
        i = src.find(hdr)
        if i != -1:
            return i, hdr
    return -1, None

def replace_function(src, name, new_body):
    i, hdr = find_header(src, name)
    if i == -1:
        raise SystemExit(f'Function header not found: {name}')
    j = i + len(hdr)
    depth = 1
    while j < len(src) and depth > 0:
        ch = src[j]
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
        j += 1
    if depth != 0:
        raise SystemExit(f'Unbalanced braces for {name}')
    before = src[:i]
    after = src[j:]
    replacement = hdr + "\n" + new_body + "\n}"
    return before + replacement + after

new_load = (
    '  const box = document.getElementById("ordersList");\n'
    '  if (!box) return;\n'
    '  try {\n'
    "    const url = API_BASE + '/pedidos';\n"
    "    const resp = await fetchWithAuth(url);\n"
    "    if (!resp.ok) throw new Error('HTTP ' + resp.status);\n"
    '    const rows = await resp.json();\n'
    '    const orders = (Array.isArray(rows) ? rows : []).map(function(r){\n'
    '      return {\n'
    '        id: r.id,\n'
    '        total: Number(r.total_amount || r.total || 0) || 0,\n'
    "        status: String(r.status || 'PENDING').toLowerCase(),\n"
    '        createdAt: r.order_date || r.created_at || r.createdAt || null,\n'
    '        buyer: {\n'
    "          nombre: r.buyer_name || '',\n"
    "          apellido: '',\n"
    "          dni: ''\n"
    '        },\n'
    '        items: []\n'
    '      };\n'
    '    });\n'
    '    orders.sort(function(a,b){ return new Date(b.createdAt||0) - new Date(a.createdAt||0); });\n'
    "    if (!orders.length) {\n"
    "      box.innerHTML = '<p class=\"text-center text-gray-400\">No hay compras registradas.</p>';\n"
    '      return;\n'
    '    }\n'
    '    box.innerHTML = orders.map(renderOrderCard).join("");\n'
    '    try { enhanceOrdersUI(); } catch (e) {}\n'
    '  } catch (err) {\n'
    "    console.warn('Falling back to local orders due to backend error:', (err and getattr(err,'message',None)) or err);\n"
    '    const orders = loadLocalOrders();\n'
    "    if (!orders.length) { box.innerHTML = '<p class=\"text-center text-gray-400\">No hay compras registradas.</p>'; return; }\n"
    '    orders.sort(function(a,b){ return new Date(b.createdAt||0) - new Date(a.createdAt||0); });\n'
    '    box.innerHTML = orders.map(renderOrderCard).join("");\n'
    '    try { enhanceOrdersUI(); } catch (e) {}\n'
    '  }\n'
)

new_mark = (
    '  // Intentar vía backend; si falla, fallback local (legacy)\n'
    '  try {\n'
    "    const url = API_BASE + '/pedidos/' + encodeURIComponent(orderId);\n"
    "    const resp = await fetchWithAuth(url, { method: 'PATCH', body: JSON.stringify({ status: 'DELIVERED' }) });\n"
    "    if (!resp.ok) throw new Error('HTTP ' + resp.status);\n"
    "    showMessageBox('Orden marcada como entregada', 'success');\n"
    '    await loadOrdersAdmin();\n'
    '    return;\n'
    '  } catch (err) {\n'
    "    console.warn('Backend PATCH failed; trying local fallback. Reason:', (err and getattr(err,'message',None)) or err);\n"
    '  }\n'
    '  try {\n'
    '    const orders = loadLocalOrders();\n'
    '    const idx = orders.findIndex(o => String(o.id) === String(orderId));\n'
    "    if (idx === -1) return showMessageBox('Orden no encontrada', 'error');\n"
    '    const order = orders[idx];\n'
    '    if (/^delivered$/i.test(String(order.status||"pending"))) return;\n'
    "    order.status = 'delivered';\n"
    '    orders[idx] = order;\n'
    '    saveLocalOrders(orders);\n'
    "    showMessageBox('Orden marcada como entregada (local)', 'success');\n"
    '    await loadOrdersAdmin();\n'
    '  } catch (err) {\n'
    "    console.error('markOrderDelivered fallback error', err);\n"
    "    showMessageBox('No se pudo marcar como entregada', 'error');\n"
    '  }\n'
)

new_del = (
    '  // Intentar vía backend; si falla y es entregada en local, quitar de local como último recurso\n'
    '  try {\n'
    "    const ok = window.confirm('¿Eliminar esta orden (solo si está entregada)?');\n"
    '    if (!ok) return;\n'
    "    const url = API_BASE + '/pedidos/' + encodeURIComponent(orderId);\n"
    "    const resp = await fetchWithAuth(url, { method: 'DELETE' });\n"
    "    if (!resp.ok) throw new Error('HTTP ' + resp.status);\n"
    "    showMessageBox('Orden eliminada', 'success');\n"
    '    await loadOrdersAdmin();\n'
    '    return;\n'
    '  } catch (err) {\n'
    "    console.warn('Backend DELETE failed; trying local fallback. Reason:', (err and getattr(err,'message',None)) or err);\n"
    '  }\n'
    '  try {\n'
    '    const orders = loadLocalOrders();\n'
    '    const idx = orders.findIndex(o => String(o.id) === String(orderId));\n'
    "    if (idx === -1) { showMessageBox('Orden no encontrada', 'error'); return; }\n"
    '    const order = orders[idx];\n'
    "    if (!/^delivered$/i.test(String(order.status||'pending'))) { showMessageBox('Primero marca la orden como entregada.', 'warning'); return; }\n"
    "    const ok = window.confirm('¿Eliminar esta orden del panel local?');\n"
    '    if (!ok) return;\n'
    '    orders.splice(idx, 1);\n'
    '    saveLocalOrders(orders);\n'
    "    showMessageBox('Orden eliminada del panel (local)', 'success');\n"
    '    loadOrdersAdmin();\n'
    '  } catch (err) {\n'
    "    console.error('deleteOrderFromPanel fallback error', err);\n"
    "    showMessageBox('No se pudo eliminar la orden', 'error');\n"
    '  }\n'
)

s = replace_function(s, 'loadOrdersAdmin', new_load)
s = replace_function(s, 'markOrderDelivered', new_mark)
s = replace_function(s, 'deleteOrderFromPanel', new_del)

with open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(s)
print('admin.js updated OK')