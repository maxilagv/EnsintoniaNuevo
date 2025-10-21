Base de Datos SQL Avanzada
Esta es una base de datos SQL avanzada con modelo relacional normalizado, triggers automáticos y borrado lógico implementado con Flyway para migraciones.

🚀 Características Principales
✅ Modelo Relacional Normalizado (3NF)
Evita duplicación de datos mediante normalización

Tablas separadas lógicamente: Users, Roles, Permissions, Categories, Products, Orders, OrderItems, Payments, Logs

Claves foráneas bien definidas con ON DELETE CASCADE y ON UPDATE CASCADE

Integridad referencial garantizada

✅ Triggers Automáticos
Actualización automática de updated_at: Se actualiza automáticamente en cada UPDATE

Auditoría automática mejorada: Registra todas las operaciones con mayor contexto en la tabla Logs

Prevención de recursión: Manejo seguro de triggers anidados

✅ Borrado Lógico (Soft Delete)
Interceptación de DELETE: Los comandos DELETE se convierten en UPDATE con timestamp

Preservación de datos: Los registros nunca se eliminan físicamente

Funciones de utilidad: restore, hard_delete, get_deleted_count

✅ Integración con Flyway
Migraciones versionadas: Control de cambios de esquema

Scripts automatizados: Migración y rollback simplificados

Historial de cambios: Seguimiento completo de modificaciones

📁 Estructura de Archivos
database/
├── schema.sql                           # Schema completo (para referencia)
├── migrations/                          # Migraciones de Flyway
│   ├── V1__Initial_schema.sql          # Schema inicial
│   ├── V2__Triggers_and_soft_delete.sql # Triggers y soft delete
│   └── V3__Improve_logs.sql            # Mejoras en el sistema de logs
├── flyway-migrate.sh                   # Script de migración
├── flyway-rollback.sh                  # Script de rollback
├── test_triggers_and_soft_delete.sql   # Tests de funcionalidad
└── README.md                           # Esta documentación
flyway.conf                             # Configuración de Flyway

🛠️ Instalación y Configuración
1. Instalar Flyway
# Ubuntu/Debian
sudo apt-get install flyway

# macOS
brew install flyway

# Windows
# Descargar desde https://flywaydb.org/download/

2. Configurar Base de Datos
Editar flyway.conf con tus credenciales:

flyway.url=jdbc:postgresql://localhost:5432/tu_base_de_datos
flyway.user=tu_usuario
flyway.password=tu_contraseña

3. Ejecutar Migraciones
# Hacer ejecutable (solo la primera vez)
chmod +x database/flyway-migrate.sh
chmod +x database/flyway-rollback.sh

# Ejecutar migraciones
./database/flyway-migrate.sh

📊 Tablas Principales
Users (Usuarios)
- id (SERIAL PRIMARY KEY)
- email (VARCHAR UNIQUE)
- password_hash (VARCHAR)
- name (VARCHAR)
- created_at, updated_at, deleted_at (TIMESTAMP)

Products (Productos)
- id (SERIAL PRIMARY KEY)
- category_id (FK → Categories)
- name, description (VARCHAR/TEXT)
- price (DECIMAL)
- stock_quantity (INT)
- created_at, updated_at, deleted_at (TIMESTAMP)

Orders (Pedidos)
- id (SERIAL PRIMARY KEY)
- user_id (FK → Users)
- order_date (TIMESTAMP)
- status (VARCHAR)
- total_amount (DECIMAL)
- created_at, updated_at, deleted_at (TIMESTAMP)

🔧 Funciones de Utilidad
Restaurar Registro Eliminado
SELECT restore_record('Users', 123);
-- Restaura el usuario con ID 123

Eliminar Permanentemente
SELECT hard_delete_record('Users', 123);
-- Elimina físicamente el usuario con ID 123 (solo si ya está soft-deleted)

Contar Registros Eliminados
SELECT get_deleted_count('Users');
-- Retorna el número de usuarios soft-deleted

📋 Vistas de Registros Activos
Para consultar solo registros no eliminados:

-- En lugar de: SELECT * FROM Users WHERE deleted_at IS NULL;
SELECT * FROM active_users;

-- Otras vistas disponibles:
SELECT * FROM active_products;
SELECT * FROM active_orders;
SELECT * FROM active_categories;
-- etc.

🧪 Pruebas
Ejecutar el script de pruebas para validar la funcionalidad:

