const { query } = require('../db/pg');

async function audit(actor, action, entityType, entityId, meta) {
  try {
    await query(
      `INSERT INTO AuditLog(actor, action, entity_type, entity_id, meta) VALUES ($1,$2,$3,$4,$5)`,
      [actor || null, action, entityType || null, entityId || null, meta ? JSON.stringify(meta) : null]
    );
  } catch (_) {
    // swallow errors to not break request flow
  }
}

module.exports = { audit };

