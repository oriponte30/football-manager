import type { GameState } from '../types/world';
import type { Club } from '../types/club';
import type { Player, Position } from '../types/player';
import type { RoleAssignment, FormationId } from '../types/tactics';
import { FORMATIONS, positionFit, defaultRoles, ROLES_BY_POSITION } from '../data/formations';
import { ovrFor } from './ratings';

export function slotScore(p: Player, slot: Position): number {
  return ovrFor(p.stats, slot) * positionFit(p.position, slot) * (0.72 + 0.28 * (p.fitness / 100));
}

export function availablePlayers(g: GameState, club: Club): Player[] {
  const out: Player[] = [];
  for (const id of club.playerIds) {
    const p = g.players[id];
    if (p && p.injuryWeeks === 0) out.push(p);
  }
  return out;
}

const SLOT_PRIORITY: Record<Position, number> = { GK: 0, CB: 1, ST: 2, CDM: 3, CM: 4, LB: 5, RB: 5, CAM: 6, LW: 7, RW: 7 };

/**
 * Greedy best-XI. Keeps any valid pre-selected players (user picks) and fills the gaps.
 */
export function fillLineup(
  g: GameState,
  club: Club,
  formation: FormationId,
  preset: (string | null)[] = [],
): { lineup: (string | null)[]; bench: string[] } {
  const slots = FORMATIONS[formation].slots;
  const avail = availablePlayers(g, club);
  const used = new Set<string>();
  const lineup: (string | null)[] = slots.map((_, i) => {
    const id = preset[i];
    if (id && !used.has(id)) {
      const p = g.players[id];
      if (p && p.clubId === club.id && p.injuryWeeks === 0) {
        used.add(id);
        return id;
      }
    }
    return null;
  });
  const order = slots.map((s, i) => ({ s, i })).sort((a, b) => SLOT_PRIORITY[a.s.pos] - SLOT_PRIORITY[b.s.pos]);
  for (const { s, i } of order) {
    if (lineup[i]) continue;
    let best: Player | null = null;
    let bestScore = -1;
    for (const p of avail) {
      if (used.has(p.id)) continue;
      const sc = slotScore(p, s.pos);
      if (sc > bestScore) {
        bestScore = sc;
        best = p;
      }
    }
    if (best) {
      used.add(best.id);
      lineup[i] = best.id;
    }
  }
  const rest = avail.filter((p) => !used.has(p.id)).sort((a, b) => b.ca - a.ca);
  const bench: string[] = [];
  const gk = rest.find((p) => p.position === 'GK');
  if (gk) bench.push(gk.id);
  for (const p of rest) {
    if (bench.length >= 7) break;
    if (!bench.includes(p.id)) bench.push(p.id);
  }
  return { lineup, bench };
}

export function sanitiseRoles(formation: FormationId, roles: RoleAssignment[]): RoleAssignment[] {
  const defs = defaultRoles(formation);
  return FORMATIONS[formation].slots.map((s, i) => {
    const r = roles[i];
    if (r && ROLES_BY_POSITION[s.pos].includes(r.role)) return r;
    return defs[i];
  });
}

/** AI: give each starter the role their playstyle prefers (when the slot allows it). */
export function preferredRoles(g: GameState, club: Club): RoleAssignment[] {
  const formation = club.tactics.formation;
  const base = sanitiseRoles(formation, club.tactics.roles);
  return FORMATIONS[formation].slots.map((s, i) => {
    const id = club.tactics.lineup[i];
    const p = id ? g.players[id] : null;
    if (p && ROLES_BY_POSITION[s.pos].includes(p.preferredRole)) return { ...base[i], role: p.preferredRole };
    return base[i];
  });
}

/** Squad strength = average OVR of the best XI (used by AI & shadow sim). */
export function squadStrength(g: GameState, club: Club): number {
  const { lineup } = fillLineup(g, club, club.tactics.formation);
  const slots = FORMATIONS[club.tactics.formation].slots;
  let sum = 0;
  let n = 0;
  lineup.forEach((id, i) => {
    if (!id) return;
    const p = g.players[id];
    sum += ovrFor(p.stats, slots[i].pos) * positionFit(p.position, slots[i].pos);
    n++;
  });
  return n === 0 ? 40 : (sum + (11 - n) * 30) / 11;
}

/** Tactical familiarity drops when systems change; rebuilds over 3–5 matches. */
export function changeFormation(club: Club, f: FormationId): void {
  if (club.tactics.formation === f) return;
  const oldSlots = FORMATIONS[club.tactics.formation].slots;
  const newSlots = FORMATIONS[f].slots;
  // keep players by best slot match
  const prev = club.tactics.lineup.map((id, i) => ({ id, pos: oldSlots[i]?.pos }));
  const lineup: (string | null)[] = newSlots.map(() => null);
  const used = new Set<number>();
  newSlots.forEach((s, i) => {
    const k = prev.findIndex((x, j) => !used.has(j) && x.id && x.pos === s.pos);
    if (k >= 0) { used.add(k); lineup[i] = prev[k].id; }
  });
  newSlots.forEach((_, i) => {
    if (lineup[i]) return;
    const k = prev.findIndex((x, j) => !used.has(j) && x.id);
    if (k >= 0) { used.add(k); lineup[i] = prev[k].id; }
  });
  club.tactics.formation = f;
  club.tactics.lineup = lineup;
  club.tactics.roles = defaultRoles(f);
  club.familiarity = Math.max(0, club.familiarity - 30);
}
