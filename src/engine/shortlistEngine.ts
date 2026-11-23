/**
 * The scouting department's standing shortlist. Refreshed every four weeks
 * (and at the start of each window). A better Chief Scout finds more names,
 * finds them closer to what you need, and turns up hidden gems.
 */
import type { GameState } from '../types/world';
import type { Player } from '../types/player';
import { POSITION_GROUP } from '../data/formations';
import { staffStarsOf } from './staffGenerator';
import { avgCa, valuePlayer } from './transferEngine';
import type { Rng } from './rng';

const REFRESH_WEEKS = 4;

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
  const need = Object.keys(grpCount).sort((a, b) => grpStrength(a) - grpStrength(b))[0];
  // poorer scouts are noisier about quality
  const noise = (6 - stars) * 2.2;
  const lo = avg - 3;
  const hi = avg + 2 + stars * 1.6;
  const scored: { p: Player; score: number; note: string }[] = [];
  const consider = (p: Player) => {
    if (p.clubId === userId || p.loanFromClubId || p.injuryWeeks > 3) return;
    const seller = p.clubId ? g.clubs[p.clubId] : null;
    if (seller && seller.reputation > club.reputation + 30) return; // out of reach
    const perceived = p.ca + (rng.next() - 0.5) * noise;
    const gem = p.age <= 21 && p.truePA >= avg + 10 && stars >= 3;
    if (!gem && (perceived < lo || perceived > hi)) return;
    const value = valuePlayer(p);
    if (seller && value > Math.max(club.finances.bank * 1.2, 75_000) && !gem) return;
    let score = 10 - Math.abs(perceived - (avg + 3)) + rng.next() * 4;
    if (POSITION_GROUP[p.position] === need) score += 4;
    if (gem) score += stars * 1.5;
    const note = gem ? 'Hidden gem' : POSITION_GROUP[p.position] === need ? `Fills a gap at ${need === 'ATT' ? 'the top end' : need === 'GK' ? 'keeper' : need === 'DEF' ? 'the back' : 'midfield'}` : p.age <= 23 ? 'Young, room to grow' : !seller ? 'No fee, wages only' : value < avg * 4000 ? 'Bargain' : 'Ready now';
    scored.push({ p, score, note });
  };
  for (const id of g.freeAgentIds) { const p = g.players[id]; if (p) consider(p); }
  const pool = Object.values(g.clubs).filter((c) => c.id !== userId && (c.country === club.country || stars >= 3 || rng.chance(0.25)));
  for (const c of pool) for (const id of c.playerIds) { const p = g.players[id]; if (p) consider(p); }
  scored.sort((a, b) => b.score - a.score);
  const picked: typeof scored = [];
  const perGroup: Record<string, number> = {};
  let frees = 0;
  for (const s of scored) {
    const grp = POSITION_GROUP[s.p.position];
    if ((perGroup[grp] ?? 0) >= Math.ceil(size / 2)) continue;
    if (!s.p.clubId && frees >= Math.ceil(size / 3)) continue;
    if (!s.p.clubId) frees++;
    perGroup[grp] = (perGroup[grp] ?? 0) + 1;
    picked.push(s);
    if (picked.length >= size) break;
  }
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
