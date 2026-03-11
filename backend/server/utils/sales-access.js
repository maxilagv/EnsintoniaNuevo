function hasPermissionLike(grantedPermissions, requested) {
  if (!grantedPermissions || typeof grantedPermissions.has !== 'function') return false;
  if (grantedPermissions.has(requested)) return true;
  const parts = String(requested || '').split('.');
  for (let i = parts.length; i > 0; i -= 1) {
    const wildcard = `${parts.slice(0, i).join('.')}.*`;
    if (grantedPermissions.has(wildcard)) return true;
  }
  return false;
}

function canAssignSalesToOtherSeller(grantedPermissions) {
  return (
    hasPermissionLike(grantedPermissions, 'administracion.read') ||
    hasPermissionLike(grantedPermissions, 'ventas.delete')
  );
}

module.exports = {
  hasPermissionLike,
  canAssignSalesToOtherSeller,
};
