-- V31: Permisos para módulo Clientes y acceso total para roles administrativos

-- Crear permisos básicos para Clientes
INSERT INTO Permissions(name, description)
VALUES
  ('clientes.read', 'Ver clientes'),
  ('clientes.write', 'Crear y editar clientes'),
  ('clientes.delete', 'Eliminar clientes'),
  ('clientes.*', 'Acceso total al módulo de clientes')
ON CONFLICT (name) DO NOTHING;

-- Asignar permisos de Clientes al rol superadmin
INSERT INTO RolePermissions(role_id, permission_id)
SELECT r.id, p.id
FROM Roles r
JOIN Permissions p ON p.name IN ('clientes.read','clientes.write','clientes.delete','clientes.*')
WHERE r.name = 'superadmin'
ON CONFLICT DO NOTHING;

-- Asignar permisos de Clientes al rol ADMIN_COMPLETO (acceso total)
INSERT INTO RolePermissions(role_id, permission_id)
SELECT r.id, p.id
FROM Roles r
JOIN Permissions p ON p.name IN ('clientes.read','clientes.write','clientes.delete','clientes.*')
WHERE r.name = 'ADMIN_COMPLETO'
ON CONFLICT DO NOTHING;

