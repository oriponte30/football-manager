import { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, X, UserRound, AlertTriangle } from 'lucide-react';
import { Modal } from '../ui';
import { rememberDevice } from '../../cloud/client';
import { cloudConfigured } from '../../cloud/config';
import {
  useCloud, startCloud, signIn, signUp, signOut, resetPassword, updatePassword, pushNow, reconcile, resolveConflict,
} from '../../cloud/sync';
import type { SaveSummary } from '../../cloud/pack';

/** Mounted once at the app root: starts sync and hosts the account + conflict pop-ups. */
export default function CloudLayer() {
  const { accountOpen, conflict } = useCloud();
  useEffect(() => { startCloud(); }, []);
  return (
    <>
      {accountOpen && <AccountModal />}
      {conflict && <ConflictModal />}
    </>
  );
}

function ago(t: number | null): string {
  if (!t) return 'not yet';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(t).toLocaleString();
}

/** Header button: shows sync state, opens the account card. */
export function CloudButton({ compact }: { compact?: boolean }) {
  const { status, email, setAccountOpen } = useCloud();
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(i); }, []);
  const label = status === 'off' ? 'Saved on this device only'
    : status === 'signed-out' ? 'Log in to save to the cloud'
      : status === 'syncing' ? 'Saving to the cloud…'
        : status === 'synced' ? `Cloud save · ${email}`
          : status === 'offline' ? 'Offline: will sync later' : 'Cloud sync problem';
  const Icon = status === 'syncing' ? RefreshCw : status === 'synced' ? Cloud : status === 'error' ? AlertTriangle : status === 'off' ? CloudOff : status === 'offline' ? CloudOff : UserRound;
  const color = status === 'synced' ? 'text-green-300' : status === 'syncing' ? 'text-amber-300' : status === 'error' ? 'text-red-400' : 'text-[#d9cfae]';
  return (
    <button className={`pb-2 flex items-center gap-1 ${color}`} title={label} onClick={() => setAccountOpen(true)}>
      <Icon size={18} className={status === 'syncing' ? 'animate-spin' : ''} />
      {!compact && status === 'signed-out' && <span className="text-xs font-mono">LOG IN</span>}
    </button>
  );
}

function AccountModal() {
  const { status, email, lastSync, message, recovery, setAccountOpen } = useCloud();
  const close = () => setAccountOpen(false);
  return (
    <Modal onClose={close}>
      <div className="paper p-5 relative max-w-md mx-auto">
        <button className="absolute top-2 right-2 btn btn-sm" onClick={close}><X size={16} /></button>
        <div className="text-xs uppercase tracking-widest opacity-60">Manager's account</div>
        {!cloudConfigured() ? (
          <div className="mt-3 text-sm">Cloud saves aren't switched on for this copy of the game yet. Your career is saved in this browser only.</div>
        ) : recovery ? <NewPassword /> : email ? (
          <SignedIn email={email} status={status} lastSync={lastSync} message={message} />
        ) : <SignInForm message={message} />}
      </div>
    </Modal>
  );
}

