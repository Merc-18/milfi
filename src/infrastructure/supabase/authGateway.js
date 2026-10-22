// Adapter over Supabase Auth. Authorization is NOT decided here: permissions are
// read from the database rows the RLS policies themselves use, never from
// user_metadata/app_metadata. Errors are mapped to codes; nothing is logged.
export function authErrorCode(error) {
  if (!error) return null;
  const message = String(error.message ?? '').toLowerCase();
  if (error.code === 'invalid_credentials' || message.includes('invalid login credentials')) return 'INVALID_CREDENTIALS';
  if (error.code === 'email_not_confirmed') return 'EMAIL_NOT_CONFIRMED';
  if (error.status === 429 || error.code === 'over_request_rate_limit') return 'RATE_LIMITED';
  if (error.name === 'AuthRetryableFetchError' || message.includes('fetch') || message.includes('network')) return 'NETWORK_ERROR';
  if (error.code === 'session_expired' || error.code === 'refresh_token_not_found' || message.includes('jwt expired')) return 'SESSION_EXPIRED';
  return 'AUTH_ERROR';
}

const user = session => session?.user ? { id: session.user.id, email: session.user.email ?? null } : null;

export function createAuthGateway(client) {
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) return { ok: false, code: authErrorCode(error) };
      return { ok: true, user: user(data.session), expiresAt: data.session?.expires_at ?? null };
    },
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      return error ? { ok: false, code: authErrorCode(error) } : { ok: true, user: user(data.session) };
    },
    async changePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      return error ? { ok: false, code: error.code === 'weak_password' ? 'WEAK_PASSWORD' : error.code === 'same_password' ? 'SAME_PASSWORD' : authErrorCode(error) } : { ok: true };
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      return error ? { ok: false, code: authErrorCode(error) } : { ok: true };
    },
    onChange(callback) {
      const { data } = client.auth.onAuthStateChange((event, session) => callback(event, user(session)));
      return () => data.subscription.unsubscribe();
    },
    // Trusted assignments, filtered by RLS to the caller's household.
    async loadAccess(userId) {
      const profile = await client.from('profiles').select('user_id, household_id, identity, display_name').eq('user_id', userId).maybeSingle();
      if (profile.error) return { ok: false, code: 'ACCESS_LOAD_FAILED' };
      if (!profile.data) return { ok: true, profile: null, permissions: [] };
      const permissions = await client.from('module_permissions').select('module, access').eq('user_id', userId).eq('household_id', profile.data.household_id);
      if (permissions.error) return { ok: false, code: 'ACCESS_LOAD_FAILED' };
      return { ok: true, profile: profile.data, permissions: permissions.data };
    },
  };
}

/** Lazily creates the browser client only when a valid public configuration exists. */
export async function createBrowserAuthGateway(config) {
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
  });
  return { client, gateway: createAuthGateway(client) };
}
