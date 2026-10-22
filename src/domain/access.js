// Module access as stored in the database (module_permissions). The UI only
// mirrors it for usability; the database policies are the actual enforcement.
export const ACCESS_MODULES = Object.freeze(['fiorella', 'control-mf']);

// Approved matrix, identical to private.assign_member in the migrations.
export const APPROVED_ACCESS = Object.freeze({
  fiorella: Object.freeze({ fiorella: 'manage', 'control-mf': 'read' }),
  milton: Object.freeze({ fiorella: 'read', 'control-mf': 'manage' }),
});

export function accessFromPermissions(rows) {
  const access = Object.fromEntries(ACCESS_MODULES.map(module => [module, 'none']));
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!ACCESS_MODULES.includes(row?.module) || !['read', 'manage'].includes(row?.access)) continue;
    if (row.access === 'manage' || access[row.module] === 'none') access[row.module] = row.access;
  }
  return access;
}

export const moduleForPath = pathname => pathname.startsWith('/fiorella') ? 'fiorella' : pathname.startsWith('/control') ? 'control-mf' : null;
export const canRead = level => level === 'read' || level === 'manage' || level === 'demo';
export const canManage = level => level === 'manage' || level === 'demo';
