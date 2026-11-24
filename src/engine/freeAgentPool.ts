/** Keeps the free-agent pool useful: every position, at three ability levels. */
import type { GameState, CountryCode } from '../types/world';
import type { Position } from '../types/player';
import { rollNationality } from '../data/nationalities';
import { generatePlayer } from './playerGenerator';
import { createRng, type Rng } from './rng';

/** ability brackets, roughly Tier 3 / Tier 2 / Tier 1 squad level */
const BRACKETS: { lo: number; hi: number; tier: 1 | 2 | 3 }[] = [
  { lo: 46, hi: 57, tier: 3 },
  { lo: 57, hi: 65, tier: 2 },
  { lo: 65, hi: 73, tier: 1 },
];
const bracketOf = (ca: number): number => (ca < 57 ? 0 : ca < 65 ? 1 : 2);

/** position groups and the minimum number of free agents in each (at least one per bracket) */
const GROUPS: { positions: Position[]; min: number; perBracket: [number, number, number] }[] = [
  { positions: ['GK'], min: 5, perBracket: [2, 2, 1] },
  { positions: ['CB'], min: 5, perBracket: [1, 1, 2] },
  { positions: ['LB', 'RB'], min: 5, perBracket: [1, 1, 2] },
  { positions: ['CDM', 'CM'], min: 5, perBracket: [1, 1, 2] },
  { positions: ['CAM'], min: 4, perBracket: [1, 1, 1] },
  { positions: ['LW', 'RW'], min: 5, perBracket: [1, 1, 2] },
  { positions: ['ST'], min: 4, perBracket: [1, 1, 1] },
];
/** largest the pool may grow per group, so no position floods the front page */
const GROUP_CAP = [9, 10, 10, 12, 7, 10, 5];
/** at most this many free agents per group at 74+ (the rest have been snapped up elsewhere) */
const ELITE_CA = 74;
const ELITE_MAX = 2;

/** A position for a filler free agent: whichever group is furthest below its share. */
export function freeAgentPosition(g: GameState, rng: Rng): Position {
  const pool = g.freeAgentIds.map((id) => g.players[id]).filter(Boolean);
  let best = 0; let bestRatio = Infinity;
  GROUPS.forEach((grp, i) => {
    const r = pool.filter((p) => grp.positions.includes(p.position)).length / GROUP_CAP[i];
    if (r < bestRatio) { bestRatio = r; best = i; }
  });
  return rng.pick(GROUPS[best].positions);
}

/** Trim over-full position groups (weakest, oldest first). */
export function balanceFreeAgents(g: GameState): void {
  GROUPS.forEach((grp, i) => {
    const have = g.freeAgentIds.map((id) => g.players[id]).filter((p) => p && grp.positions.includes(p.position)).sort((a, b) => (b.ca - b.age) - (a.ca - a.age));
    const gone = new Set(have.slice(GROUP_CAP[i]).map((p) => p.id));
    for (const p of have.filter((x) => x.ca >= ELITE_CA).slice(ELITE_MAX)) gone.add(p.id);
    for (const id of gone) { delete g.players[id]; delete g.scoutReports[id]; }
  });
  g.freeAgentIds = g.freeAgentIds.filter((id) => g.players[id]);
}

export function ensureFreeAgentCoverage(g: GameState, rng: Rng, country: CountryCode): void {
  const pool = () => g.freeAgentIds.map((id) => g.players[id]).filter(Boolean);
  for (const grp of GROUPS) {
    const have = pool().filter((p) => grp.positions.includes(p.position));
    const counts = [0, 0, 0];
    for (const p of have) counts[bracketOf(p.ca)]++;
    let total = have.length;
    const add = (b: number) => {
      const br = BRACKETS[b];
      const age = rng.chance(0.25) ? rng.int(31, 35) : rng.int(19, 30);
      const p = generatePlayer(g, rng, {
        nationality: rollNationality(rng, country, 'FREE_AGENT'), country, position: rng.pick(grp.positions), age,
        targetOvr: rng.range(br.lo, br.hi), clubId: null, tier: br.tier,
      });
      p.contract.yearsLeft = 0;
      g.players[p.id] = p;
      g.freeAgentIds.push(p.id);
      counts[bracketOf(p.ca)]++;
      total++;
    };
    for (let b = 0; b < 3; b++) {
      let guard = 0;
      while (counts[b] < grp.perBracket[b] && guard++ < 12) add(b);
    }
    let guard = 0;
    while (total < grp.min && guard++ < 12) add(guard % 3);
  }
}

/** True when some position group is short of free agents (e.g. a save made before the quotas existed). */
export function needsCoverage(g: GameState): boolean {
  const pool = g.freeAgentIds.map((id) => g.players[id]).filter(Boolean);
  return GROUPS.some((grp, gi) => {
    const mine = pool.filter((p) => grp.positions.includes(p.position));
    if (mine.length > GROUP_CAP[gi] || mine.filter((p) => p.ca >= ELITE_CA).length > ELITE_MAX) return true;
    const have = pool.filter((p) => grp.positions.includes(p.position));
    if (have.length < grp.min) return true;
    const counts = [0, 0, 0];
    for (const p of have) counts[bracketOf(p.ca)]++;
    return counts.some((c, b) => c < grp.perBracket[b]);
  });
}

/** Stock the pool right now, deterministically (used when a save is opened). */
export function topUpFreeAgents(g: GameState): boolean {
  if (!needsCoverage(g)) return false;
  balanceFreeAgents(g);
  ensureFreeAgentCoverage(g, createRng(g.idCounter * 31 + g.season.year * 7 + g.season.matchweek), g.activeCountry);
  return true;
}
