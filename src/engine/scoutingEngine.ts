/**
 * Fog of war. Perceived PA is OFFSET from true PA by a stable, staff-specific
 * bias, so averaging the displayed range never reveals true PA.
 */
import type { GameState } from '../types/world';
import type { Player, PerceivedPA, StatKey, Trait } from '../types/player';
import type { ScoutReport } from '../types/transfers';
import { OUTFIELD_STATS, GK_STATS } from '../types/player';
import { clamp, hash01 } from './rng';
import { starsFromInternal } from './ratings';
import { nextId } from './ids';

/** PA half-width: 1★ ±10, 3★ ±5, 5★ ±2 (interpolated), narrowing by 24–25. */
export function paHalfWidth(stars: number, age: number): number {
  const s = clamp(stars, 1, 5);
  let hw = s <= 3 ? 10 - (s - 1) * 2.5 : 5 - (s - 3) * 1.5;
  if (age >= 25) hw *= 0.4;
  else if (age >= 24) hw *= 0.6;
  else if (age >= 22) hw *= 0.85;
  return Math.max(1, hw);
}

export function perceivedPA(p: Player, staffStars: number, staffId: string): PerceivedPA {
  const hw = paHalfWidth(staffStars, p.age);
  const bias = (hash01(p.paSeed, `pa:${staffId}`) - 0.5) * 2 * hw * 0.8;
  const center = p.truePA + bias;
  let low = Math.round(center - hw);
  let high = Math.round(center + hw);
  low = clamp(Math.max(low, p.ca), 1, 99);
  high = clamp(Math.max(high, low + 1), 1, 99);
  return { low, high, staffStars };
}

/** Stat half-width: 1★ ±12 (messy "58–82?"), 5★ ±1.5 (crisp "71–74"). */
export function statHalfWidth(stars: number): number {
  const s = clamp(stars, 1, 5);
  return 12 - (s - 1) * 2.625;
}

export function statRange(value: number, seed: number, key: string, stars: number): [number, number] {
  const hw = statHalfWidth(stars);
  const bias = (hash01(seed, key) - 0.5) * 2 * hw * 0.6;
  const c = value + bias;
  return [clamp(Math.round(c - hw), 1, 99), clamp(Math.round(c + hw), 1, 99)];
}

/** Rough read for unscouted players (market listing). */
export function unscoutedOvrRange(p: Player): [number, number] {
  return statRange(p.ca, p.paSeed, 'market-ovr', 1.4);
}

export function revealedTraitCount(stars: number, total: number): number {
  if (stars >= 4) return total;
  if (stars >= 2.5) return Math.min(1, total);
  return 0;
}

export function generateScoutReport(g: GameState, p: Player, scoutId: string | null): ScoutReport {
  const scout = scoutId ? g.staff[scoutId] : undefined;
  const stars = scout ? starsFromInternal(scout.ability) : 1;
  const sid = scout?.id ?? 'none';
  const keys: StatKey[] = p.position === 'GK' ? GK_STATS : OUTFIELD_STATS;
  const statRanges: Partial<Record<StatKey, [number, number]>> = {};
  for (const k of keys) statRanges[k] = statRange(p.stats[k], p.paSeed, `${sid}:${k}`, stars);
  const ovrRange = statRange(p.ca, p.paSeed, `${sid}:ovr`, stars);
  const pa = perceivedPA(p, stars, sid);
  const reveal = revealedTraitCount(stars, p.traits.length);
  const revealedTraits: Trait[] = p.traits.slice(0, reveal);
  const midOvr = (ovrRange[0] + ovrRange[1]) / 2;
  const midPa = (pa.low + pa.high) / 2;
  let verdict: string;
  if (midPa - midOvr >= 12 && p.age <= 21) verdict = 'One for the future. Could be special.';
  else if (midOvr >= 75) verdict = 'Top-drawer. Would walk into most sides.';
  else if (midOvr >= 65) verdict = 'Solid professional. Reliable starter level.';
  else if (midOvr >= 55) verdict = 'Squad player. Does a job in the lower leagues.';
  else verdict = 'Not convinced. Lacks the level.';
  return {
    playerId: p.id,
    staffStars: stars,
    season: g.season.year,
    week: g.season.matchweek,
    statRanges,
    ovrRange,
    paRange: [pa.low, pa.high],
    revealedTraits,
    hiddenTraitCount: p.traits.length - reveal,
    verdict,
    clarity: (stars - 1) / 4,
  };
}

export function scoutTurnaround(stars: number): number {
  return stars >= 3 ? 1 : 2;
}

export function assignScout(g: GameState, clubId: string, playerId: string): { ok: boolean; message: string } {
  if (g.scouting.some((s) => s.playerId === playerId)) return { ok: false, message: 'Already being scouted.' };
  const club = g.clubs[clubId];
  const scoutId = club.staff.CHIEF_SCOUT;
  const stars = scoutId ? starsFromInternal(g.staff[scoutId].ability) : 1;
  const weeks = scoutTurnaround(stars);
  const readyWeek = g.season.matchweek + weeks - 1;
  g.scouting.push({ id: nextId(g, 'sa'), playerId, readyWeek, readySeason: g.season.year });
  return { ok: true, message: `Scout dispatched. Report due in ${weeks} week${weeks > 1 ? 's' : ''}.` };
}
