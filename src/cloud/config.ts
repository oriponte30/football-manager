/**
 * Cloud saves (Supabase). Both values are public by design: the anon key only
 * allows what the row-level-security policies allow (each user sees their own save).
 * Leave them empty to run the game offline-only.
 * They can also be set at build time with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
 */
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const SUPABASE_URL: string = env.VITE_SUPABASE_URL || 'https://axpferxzumejzstizixo.supabase.co';
export const SUPABASE_ANON_KEY: string = env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_9JFFsebIEvI7zeQv_ELxUA_GMYFTWEo';

export const cloudConfigured = (): boolean => SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 20;
