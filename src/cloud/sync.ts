/**
 * Cloud sync: one save per account in the `saves` table.
 * - Signs in with email + password (Supabase auth).
 * - Uploads the career a few seconds after it changes, and right away when the
 *   tab is hidden (phone locked, app switched).
 * - On login / app open, pulls the cloud career if it is newer. If both this
 *   device and the cloud changed separately, asks which one to keep.
 */
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase, setRememberDevice } from './client';
import { useGameStore } from '../store/useGameStore';
import { SAVE_VERSION } from '../engine/worldGenerator';
import { warmUpEngine } from '../engine/seasonLoop';
import type { GameState } from '../types/world';
import { encode, summarize, hasCareer, type SaveSummary } from './pack';
import { decode } from './pack';

export type SyncStatus = 'off' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error';

interface Conflict {
  local: SaveSummary;
  cloud: SaveSummary;
  cloudAt: number;
  localAt: number;
}

interface CloudStore {
  status: SyncStatus;
  email: string | null;
  lastSync: number | null;
  message: string | null;
  accountOpen: boolean;
  conflict: Conflict | null;
  /** arrived from a password-reset email: ask for a new password */
  recovery: boolean;
  setAccountOpen(v: boolean): void;
}

export const useCloud = create<CloudStore>((set) => ({
  status: supabase ? 'signed-out' : 'off',
  email: null,
  lastSync: null,
  message: null,
  accountOpen: false,
  conflict: null,
  recovery: false,
  setAccountOpen: (v) => set({ accountOpen: v }),
}));

// ---------- local bookkeeping ----------

interface Meta { savedAt: number; syncedAt: number; userId: string | null }
const META_KEY = 'rdfc-cloud-meta';

function readMeta(): Meta {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) || 'null') as Meta | null;
    if (m) return m;
  } catch { /* ignore */ }
  return { savedAt: 0, syncedAt: 0, userId: null };
}
function writeMeta(patch: Partial<Meta>): Meta {
  const m = { ...readMeta(), ...patch };
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* ignore */ }
  return m;
}

// ---------- core ----------

let userId: string | null = null;
let applyingRemote = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushing: Promise<void> | null = null;

function setStatus(status: SyncStatus, message: string | null = null): void {
  useCloud.setState({ status, message });
}

function failed(e: unknown): void {
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  setStatus(offline ? 'offline' : 'error', offline ? 'Offline. Will sync when you are back online.' : `Sync failed: ${(e as Error)?.message ?? e}`);
}

async function push(): Promise<void> {
  if (!supabase || !userId) return;
  if (useCloud.getState().conflict) return;
  const g = useGameStore.getState().game;
  if (!g || !hasCareer(g)) { // never overwrite a cloud career with an empty one
    setStatus('synced', 'Nothing to save yet. Accept a job offer to start a career first.');
    return;
  }
  const startedAt = Date.now();
  setStatus('syncing');
  try {
    const data = await encode(g);
    const { error } = await supabase.from('saves').upsert({ user_id: userId, data, summary: summarize(g), updated_at: new Date(startedAt).toISOString() });
    if (error) throw error;
    writeMeta({ syncedAt: startedAt, userId });
    useCloud.setState({ lastSync: startedAt });
    setStatus('synced', 'Saved to the cloud.');
  } catch (e) { failed(e); }
}

export function pushNow(): Promise<void> {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  pushing = (pushing ?? Promise.resolve()).then(push);
  return pushing;
}

function schedulePush(delay = 5000): void {
  if (!userId) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; void pushNow(); }, delay);
}

function loadIntoGame(g: GameState): void {
  applyingRemote = true;
  useGameStore.setState({ game: g, screen: 'MATCHDAY', dossierId: null, faxOpen: false, faxFocusId: null, newsOpen: false });
  applyingRemote = false;
  setTimeout(() => warmUpEngine(g), 0);
}

async function download(): Promise<GameState | null> {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.from('saves').select('data').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return decode((data as { data: string }).data);
}

