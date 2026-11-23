/**
 * Fog of war. Perceived PA is OFFSET from true PA by a stable, staff-specific
 * bias, so averaging the displayed range never reveals true PA.
 */
import type { GameState } from '../types/world';
import type { Player, PerceivedPA, StatKey, Trait } from '../types/player';
import type { ScoutReport } from '../types/transfers';
import { OUTFIELD_STATS, GK_STATS } from '../types/player';
import { clamp, hash01 } from './rng';
import { starsFromInternal, avgRating } from './ratings';
import { nextId } from './ids';

/** PA half-width: 1★ ±6, 3★ ±4, 5★ ±2 (interpolated), narrowing by 24–25. */
export function paHalfWidth(stars: number, age: number): number {
  const s = clamp(stars, 1, 5);
  let hw = 6 - (s - 1);
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

/** Scout-report stat half-width: 1★ ±6 ("62–74"), 5★ ±1 (crisp "71–73"). */
export function statHalfWidth(stars: number): number {
  const s = clamp(stars, 1, 5);
  return 6 - (s - 1) * 1.25;
}

/** Newspaper guess for players nobody has scouted: wide on purpose (~±11). */
export function fogStatRange(value: number, seed: number, key: string): [number, number] {
  return rangeAround(value, seed, key, 11);
}

export function statRange(value: number, seed: number, key: string, stars: number): [number, number] {
  return rangeAround(value, seed, key, statHalfWidth(stars));
}

function rangeAround(value: number, seed: number, key: string, hw: number): [number, number] {
  const bias = (hash01(seed, key) - 0.5) * 2 * hw * 0.6;
  const c = value + bias;
  return [clamp(Math.round(c - hw), 1, 99), clamp(Math.round(c + hw), 1, 99)];
}

/** Rough read for unscouted players (market listing). */
export function unscoutedOvrRange(p: Player): [number, number] {
  return fogStatRange(p.ca, p.paSeed, 'market-ovr');
}

/** Even a poor scout spots one trait; a decent one half; a good one all. */
export function revealedTraitCount(stars: number, total: number): number {
  if (stars >= 4) return total;
  if (stars >= 2.5) return Math.min(total, Math.max(1, Math.ceil(total / 2)));
  return Math.min(1, total);
}

const NOTE_LABEL: Record<StatKey, string> = {
  pace: 'pace', shooting: 'finishing', passing: 'passing', dribbling: 'dribbling', defending: 'defending',
  physical: 'physicality', reflexes: 'reflexes', handling: 'handling', positioning: 'positioning', kicking: 'distribution',
};

/** Plain-language notes every report carries, whatever the scout's level. */
function scoutNotes(p: Player, statRanges: Partial<Record<StatKey, [number, number]>>, stars: number): string[] {
  const read = (Object.entries(statRanges) as [StatKey, [number, number]][])
    .map(([k, r]) => [k, (r[0] + r[1]) / 2] as const)
    .sort((a, b) => b[1] - a[1]);
  const notes: string[] = [];
  const best = read.slice(0, stars >= 3 ? 2 : 1).map(([k]) => NOTE_LABEL[k] ?? k);
  notes.push(`Best at: ${best.join(' and ')}.`);
  notes.push(`Weak spot: ${NOTE_LABEL[read[read.length - 1][0]] ?? read[read.length - 1][0]}.`);
  const fit = p.injuryWeeks > 0 ? `Currently injured (${p.injuryWeeks} wk).` : p.fitness >= 85 ? 'Fit and sharp.' : p.fitness >= 65 ? 'Fitness is OK, not at his peak.' : 'Looks short of fitness.';
  notes.push(fit);
  notes.push(p.moraleValue >= 70 ? 'Happy where he is. Will be harder to prise away.' : p.moraleValue >= 45 ? 'Settled enough, could be tempted.' : 'Unsettled. Might fancy a move.');
  const apps = p.season.apps;
  if (apps === 0) notes.push('Barely playing this season.');
  else notes.push(`${apps} apps this season, ${avgRating(p).toFixed(1)} average rating.`);
  if (p.age <= 21) notes.push('Still growing into his game.');
  else if (p.age >= 31) notes.push('Past his best years, will start to fade.');
  else if (p.age >= 27) notes.push('At his peak now.');
  if (p.contract.yearsLeft <= 1 && p.clubId) notes.push('Contract nearly up. Should come cheaper.');
  return notes;
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
  const notes = scoutNotes(p, statRanges, stars);
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
    notes,
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
