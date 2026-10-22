// Reads the PUBLIC Supabase settings (project URL + publishable/anon key).
// A privileged key (service_role / sb_secret_) must never reach the browser:
// it is rejected here so the app refuses to start with it.
function jwtRole(key) {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[1].length / 4) * 4, '='));
    return JSON.parse(json)?.role ?? null;
  } catch {
    return null;
  }
}

export function readSupabaseConfig(env = {}) {
  const url = typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim() : '';
  const rawKey = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY;
  const key = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (!url && !key) return { status: 'unconfigured' };
  if (!url || !key) return { status: 'invalid', reason: 'INCOMPLETE_CONFIGURATION' };
  let parsed;
  try { parsed = new URL(url); } catch { return { status: 'invalid', reason: 'INVALID_URL' }; }
  const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) return { status: 'invalid', reason: 'INSECURE_URL' };
  if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') return { status: 'invalid', reason: 'PRIVILEGED_KEY_REJECTED' };
  if (!key.startsWith('sb_publishable_') && jwtRole(key) !== 'anon') return { status: 'invalid', reason: 'UNRECOGNIZED_KEY' };
  return { status: 'configured', url: parsed.origin, key };
}