function SignInForm({ message }: { message: string | null }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [emailV, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [remember, setRemember] = useState(rememberDevice());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(message);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setNote(null); setBusy(true);
    const em = emailV.trim();
    if (mode === 'login') {
      const r = await signIn(em, pw, remember);
      if (r) setErr(r);
    } else if (mode === 'signup') {
      const r = await signUp(em, pw, remember);
      if (r.error) setErr(r.error);
      else if (r.confirm) { setNote('Account created. Check your inbox for a confirmation link, then log in here.'); setMode('login'); }
    } else {
      const r = await resetPassword(em);
      if (r) setErr(r); else setNote('If that email has an account, a reset link is on its way.');
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="mt-2">
      <div className="text-2xl font-bold">{mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create an account' : 'Reset password'}</div>
      <div className="text-sm opacity-80 mt-1">Your career is saved to your account, so you can carry on from your phone or any other computer.</div>
      <label className="block mt-3">
        <span className="text-sm">Email</span>
        <input className="desk-input w-full mt-1" type="email" autoComplete="email" required value={emailV} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {mode !== 'reset' && (
        <label className="block mt-2">
          <span className="text-sm">Password</span>
          <input className="desk-input w-full mt-1" type="password" minLength={6} required autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
      )}
      {mode !== 'reset' && (
        <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="w-4 h-4" />
          Remember this device
          <span className="opacity-60 text-xs">(untick on a shared computer)</span>
        </label>
      )}
      {err && <div className="mt-3 text-sm text-red-800 font-bold">{err}</div>}
      {note && <div className="mt-3 text-sm text-green-900">{note}</div>}
      <button className="btn btn-green w-full mt-4 text-xl" disabled={busy}>
        {busy ? '…' : mode === 'login' ? 'LOG IN' : mode === 'signup' ? 'CREATE ACCOUNT' : 'SEND RESET LINK'}
      </button>
      <div className="flex justify-between mt-3 text-sm">
        {mode === 'login'
          ? <button type="button" className="underline" onClick={() => setMode('signup')}>New here? Create an account</button>
          : <button type="button" className="underline" onClick={() => setMode('login')}>Have an account? Log in</button>}
        {mode === 'login' && <button type="button" className="underline opacity-70" onClick={() => setMode('reset')}>Forgot password?</button>}
      </div>
    </form>
  );
}

function SignedIn({ email, status, lastSync, message }: { email: string; status: string; lastSync: number | null; message: string | null }) {
  const [clear, setClear] = useState(!rememberDevice());
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-2">
      <div className="text-2xl font-bold flex items-center gap-2"><Cloud size={22} /> Cloud save on</div>
      <div className="text-sm mt-1">Logged in as <b>{email}</b></div>
      <div className="text-sm mt-1">Last saved to the cloud: <b>{ago(lastSync)}</b>{status === 'syncing' ? ' · saving now…' : ''}</div>
      {status === 'offline' && <div className="text-sm text-amber-900 mt-1">You're offline. Progress is kept here and uploads when you reconnect.</div>}
      {message && <div className={`text-sm mt-2 ${status === 'error' ? 'text-red-800' : 'text-green-900'}`}>{message}</div>}
      <div className="text-xs opacity-70 mt-2">Saves upload a few seconds after each change and whenever you leave the game. On another device, log in with the same email to carry on.</div>
      <div className="flex gap-2 mt-4 flex-wrap">
        <button className="btn btn-amber" disabled={busy} onClick={async () => { setBusy(true); await pushNow(); setBusy(false); }}>SAVE NOW</button>
        <button className="btn" disabled={busy} onClick={async () => { setBusy(true); await reconcile(); setBusy(false); }}>CHECK FOR NEWER SAVE</button>
      </div>
      <div className="border-t border-dashed border-black/30 mt-4 pt-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={clear} onChange={(e) => setClear(e.target.checked)} className="w-4 h-4" />
          Also remove the career from this device
        </label>
        <button className="btn btn-red mt-2" disabled={busy} onClick={async () => { setBusy(true); await signOut(clear); setBusy(false); }}>LOG OUT</button>
      </div>
    </div>
  );
}

function NewPassword() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (done) return <div className="mt-3 text-green-900">Password changed. You're logged in.</div>;
  return (
    <form className="mt-2" onSubmit={async (e) => { e.preventDefault(); const r = await updatePassword(pw); if (r) setErr(r); else setDone(true); }}>
      <div className="text-2xl font-bold">Choose a new password</div>
      <input className="desk-input w-full mt-3" type="password" minLength={6} required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      {err && <div className="mt-2 text-sm text-red-800">{err}</div>}
      <button className="btn btn-green w-full mt-3">SAVE PASSWORD</button>
    </form>
  );
}

function Career({ title, s, at }: { title: string; s: SaveSummary; at: number }) {
  return (
    <div className="border-2 border-[#6e6550] bg-[#fffbe9] rounded p-3">
      <div className="text-xs uppercase tracking-widest opacity-60">{title}</div>
      <div className="font-bold text-lg">{s.club}</div>
      <div className="text-sm">{s.manager} · season {s.season} · MW {Math.min(30, s.matchweek)}</div>
      <div className="text-xs opacity-70">last played {ago(at)}</div>
    </div>
  );
}

function ConflictModal() {
  const c = useCloud((s) => s.conflict)!;
  return (
    <Modal onClose={() => { /* must choose */ }}>
      <div className="paper p-5 max-w-lg mx-auto">
        <div className="text-2xl font-bold">Which career do you want?</div>
        <div className="text-sm mt-1">This device and your account have different progress. The one you don't pick is overwritten.</div>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <Career title="On your account" s={c.cloud} at={c.cloudAt} />
          <Career title="On this device" s={c.local} at={c.localAt} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <button className="btn btn-green" onClick={() => resolveConflict('cloud')}>LOAD ACCOUNT SAVE</button>
          <button className="btn btn-amber" onClick={() => resolveConflict('local')}>KEEP THIS DEVICE'S</button>
        </div>
      </div>
    </Modal>
  );
}
