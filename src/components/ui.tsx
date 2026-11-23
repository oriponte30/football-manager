import type { ReactNode } from 'react';
import { Star, StarHalf, Frown, Meh, Smile, Flame, Angry, HeartPulse, Cross } from 'lucide-react';
import type { GameState } from '../types/world';
import type { Club } from '../types/club';
import type { Player } from '../types/player';
import { useGameStore } from '../store/useGameStore';
import { moraleLevel, starsFromInternal } from '../engine/ratings';
import { perceivedPA, unscoutedOvrRange } from '../engine/scoutingEngine';
import { MORALE_LABELS } from '../types/player';
import { nationOf } from '../data/nationalities';
import { SEVERITY_LABEL } from '../data/injuries';

export function useGame(): GameState {
  const g = useGameStore((s) => s.game);
  if (!g) throw new Error('No game loaded');
  return g;
}

export function useUserClub(): Club {
  const g = useGame();
  return g.clubs[g.manager.clubId as string];
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span className="inline-flex items-center text-amber-500" title={`${value.toFixed(1)}★`}>
      {Array.from({ length: full }, (_, i) => <Star key={i} size={size} fill="currentColor" strokeWidth={1} />)}
      {half && <StarHalf size={size} fill="currentColor" strokeWidth={1} />}
      {Array.from({ length: 5 - full - (half ? 1 : 0) }, (_, i) => <Star key={`e${i}`} size={size} strokeWidth={1} className="opacity-30" />)}
    </span>
  );
}

export function staffStars(g: GameState, club: Club, role: keyof Club['staff']): number {
  const id = club.staff[role];
  return id && g.staff[id] ? starsFromInternal(g.staff[id].ability) : 1;
}

export function MoraleIcon({ value, size = 16 }: { value: number; size?: number }) {
  const lvl = moraleLevel(value);
  const cls = ['text-red-600', 'text-orange-500', 'text-yellow-600', 'text-green-600', 'text-emerald-500'][lvl];
  const Icon = [Angry, Frown, Meh, Smile, Flame][lvl];
  return <span title={MORALE_LABELS[lvl]} className={cls}><Icon size={size} /></span>;
}

/** Windows can't draw the England/Scotland subdivision emoji, so those two are tiny SVGs. */
const SVG_FLAGS: Record<string, JSX.Element> = {
  ENG: <svg width="18" height="12" viewBox="0 0 18 12" className="inline-block shadow-sm" aria-label="England"><rect width="18" height="12" fill="#fff" /><rect x="7.5" width="3" height="12" fill="#ce1124" /><rect y="4.5" width="18" height="3" fill="#ce1124" /></svg>,
  SCO: <svg width="18" height="12" viewBox="0 0 18 12" className="inline-block shadow-sm" aria-label="Scotland"><rect width="18" height="12" fill="#0065bd" /><path d="M0 0L18 12M18 0L0 12" stroke="#fff" strokeWidth="2.2" /></svg>,
};

export function FlagIcon({ code, emoji }: { code: string; emoji: string }) {
  return SVG_FLAGS[code] ?? <span>{emoji}</span>;
}

/** Flag + 3-letter code (subdivision flags like England/Scotland don't render everywhere). */
export function NationTag({ code, full }: { code: string; full?: boolean }) {
  const n = nationOf(code);
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" title={n.name}>
      {SVG_FLAGS[n.code] ?? <span className="text-base leading-none">{n.flag}</span>}
      <span className="text-[11px] font-mono font-bold tracking-wider border border-current/40 px-[3px] rounded-sm leading-4">{n.code}</span>
      {full && <span>{n.name}</span>}
    </span>
  );
}

/** Red medical badge with weeks remaining. */
export function InjuryBadge({ p, large }: { p: Player; large?: boolean }) {
  if (p.injuryWeeks <= 0) return null;
  const inj = p.injury;
  const label = inj ? `${inj.name} (${SEVERITY_LABEL[inj.severity]}) — out ${p.injuryWeeks} more week${p.injuryWeeks > 1 ? 's' : ''}` : `Injured — out ${p.injuryWeeks} wk`;
  return (
    <span className={`med-badge ${large ? 'med-badge-lg' : ''} ${inj && (inj.severity === 'SERIOUS' || inj.severity === 'SEVERE') ? 'med-serious' : ''}`} title={label}>
      <Cross size={large ? 15 : 11} strokeWidth={3} />
      <span>{p.injuryWeeks}w</span>
      {large && inj && <span className="font-normal">· {inj.name}</span>}
    </span>
  );
}

