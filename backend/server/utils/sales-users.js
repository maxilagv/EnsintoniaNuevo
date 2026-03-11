const { query } = require('../db/pg');

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function buildSalesUserDisplayName(row) {
  const name = String(row && row.name ? row.name : '').trim();
  const username = String(row && row.username ? row.username : '').trim();
  if (name && username) return `${name} (@${username})`;
  if (name) return name;
  if (username) return `@${username}`;
  return `Usuario #${row && row.id ? row.id : '-'}`;
}

function mapSalesUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username || null,
    name: row.name || null,
    email: row.email || null,
    department: row.department || null,
    position: row.position || null,
    displayName: buildSalesUserDisplayName(row),
  };
}

function getSalesUsersSql(extraWhereSql = '', limitPlaceholder = '') {
  const salesWritePredicate = `
    (
      p.name = 'ventas.*'
      OR p.name = 'ventas.write'
      OR p.name LIKE 'ventas.write.%'
      OR p.name LIKE 'ventas.%.write'
    )
  `;
  return `
    WITH RECURSIVE role_tree AS (
      SELECT ur.user_id, ur.role_id
        FROM UserRoles ur
        JOIN Users u ON u.id = ur.user_id
       WHERE u.deleted_at IS NULL
         AND u.status = 'ACTIVE'
      UNION
      SELECT rt.user_id, r.parent_role_id
        FROM role_tree rt
        JOIN Roles r ON r.id = rt.role_id
       WHERE r.parent_role_id IS NOT NULL
    ),
    sales_users AS (
      SELECT DISTINCT rt.user_id
        FROM role_tree rt
        JOIN RolePermissions rp ON rp.role_id = rt.role_id
        JOIN Permissions p ON p.id = rp.permission_id
       WHERE p.deleted_at IS NULL
         AND ${salesWritePredicate}
      UNION
      SELECT DISTINCT up.user_id
        FROM UserProfiles up
        JOIN ProfilePermissions pp ON pp.profile_id = up.profile_id
        JOIN Permissions p ON p.id = pp.permission_id
       WHERE (up.expires_at IS NULL OR up.expires_at > CURRENT_TIMESTAMP)
         AND p.deleted_at IS NULL
         AND ${salesWritePredicate}
    )
    SELECT
           u.id,
           u.username,
           u.name,
           u.email,
           u.department,
           u.position
      FROM Users u
      JOIN sales_users su ON su.user_id = u.id
     WHERE u.deleted_at IS NULL
       AND u.status = 'ACTIVE'
       ${extraWhereSql}
     ORDER BY
       COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(u.username), ''), NULLIF(TRIM(u.email), ''), 'ZZZ') ASC,
       u.id ASC
     ${limitPlaceholder ? `LIMIT ${limitPlaceholder}` : ''}
  `;
}

async function listAssignableSalesUsers(options = {}) {
  const q = normalizeText(options.q);
  const limitRaw = Number(options.limit);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 100;
  const params = [];
  let extraWhereSql = '';

  if (q) {
    params.push(`%${q}%`);
    const idx = params.length;
    extraWhereSql = `
      AND (
        LOWER(COALESCE(u.name, '')) LIKE $${idx}
        OR LOWER(COALESCE(u.username, '')) LIKE $${idx}
        OR LOWER(COALESCE(u.email, '')) LIKE $${idx}
        OR LOWER(COALESCE(u.department, '')) LIKE $${idx}
        OR LOWER(COALESCE(u.position, '')) LIKE $${idx}
      )
    `;
  }

  params.push(limit);
  const sql = getSalesUsersSql(extraWhereSql, `$${params.length}`);
  const { rows } = await query(sql, params);
  return rows.map(mapSalesUser);
}

async function findAssignableSalesUserById(userId, dbOrQuery = query) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const runQuery =
    typeof dbOrQuery === 'function'
      ? dbOrQuery
      : dbOrQuery && typeof dbOrQuery.query === 'function'
        ? dbOrQuery.query.bind(dbOrQuery)
        : query;

  const sql = getSalesUsersSql('AND u.id = $1');
  const { rows } = await runQuery(sql, [id]);
  return rows.length ? mapSalesUser(rows[0]) : null;
}

module.exports = {
  buildSalesUserDisplayName,
  listAssignableSalesUsers,
  findAssignableSalesUserById,
};
