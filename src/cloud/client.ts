import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, cloudConfigured } from './config';

const REMEMBER_KEY = 'rdfc-remember-device';

export function rememberDevice(): boolean {
  try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch { return true; }
}
export function setRememberDevice(v: boolean): void {
  try { localStorage.setItem(REMEMBER_KEY, v ? '1' : '0'); } catch { /* ignore */ }
}

function store(kind: 'local' | 'session'): Storage | null {
  try { return kind === 'local' ? localStorage : sessionStorage; } catch { return null; }
}

/**
 * "Remember this device": the login lives in localStorage (survives closing the
 * browser). Unticked, it lives in sessionStorage and ends with the tab.
 */
const authStorage = {
  getItem: (k: string) => store('session')?.getItem(k) ?? store('local')?.getItem(k) ?? null,
  setItem: (k: string, v: string) => {
    const keep = rememberDevice();
    try {
      (keep ? store('local') : store('session'))?.setItem(k, v);
      (keep ? store('session') : store('local'))?.removeItem(k);
    } catch { /* storage full: the session just won't persist */ }
  },
  removeItem: (k: string) => {
    store('local')?.removeItem(k);
    store('session')?.removeItem(k);
  },
};

export const supabase: SupabaseClient | null = cloudConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storage: authStorage, storageKey: 'rdfc-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  : null;