export function FitnessBar({ value, injured, player }: { value: number; injured?: number; player?: Player }) {
  if (player && player.injuryWeeks > 0) return <InjuryBadge p={player} />;
  if (injured && injured > 0) {
    return <span className="inline-flex items-center gap-1 text-red-600 text-xs" title={`Injured ${injured} wk`}><Cross size={13} />{injured}w</span>;
  }
  const c = value >= 85 ? 'bg-green-600' : value >= 65 ? 'bg-yellow-500' : 'bg-red-600';
  return (
    <span className="inline-flex items-center gap-1" title={`Fitness ${Math.round(value)}%`}>
      <HeartPulse size={12} className="opacity-60" />
      <span className="inline-block w-10 h-2 bg-black/20 rounded-sm overflow-hidden"><span className={`block h-full ${c}`} style={{ width: `${value}%` }} /></span>
    </span>
  );
}

/** Form icon from recent ratings (hidden momentum is not shown directly). */
export function FormDots({ p }: { p: Player }) {
  return (
    <span className="inline-flex gap-[2px]" title={p.streak > 0 ? 'Purple patch!' : p.streak < 0 ? 'Cold streak' : 'Recent ratings'}>
      {p.recentRatings.slice(-5).map((r, i) => (
        <span key={i} className={`inline-block w-2 h-2 rounded-full ${r >= 7.3 ? 'bg-emerald-500' : r >= 6.4 ? 'bg-yellow-500' : 'bg-red-500'}`} />
      ))}
      {p.streak > 0 && <Flame size={12} className="text-purple-600" />}
    </span>
  );
}

export function StatBar({ label, value, range }: { label: string; value?: number; range?: [number, number] }) {
  const lo = range ? range[0] : value ?? 0;
  const hi = range ? range[1] : value ?? 0;
  const color = (v: number) => (v >= 80 ? '#1f7a33' : v >= 65 ? '#5f8f1f' : v >= 50 ? '#b38600' : '#b0322b');
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-24 uppercase tracking-wide">{label}</span>
      <div className="flex-1 h-3 bg-black/10 relative rounded-sm overflow-hidden">
        {range ? (
          <div className="absolute h-full opacity-70" style={{ left: `${lo}%`, width: `${Math.max(1, hi - lo)}%`, background: `repeating-linear-gradient(45deg, ${color(hi)} 0 4px, transparent 4px 7px)` }} />
        ) : (
          <div className="absolute h-full" style={{ width: `${value}%`, background: color(value ?? 0) }} />
        )}
      </div>
      <span className="w-16 text-right font-mono">{range ? `${lo}–${hi}${hi - lo > 12 ? '?' : ''}` : value}</span>
    </div>
  );
}

export function Modal({ children, onClose, wide }: { children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-start justify-center overflow-y-auto p-4 pt-10" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`w-full ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>{children}</div>
    </div>
  );
}

/** What the user's staff "sees" of a player's current ability. */
export function ovrRead(g: GameState, p: Player, userClubId: string): { text: string; exact: boolean; range: [number, number] } {
  if (p.clubId === userClubId || g.pendingYouth.includes(p.id)) return { text: String(p.ca), exact: true, range: [p.ca, p.ca] };
  const rep = g.scoutReports[p.id];
  const r = rep ? rep.ovrRange : unscoutedOvrRange(p);
  return { text: `${r[0]}–${r[1]}`, exact: false, range: r };
}

/** PA read: Head Coach for own squad (Youth Director for prospects), scout report for others. */
export function paRead(g: GameState, p: Player, club: Club): { range: [number, number] | null; staffLabel: string; stars: number } {
  if (p.clubId === club.id || g.pendingYouth.includes(p.id)) {
    const role = g.pendingYouth.includes(p.id) ? 'YOUTH_DIRECTOR' : 'HEAD_COACH';
    const sid = club.staff[role];
    const stars = sid ? starsFromInternal(g.staff[sid].ability) : 1;
    const r = perceivedPA(p, stars, sid ?? 'none');
    return { range: [r.low, r.high], staffLabel: role === 'HEAD_COACH' ? 'Head Coach' : 'Youth Director', stars };
  }
  const rep = g.scoutReports[p.id];
  if (rep) return { range: rep.paRange, staffLabel: 'Chief Scout', stars: rep.staffStars };
  return { range: null, staffLabel: 'Unscouted', stars: 0 };
}

export function posColor(pos: string): string {
  if (pos === 'GK') return 'bg-yellow-500 text-black';
  if (pos === 'CB' || pos === 'LB' || pos === 'RB') return 'bg-blue-700 text-white';
  if (pos === 'CDM' || pos === 'CM' || pos === 'CAM') return 'bg-green-700 text-white';
  return 'bg-red-700 text-white';
}

export function PosTag({ pos }: { pos: string }) {
  return <span className={`inline-block text-[11px] leading-4 px-1 rounded-sm font-mono ${posColor(pos)}`}>{pos}</span>;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