-- Conectarse a la base de datos y ejecutar:
\i database/test_triggers_and_soft_delete.sql

Este script prueba:

✅ Actualización automática de timestamps

✅ Funcionamiento del soft delete

✅ Vistas de registros activos

✅ Funciones de utilidad

✅ Logs de auditoría

🔄 Comandos Flyway Útiles
# Ver estado de migraciones
flyway -configFiles=flyway.conf info

# Ejecutar migraciones pendientes
flyway -configFiles=flyway.conf migrate

# Validar migraciones
flyway -configFiles=flyway.conf validate

# Limpiar base de datos (¡CUIDADO!)
flyway -configFiles=flyway.conf clean

# Rollback (requiere Flyway Pro)
flyway -configFiles=flyway.conf undo

📈 Índices de Rendimiento
La base de datos incluye índices optimizados para:

Consultas frecuentes: email, nombres, fechas

Soft delete: índices en deleted_at

Registros activos: índices parciales para deleted_at IS NULL

Relaciones: índices en claves foráneas

Logs mejorados: índices en user_id, severity, created_at, table_name, operation

🔒 Seguridad y Mejores Prácticas
Triggers Implementados
fn_set_updated_at(): Actualiza automáticamente updated_at

fn_soft_delete(): Intercepta DELETE y convierte a soft delete

fn_audit_log(): Registra todas las operaciones con mayor detalle y contexto

Prevención de Problemas
Recursión de triggers: Manejo con session_replication_role

Integridad referencial: Claves foráneas con CASCADE

Validación de datos: Constraints y checks apropiados

🚨 Consideraciones Importantes
Soft Delete
Los registros nunca se eliminan físicamente por defecto

Usar hard_delete_record() solo cuando sea absolutamente necesario

Las consultas deben filtrar por deleted_at IS NULL o usar las vistas active_*

Rendimiento
Los índices están optimizados para consultas con soft delete

Considerar limpieza periódica de registros muy antiguos

Monitorear el crecimiento de la tabla Logs

Migraciones
Nunca modificar migraciones ya aplicadas

Crear nuevas migraciones para cambios adicionales

Probar migraciones en entorno de desarrollo primero

Mejoras en el Sistema de Logs
Contexto Ampliado: La tabla Logs ahora incluye user_id, ip_address, table_name, operation, record_id y severity.

Severidad: La función fn_audit_log() asigna una severidad (INFO, WARNING, etc.) a los logs.

Población de user_id e ip_address: Para que estos campos se rellenen, tu aplicación debe establecer las siguientes configuraciones de sesión antes de ejecutar operaciones DML:

SET app.current_user_id = <ID_DEL_USUARIO_ACTUAL>;
SET app.client_ip_address = '<DIRECCION_IP_DEL_CLIENTE>';

Si no se establecen, estos campos aparecerán como NULL en los logs.

Política de retención: Es crucial implementar un proceso externo (por ejemplo, un cron job) para purgar periódicamente los logs antiguos de la tabla Logs y así evitar un crecimiento indefinido. Un ejemplo sería:

DELETE FROM Logs WHERE created_at < NOW() - INTERVAL '6 months';

Backups automáticos: Si los logs contienen información sensible (ej. auditoría legal, transacciones financieras), considera implementar una estrategia de backups automáticos y seguros para estos registros.

Restricción de acceso: Implementa restricciones estrictas de permisos para que solo los usuarios administradores o de sistemas autorizados puedan leer y borrar los logs, garantizando la integridad de la auditoría.

Logs Críticos: Para acciones sensibles (ej. cambios de seguridad, privilegios), considera políticas de retención más largas o archivado en backups seguros.

Centralización: Si tu aplicación (ej. Node/Express) también genera logs, se recomienda centralizar los logs críticos en la misma tabla o en un sistema externo (ej. ELK Stack, Cloudwatch, Datadog) para una visión unificada.

Auditoría de Logs: Implementa restricciones estrictas de permisos para que solo los administradores puedan leer y borrar los logs, garantizando la integridad de la auditoría.

📞 Soporte
Para problemas o mejoras:

Verificar logs de Flyway

Ejecutar script de pruebas

Revisar configuración de base de datos

Consultar documentación de Flyway

¡Base de datos lista para producción con todas las características avanzadas implementadas y un sistema de logs mejorado! 🎉