/** Compare this device with the cloud and do the sensible thing. */
export async function reconcile(): Promise<void> {
  if (!supabase || !userId) return;
  setStatus('syncing');
  try {
    const { data: row, error } = await supabase.from('saves').select('summary, updated_at').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    const local = hasCareer(useGameStore.getState().game) ? useGameStore.getState().game : null;
    let meta = readMeta();
    if (meta.userId !== userId) meta = writeMeta({ userId, syncedAt: 0, savedAt: local ? Math.max(meta.savedAt, 1) : 0 });
    const cloudSummary = row?.summary as SaveSummary | undefined;
    const cloudUsable = !!row && cloudSummary?.saveVersion === SAVE_VERSION;

    if (!cloudUsable) {
      if (local) await pushNow();
      else setStatus('synced', row ? 'Your cloud save is from an older version of the game and cannot be loaded.' : null);
      return;
    }
    const cloudAt = Date.parse(row!.updated_at as string);
    const cloudChanged = cloudAt > meta.syncedAt + 1000;
    const localChanged = !!local && meta.savedAt > meta.syncedAt;

    if (!local || (cloudChanged && !localChanged)) {
      const g = await download();
      if (g && g.saveVersion === SAVE_VERSION) {
        loadIntoGame(g);
        writeMeta({ syncedAt: cloudAt, savedAt: cloudAt, userId });
        useCloud.setState({ lastSync: Date.now() });
        setStatus('synced', 'Career loaded from the cloud.');
      } else setStatus('synced');
      return;
    }
    if (cloudChanged && localChanged) {
      useCloud.setState({ conflict: { local: summarize(local), cloud: cloudSummary!, cloudAt, localAt: meta.savedAt } });
      setStatus('synced', 'Two different careers found. Pick one.');
      return;
    }
    if (localChanged) await pushNow();
    else { useCloud.setState({ lastSync: Date.now() }); setStatus('synced'); }
  } catch (e) { failed(e); }
}

export async function resolveConflict(keep: 'cloud' | 'local'): Promise<void> {
  const c = useCloud.getState().conflict;
  if (!c) return;
  useCloud.setState({ conflict: null });
  if (keep === 'local') { await pushNow(); return; }
  setStatus('syncing');
  try {
    const g = await download();
    if (g) {
      loadIntoGame(g);
      writeMeta({ syncedAt: c.cloudAt, savedAt: c.cloudAt, userId });
      useCloud.setState({ lastSync: Date.now() });
    }
    setStatus('synced', 'Career loaded from the cloud.');
  } catch (e) { failed(e); }
}

function onSession(session: Session | null): void {
  const next = session?.user?.id ?? null;
  const changed = next !== userId;
  userId = next;
  useCloud.setState({ email: session?.user?.email ?? null });
  if (!userId) { setStatus('signed-out'); return; }
  if (changed) void reconcile();
}

// ---------- account actions ----------

export async function signIn(email: string, password: string, remember: boolean): Promise<string | null> {
  if (!supabase) return 'Cloud saves are not set up.';
  setRememberDevice(remember);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? friendly(error.message) : null;
}

export async function signUp(email: string, password: string, remember: boolean): Promise<{ error: string | null; confirm: boolean }> {
  if (!supabase) return { error: 'Cloud saves are not set up.', confirm: false };
  setRememberDevice(remember);
  const redirect = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined;
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
  if (error) return { error: friendly(error.message), confirm: false };
  return { error: null, confirm: !data.session };
}

export async function resetPassword(email: string): Promise<string | null> {
  if (!supabase) return 'Cloud saves are not set up.';
  const redirect = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect });
  return error ? friendly(error.message) : null;
}

export async function updatePassword(password: string): Promise<string | null> {
  if (!supabase) return 'Cloud saves are not set up.';
  const { error } = await supabase.auth.updateUser({ password });
  if (!error) useCloud.setState({ recovery: false });
  return error ? friendly(error.message) : null;
}

export async function signOut(clearLocal: boolean): Promise<void> {
  if (!supabase) return;
  if (userId && readMeta().savedAt > readMeta().syncedAt) await pushNow();
  await supabase.auth.signOut();
  if (clearLocal) {
    applyingRemote = true;
    useGameStore.setState({ game: null });
    applyingRemote = false;
    writeMeta({ savedAt: 0, syncedAt: 0, userId: null });
  }
  useCloud.setState({ lastSync: null, conflict: null });
}

function friendly(msg: string): string {
  if (/invalid login/i.test(msg)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(msg)) return 'Confirm your email first (check your inbox), then log in.';
  if (/already registered/i.test(msg)) return 'That email already has an account. Log in instead.';
  if (/password should be/i.test(msg)) return 'Password must be at least 6 characters.';
  return msg;
}

// ---------- wiring ----------

let started = false;
export function startCloud(): void {
  if (started || !supabase) return;
  started = true;

  // mark local changes and upload them a few seconds later
  useGameStore.subscribe((s, prev) => {
    if (s.game === prev.game || applyingRemote) return;
    writeMeta({ savedAt: Date.now() });
    if (!hasCareer(s.game)) return;
    schedulePush(s.simming ? 8000 : 4000);
  });

  supabase.auth.getSession().then(({ data }) => onSession(data.session));
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') useCloud.setState({ accountOpen: true, recovery: true });
    onSession(session);
  });

  const flush = () => { if (userId && readMeta().savedAt > readMeta().syncedAt) void pushNow(); };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
    else if (userId && !pushTimer) void reconcile(); // pick up progress made on another device
  });
  window.addEventListener('pagehide', flush);
  window.addEventListener('online', () => { if (userId) void reconcile(); });
}
