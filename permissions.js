const CATALOG = [
  { key: 'view_dashboard', label: 'Ver Publicaciones', group: 'Secciones', desc: 'Acceso al dashboard de publicaciones.' },
  { key: 'view_informes', label: 'Ver Informes', group: 'Secciones', desc: 'Acceso a la sección de informes.' },
  { key: 'view_grupos', label: 'Ver Grupos', group: 'Secciones', desc: 'Acceso a la sección de grupos.' },
  { key: 'view_zonas', label: 'Ver Zonas', group: 'Secciones', desc: 'Acceso al panel de zonas.' },
  { key: 'view_sucursales', label: 'Ver Sucursales', group: 'Secciones', desc: 'Acceso a la sección de sucursales.' },

  { key: 'edit_marketing', label: 'Crear / editar / eliminar publicaciones', group: 'Publicaciones', desc: 'Alta, edición y borrado de publicaciones.' },
  { key: 'sync_marketing', label: 'Sincronizar publicaciones desde Google Sheets', group: 'Publicaciones', desc: 'Traer los últimos datos de la planilla.' },

  { key: 'edit_grupos', label: 'Crear / editar / eliminar grupos', group: 'Grupos y Zonas', desc: 'Alta, edición y borrado de grupos.' },
  { key: 'edit_zonas', label: 'Crear / eliminar zonas', group: 'Grupos y Zonas', desc: 'Alta y borrado de zonas.' },

  { key: 'edit_sucursales', label: 'Crear / editar / eliminar sucursales', group: 'Sucursales', desc: 'Alta, edición y borrado de sucursales.' },

  { key: 'edit_informes', label: 'Importar / eliminar informes', group: 'Informes', desc: 'Carga y borrado de informes.' },
  { key: 'sync_informes', label: 'Sincronizar informes desde Google Sheets', group: 'Informes', desc: 'Sincronizar los informes con la planilla.' }
];

const DEFAULT_ROLE_PERMISSIONS = {
  colaborador: {
    view_dashboard: true,
    view_informes: true,
    view_grupos: true,
    view_zonas: true,
    view_sucursales: true,
    edit_marketing: true,
    sync_marketing: true,
    edit_grupos: true,
    edit_zonas: false,
    edit_sucursales: true,
    edit_informes: true,
    sync_informes: true
  }
};

function normalizeRole(role) {
  return (role || '').toLowerCase();
}

const _seeded = {};

async function ensureRoleDefaults(db, role) {
  role = normalizeRole(role);
  if (_seeded[role]) return;
  const defaults = DEFAULT_ROLE_PERMISSIONS[role];
  if (!defaults) { _seeded[role] = true; return; }
  for (const item of CATALOG) {
    const enabled = defaults[item.key] !== undefined ? defaults[item.key] : true;
    await db.run(
      'INSERT INTO role_permissions (role, permission, enabled) VALUES (?, ?, ?) ON CONFLICT (role, permission) DO NOTHING',
      [role, item.key, enabled]
    );
  }
  _seeded[role] = true;
}

async function getRolePermissions(db, role) {
  role = normalizeRole(role);
  await ensureRoleDefaults(db, role);
  const map = {};
  for (const item of CATALOG) map[item.key] = true;
  const rows = await db.all('SELECT permission, enabled FROM role_permissions WHERE role = ?', [role]);
  rows.forEach(r => { map[r.permission] = r.enabled === true || r.enabled === 1 || r.enabled === 'true'; });
  return map;
}

async function setRolePermissions(db, role, updates) {
  role = normalizeRole(role);
  await ensureRoleDefaults(db, role);
  for (const item of CATALOG) {
    if (updates[item.key] === undefined) continue;
    await db.run(
      'UPDATE role_permissions SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE role = ? AND permission = ?',
      [!!updates[item.key], role, item.key]
    );
  }
}

async function hasPermission(db, role, key) {
  role = normalizeRole(role);
  if (role === 'admin') return true;
  if (!CATALOG.some(i => i.key === key)) return true;
  const perms = await getRolePermissions(db, role);
  return perms[key] !== false;
}

module.exports = {
  CATALOG,
  DEFAULT_ROLE_PERMISSIONS,
  normalizeRole,
  ensureRoleDefaults,
  getRolePermissions,
  setRolePermissions,
  hasPermission
};
