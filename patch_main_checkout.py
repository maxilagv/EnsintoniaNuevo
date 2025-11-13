# -*- coding: utf-8 -*-
import io, os, re
p = r'frontend/main.js'
s = io.open(p, 'r', encoding='utf-8').read()
anchor = "const payment = document.querySelector('input[name=\"payment\"]:checked')?.value||'cash';"
i = s.find(anchor)
if i != -1:
    j = i + len(anchor)
    injection = "\n\n  const email = String(document.getElementById('checkout-email')?.value||'').trim();\n  const phoneRaw = String(document.getElementById('checkout-phone')?.value||'').trim();\n  const phoneDigits = phoneRaw.replace(/[^0-9]/g,'');\n  const emailOk = /.+@.+\\..+/.test(email);\n  if (!emailOk) { showMessageBox('Ingresa un email valido'); return; }\n  if (phoneDigits.length < 6) { showMessageBox('Ingresa un telefono valido (6+ digitos)'); return; }\n"
    s = s[:j] + injection + s[j:]
# extend payload buyer fields
s = re.sub(r"buyer:\s*\{\s*name:\s*\$\{name\} \$\{lastname\} \(DNI \$\{dni\}\)\s*\}", "buyer: { name: ${name}  (DNI ), email, phone: phoneDigits }", s, count=1)
# add orderId var & message
s = s.replace("let orderNumber = '';", "let orderNumber = '';\n    let orderId = '';", 1)
s = s.replace("orderNumber = data?.orderNumber || '';", "orderNumber = data?.orderNumber || '';\n      orderId = (data?.orderId != null) ? String(data.orderId) : '';", 1)
s = re.sub(r"showMessageBox\([^\)]*orderNumber[^\)]*\);", "const label = orderNumber || (orderId ? ('ID ' + orderId) : '');\n    showMessageBox(label ? ('Compra registrada! Numero de compra: ' + label) : 'Compra registrada!');", s, count=1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')