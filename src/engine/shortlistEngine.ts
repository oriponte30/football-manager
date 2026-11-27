/**
 * The scouting department's standing shortlist. Refreshed every four weeks
 * (and at the start of each window). A better Chief Scout finds more names,
 * finds them closer to what you need, and turns up hidden gems.
 */
import type { CountryCode, GameState } from '../types/world';
import type { Player, Position } from '../types/player';
import { COUNTRIES } from '../data/countries';
import { POSITION_GROUP } from '../data/formations';
import { staffStarsOf } from './staffGenerator';
import { avgCa, valuePlayer } from './transferEngine';
import type { Rng } from './rng';

const REFRESH_WEEKS = 4;

/* ---------------- the scout's brief ---------------- */

export type BriefLevel = 'BROAD' | 'BUNDLE' | 'EXACT';
export interface BriefOption { id: string; label: string; positions: Position[] | null; level: BriefLevel }

const ALL_POS: Position[] = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST'];
export const BRIEF_OPTIONS: BriefOption[] = [
  { id: 'ANY', label: 'Anyone who improves us', positions: null, level: 'BROAD' },
  { id: 'DEFENSIVE', label: 'Defensive players', positions: ['GK', 'CB', 'LB', 'RB', 'CDM'], level: 'BROAD' },
  { id: 'ATTACKING', label: 'Attacking players', positions: ['CM', 'CAM', 'LW', 'RW', 'ST'], level: 'BROAD' },
  { id: 'B_GKCB', label: 'Keepers & centre-backs', positions: ['GK', 'CB'], level: 'BUNDLE' },
  { id: 'B_FULL', label: 'Full-backs & wide men', positions: ['LB', 'RB', 'LW', 'RW'], level: 'BUNDLE' },
  { id: 'B_MID', label: 'Central midfielders', positions: ['CDM', 'CM', 'CAM'], level: 'BUNDLE' },
  { id: 'B_FWD', label: 'Forwards', positions: ['ST', 'LW', 'RW', 'CAM'], level: 'BUNDLE' },
  ...ALL_POS.map((pos): BriefOption => ({ id: `POS:${pos}`, label: pos, positions: [pos], level: 'EXACT' })),
];

/** 1–2★ can only be told "defence" or "attack"; 2.5–3.5★ take bundles; 4★+ hunt a single position. */
export function briefLevelFor(stars: number): BriefLevel {
  return stars >= 4 ? 'EXACT' : stars >= 2.5 ? 'BUNDLE' : 'BROAD';
}
const RANK: Record<BriefLevel, number> = { BROAD: 0, BUNDLE: 1, EXACT: 2 };
export function briefOptionsFor(stars: number): BriefOption[] {
  const lvl = RANK[briefLevelFor(stars)];
  return BRIEF_OPTIONS.filter((o) => RANK[o.level] <= lvl);
}

/** The brief in force, downgraded to "anyone" if the current scout can't work to it. */
export function currentBrief(g: GameState): { focus: BriefOption; country: CountryCode | 'ANY' } {
  const userId = g.manager.clubId;
  const stars = userId ? staffStarsOf(g, userId, 'CHIEF_SCOUT') : 1;
  const b = g.scoutBrief;
  const allowed = briefOptionsFor(stars);
  const focus = allowed.find((o) => o.id === b?.focus) ?? allowed[0];
  return { focus, country: b?.country ?? g.activeCountry };
}

export function setScoutBrief(g: GameState, focus: string, country: CountryCode | 'ANY'): { ok: boolean; message: string } {
  const userId = g.manager.clubId;
  if (!userId) return { ok: false, message: 'No club.' };
  const stars = staffStarsOf(g, userId, 'CHIEF_SCOUT');
  if (!briefOptionsFor(stars).some((o) => o.id === focus)) return { ok: false, message: 'Your scout can\'t work to a brief that precise.' };
  g.scoutBrief = { focus, country };
  // he sets off now; the new names come back after the next matchweek
  g.shortlist = { ...g.shortlist, week: -99 };
  const opt = BRIEF_OPTIONS.find((o) => o.id === focus)!;
  const where = country === 'ANY' ? 'all over Europe' : country === g.activeCountry ? 'at home' : `in ${COUNTRIES[country].name}`;
  return { ok: true, message: `Scout briefed: ${opt.label.toLowerCase()}, ${where}. New names after the next matchweek.` };
}

export function shortlistStale(g: GameState): boolean {
  const s = g.shortlist;
  if (!s || s.ids.length === 0) return true;
  if (s.year !== g.season.year) return true;
  return g.season.matchweek - s.week >= REFRESH_WEEKS;
}

