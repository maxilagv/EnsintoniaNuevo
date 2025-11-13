# -*- coding: utf-8 -*-
import io
p = r'frontend/main.js'
s = io.open(p, 'r', encoding='utf-8').read()
start = s.find("document.getElementById('checkout-form')?.addEventListener('submit', async (e) => {")
if start == -1:
    raise SystemExit('capturing submit start not found')
end = s.find("}, true);", start)
if end == -1:
    raise SystemExit('capturing submit end not found')
end = end + len("}, true);")
new_block = (
    "document.getElementById('checkout-form')?.addEventListener('submit', async (e) => {\n"
    "  e.preventDefault();\n"
    "  e.stopImmediatePropagation();\n"
    "  if (!cart.length) { showMessageBox('Tu carrito esta vacio'); closeCheckout(); return; }\n"
    "  const name = String(document.getElementById('checkout-name')?.value||'').trim();\n"
    "  const lastname = String(document.getElementById('checkout-lastname')?.value||'').trim();\n"
    "  const dni = String(document.getElementById('checkout-dni')?.value||'').replace(/\\D+/g,'');\n"
    "  const email = String(document.getElementById('checkout-email')?.value||'').trim();\n"
    "  const phoneRaw = String(document.getElementById('checkout-phone')?.value||'').trim();\n"
    "  const phoneDigits = phoneRaw.replace(/[^0-9]/g,'');\n"
    "  const payment = document.querySelector('input[name=\"payment\"]:checked')?.value||'cash';\n"
    "  if (!name || !lastname || !dni) { showMessageBox('Completa Nombre, Apellido y DNI'); return; }\n"
    "  if (!/^\\d{7,10}$/.test(dni)) { showMessageBox('El DNI debe tener entre 7 y 10 digitos'); return; }\n"
    "  const emailOk = /.+@.+\\..+/.test(email);\n"
    "  if (!emailOk) { showMessageBox('Ingresa un email valido'); return; }\n"
    "  if (phoneDigits.length < 6) { showMessageBox('Ingresa un telefono valido (6+ digitos)'); return; }\n"
    "  if (payment === 'mp') { showMessageBox('La opcion de Mercado Pago estara disponible proximamente. Elegi Efectivo por ahora.'); return; }\n"
    "  try {\n"
    "    const insufficient = [];\n"
    "    for (const it of cart){\n"
    "      const p = await fetchProductById(it.id);\n"
    "      const stock = Number(p?.stock||0) || 0;\n"
    "      const need = Number(it.qty||0) || 0;\n"
    "      if (stock <= 0 || stock < need) insufficient.push(${it.name} (stock: , necesita: ));\n"
    "    }\n"
    "    if (insufficient.length){ showMessageBox('No hay stock suficiente para:\\n' + insufficient.join('\\n')); return; }\n"
    "  } catch {}\n\n"
    "  const payload = {\n"
    "    buyer: { name: ${name}  (DNI ), email, phone: phoneDigits },\n"
    "    items: cart.map(it => ({ productId: Number(it.id), quantity: Number(it.qty) }))\n"
    "  };\n"
    "  try {\n"
    "    const resp = await fetch(${API_BASE}/checkout, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload) });\n"
    "    let orderNumber = ''; let orderId = '';\n"
    "    if (resp.ok) { const data = await resp.json().catch(()=>({})); orderNumber = data?.orderNumber || ''; orderId = (data?.orderId != null) ? String(data.orderId) : ''; }\n"
    "    else if (resp.status === 409) { const tx = await resp.text(); showMessageBox(tx || 'Stock insuficiente o conflicto de orden'); return; }\n"
    "    else { const tx = await resp.text(); console.error('checkout error', resp.status, tx); showMessageBox('No se pudo registrar la compra. Intenta nuevamente.'); return; }\n"
    "    cart = []; saveCart(); closeCheckout();\n"
    "    const label = orderNumber || (orderId ? ('ID ' + orderId) : '');\n"
    "    showMessageBox(label ? ('Compra registrada! Numero de compra: ' + label) : 'Compra registrada!');\n"
    "  } catch (err) { console.error('checkout fetch error', err); showMessageBox('No se pudo registrar la compra (conexion).'); }\n"
    "}, true);"
)
s2 = s[:start] + new_block + s[end:]
io.open(p, 'w', encoding='utf-8', newline='').write(s2)
print('replaced capture block')