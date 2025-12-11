-- V30: Permisos de ventas para Logistica RW/RWD

-- Asegurar que existan los permisos necesarios
INSERT INTO Permissions(name, description)
VALUES
  ('ventas.read', 'Ver pedidos y comprobantes'),
  ('ventas.write', 'Actualizar estado de pedidos')
ON CONFLICT (name) DO NOTHING;

-- Asignar permisos a perfiles de logística (RW y RWD)
INSERT INTO ProfilePermissions(profile_id, permission_id)
SELECT p.id, perm.id
FROM Profiles p
JOIN Permissions perm ON perm.name IN ('ventas.read','ventas.write')
WHERE p.name IN ('LOGISTICA_RW','LOGISTICA_RWD')
ON CONFLICT DO NOTHING;

-- Asignar permisos a rol LOGISTICA_RW
INSERT INTO RolePermissions(role_id, permission_id)
SELECT r.id, perm.id
FROM Roles r
JOIN Permissions perm ON perm.name IN ('ventas.read','ventas.write')
WHERE r.name = 'LOGISTICA_RW'
ON CONFLICT DO NOTHING;

