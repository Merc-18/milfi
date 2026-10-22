import { create } from 'zustand';
import { accessFromPermissions } from '../domain/access.js';
import { readSupabaseConfig } from '../infrastructure/supabase/config.js';
import { createBrowserAuthGateway } from '../infrastructure/supabase/authGateway.js';
import { createMilfiPersistence } from '../application/persistence.js';

// status: demo | config-error | initializing | signed-out | expired | signing-in
//         | loading-access | ready | no-access | error
// "demo" means Supabase is not configured: the app runs without authentication,
// with session-only invented data, and says so. It is never presented as secure.
// Signing out or expiring always drops the persistence handle (and so the loaded data).
const signedOutState = { user: null, profile: null, access: null, persistence: null };

export function createSessionStore({ config, connect = createBrowserAuthGateway } = {}) {
  const settings = config ?? readSupabaseConfig(import.meta.env ?? {});
  return create((set, get) => {
    let gateway = null;
    let client = null;
    let unsubscribe = null;
    let signingOut = false;

    const loadAccess = async user => {
      set({ status: 'loading-access', user, error: null });
      const result = await gateway.loadAccess(user.id);
      if (!result.ok) return set({ status: 'error', error: result.code, profile: null, access: null, persistence: null });
      const access = accessFromPermissions(result.permissions);
      const any = Object.values(access).some(level => level !== 'none');
      const ready = !!result.profile && any;
      set({ status: ready ? 'ready' : 'no-access', profile: result.profile, access,
        persistence: ready && client ? createMilfiPersistence(client, { householdId: result.profile.household_id }) : null });
    };

    return {
      ...(settings.status === 'unconfigured' ? { mode: 'demo', status: 'demo' }
        : settings.status === 'configured' ? { mode: 'auth', status: 'initializing' }
          : { mode: 'auth', status: 'config-error' }),
      error: settings.status === 'invalid' ? settings.reason : null, ...signedOutState,
      async start() {
        if (settings.status !== 'configured' || gateway) return;
        try {
          ({ gateway, client = null } = await connect(settings));
        } catch {
          return set({ status: 'error', error: 'AUTH_CLIENT_UNAVAILABLE' });
        }
        unsubscribe = gateway.onChange((event, user) => {
          if (event === 'SIGNED_OUT') {
            // A sign-out we did not request means the session expired or was revoked.
            set({ ...signedOutState, status: signingOut ? 'signed-out' : 'expired', error: signingOut ? null : 'SESSION_EXPIRED' });
            signingOut = false;
          } else if (event === 'SIGNED_IN' && user && get().user?.id !== user.id) loadAccess(user);
        });
        const session = await gateway.getSession();
        if (!session.ok) return set({ ...signedOutState, status: 'expired', error: session.code });
        if (!session.user) return set({ ...signedOutState, status: 'signed-out' });
        await loadAccess(session.user);
      },
      async signIn(email, password) {
        if (!gateway) return { ok: false, code: 'AUTH_NOT_CONFIGURED' };
        if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) return { ok: false, code: 'MISSING_CREDENTIALS' };
        set({ status: 'signing-in', error: null });
        const result = await gateway.signIn(email.trim(), password);
        if (!result.ok) { set({ ...signedOutState, status: 'signed-out', error: result.code }); return result; }
        await loadAccess(result.user);
        return { ok: true };
      },
      async signOut() {
        if (!gateway) return { ok: false, code: 'AUTH_NOT_CONFIGURED' };
        signingOut = true;
        const result = await gateway.signOut();
        if (!result.ok) signingOut = false;
        set({ ...signedOutState, status: 'signed-out', error: result.ok ? null : result.code });
        return result;
      },
      async changePassword(password) {
        if (!gateway || get().status !== 'ready') return { ok: false, code: 'AUTH_NOT_CONFIGURED' };
        if (typeof password !== 'string' || password.length < 12) return { ok: false, code: 'WEAK_PASSWORD' };
        return gateway.changePassword(password);
      },
      stop() { unsubscribe?.(); unsubscribe = null; },
    };
  });
}

export const useSessionStore = createSessionStore();