export function refreshShortlist(g: GameState, rng: Rng, force = false): void {
  const userId = g.manager.clubId;
  if (!userId) return;
  if (!force && !shortlistStale(g)) return;
  const club = g.clubs[userId];
  const stars = staffStarsOf(g, userId, 'CHIEF_SCOUT');
  const avg = avgCa(g, club);
  const size = Math.round(3 + stars * 1.3); // 4 (1★) .. 10 (5★)
  // weakest position group gets priority
  const grpCount: Record<string, number[]> = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const id of club.playerIds) {
    const p = g.players[id];
    if (p) (grpCount[POSITION_GROUP[p.position]] ??= []).push(p.ca);
  }
  const grpStrength = (grp: string) => {
    const arr = (grpCount[grp] ?? []).sort((a, b) => b - a).slice(0, grp === 'GK' ? 1 : 3);
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  };
  const brief = currentBrief(g);
  const wanted = brief.focus.positions ? new Set(brief.focus.positions) : null;
  const country = brief.country;
  const need = wanted ? '' : Object.keys(grpCount).sort((a, b) => grpStrength(a) - grpStrength(b))[0];
  // poorer scouts are noisier about quality
  const noise = (6 - stars) * 2.2 + (country !== club.country && stars < 3 ? 3 : 0);
  // a narrow brief means looking a little wider on quality
  const lo = avg - (wanted ? 6 : 3);
  const hi = avg + 3 + stars * 1.8 + (wanted ? 2 : 0);
  type Bucket = 'YOUNG' | 'MID' | 'VET';
  const scored: { p: Player; score: number; note: string; bucket: Bucket }[] = [];
  const consider = (p: Player) => {
    if (p.clubId === userId || p.loanFromClubId || p.injuryWeeks > 3) return;
    if (wanted && !wanted.has(p.position)) return;
    const seller = p.clubId ? g.clubs[p.clubId] : null;
    if (seller && seller.reputation > club.reputation + 30) return; // out of reach
    const bucket: Bucket = p.age <= 22 ? 'YOUNG' : p.age <= 28 ? 'MID' : 'VET';
    const perceived = p.ca + (rng.next() - 0.5) * noise;
    // youngsters are judged on where they are heading, not just where they are
    const perceivedPA = p.truePA + (rng.next() - 0.5) * noise;
    const projected = bucket === 'YOUNG' ? perceived + Math.max(0, perceivedPA - perceived) * 0.55 : perceived;
    const gem = bucket === 'YOUNG' && p.truePA >= avg + 10 && stars >= 3;
    if (bucket === 'YOUNG') { if (!gem && (projected < lo || perceived < avg - 14 || projected > hi + 4)) return; }
    else if (perceived < lo || perceived > hi) return;
    const value = valuePlayer(p);
    if (seller && value * 1.6 > Math.max(club.finances.bank, 75_000) && !gem) return; // must be able to pay roughly the asking price
    const grp = POSITION_GROUP[p.position];
    const groupNow = grpStrength(grp);
    const lift = projected - groupNow; // does he actually improve that part of the team?
    if (bucket !== 'YOUNG' && lift < -2 && grp !== need) return;
    let score = 10 - Math.abs(projected - (avg + 4)) + Math.min(6, Math.max(-3, lift * 0.5)) + rng.next() * 4;
    if (grp === need) score += 4;
    if (gem) score += stars * 1.5;
    if (bucket === 'VET') score -= 2; // veterans fill the gaps, they should not be the whole list
    const note = gem ? 'Hidden gem' : grp === need ? `Fills a gap at ${need === 'ATT' ? 'the top end' : need === 'GK' ? 'keeper' : need === 'DEF' ? 'the back' : 'midfield'}` : bucket === 'YOUNG' ? 'Young, room to grow' : lift > 3 ? 'Would walk into the side' : !seller ? 'No fee, wages only' : bucket === 'MID' ? 'In his prime' : 'Ready now';
    scored.push({ p, score, note, bucket });
  };
  if (country === 'ANY' || country === club.country) for (const id of g.freeAgentIds) { const p = g.players[id]; if (p) consider(p); }
  // a poor scout sent abroad only gets round some of the clubs
  const pool = Object.values(g.clubs).filter((c) => c.id !== userId && (country === 'ANY' || c.country === country) && (c.country === club.country || stars >= 3 || rng.chance(0.4)));
  for (const c of pool) for (const id of c.playerIds) { const p = g.players[id]; if (p) consider(p); }
  scored.sort((a, b) => b.score - a.score);
  // a balanced list: young prospects, players in their prime, and a few veterans
  const quota: Record<Bucket, number> = { YOUNG: Math.ceil(size * 0.3), MID: Math.ceil(size * 0.4), VET: Math.max(1, Math.floor(size * 0.3)) };
  const taken: Record<Bucket, number> = { YOUNG: 0, MID: 0, VET: 0 };
  const picked: typeof scored = [];
  const perGroup: Record<string, number> = {};
  let frees = 0;
  const tryPick = (s: (typeof scored)[number], strict: boolean): boolean => {
    if (picked.includes(s)) return false;
    const grp = POSITION_GROUP[s.p.position];
    if (strict && taken[s.bucket] >= quota[s.bucket]) return false;
    if (!wanted && (perGroup[grp] ?? 0) >= Math.ceil(size / 2)) return false;
    if (!s.p.clubId && frees >= Math.ceil(size / 3)) return false;
    if (!s.p.clubId) frees++;
    perGroup[grp] = (perGroup[grp] ?? 0) + 1;
    taken[s.bucket]++;
    picked.push(s);
    return true;
  };
  for (const s of scored) { if (picked.length >= size) break; tryPick(s, true); }
  for (const s of scored) { if (picked.length >= size) break; tryPick(s, false); } // top up if a bucket ran dry
  picked.sort((x, y) => y.score - x.score);
  g.shortlist = {
    ids: picked.map((s) => s.p.id),
    year: g.season.year,
    week: g.season.matchweek,
    notes: Object.fromEntries(picked.map((s) => [s.p.id, s.note])),
  };
}

/** Shortlisted players that are still out there (not signed by you or retired). */
export function liveShortlist(g: GameState): Player[] {
  const userId = g.manager.clubId;
  return (g.shortlist?.ids ?? []).map((id) => g.players[id]).filter((p) => p && p.clubId !== userId);
}
