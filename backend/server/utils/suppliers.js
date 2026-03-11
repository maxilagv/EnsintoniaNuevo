function normStr(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normEmail(value) {
  const normalized = normStr(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normCuit(value) {
  if (value == null) return null;
  const digits = String(value).replace(/\D+/g, '');
  return digits || null;
}

function normalizeSupplierInput(input = {}) {
  return {
    name: normStr(input.name),
    cuit: normCuit(input.cuit),
    contact_name: normStr(input.contact_name || input.contactName),
    contact_phone: normStr(input.contact_phone || input.contactPhone),
    contact_email: normEmail(input.contact_email || input.contactEmail),
  };
}

module.exports = {
  normStr,
  normEmail,
  normCuit,
  normalizeSupplierInput,
};
