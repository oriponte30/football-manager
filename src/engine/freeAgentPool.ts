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
  { positions: ['CB'], min: 4, perBracket: [1, 1, 1] },
  { positions: ['LB', 'RB'], min: 4, perBracket: [1, 1, 1] },
  { positions: ['CDM', 'CM'], min: 4, perBracket: [1, 1, 1] },
  { positions: ['CAM'], min: 3, perBracket: [1, 1, 1] },
  { positions: ['LW', 'RW'], min: 4, perBracket: [1, 1, 1] },
  { positions: ['ST'], min: 4, perBracket: [1, 1, 1] },
];

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
  return GROUPS.some((grp) => {
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
  ensureFreeAgentCoverage(g, createRng(g.idCounter * 31 + g.season.year * 7 + g.season.matchweek), g.activeCountry);
  return true;
}
