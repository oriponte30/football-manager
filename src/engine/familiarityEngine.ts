/**
 * Tactical familiarity, per formation.
 *  - Switching shape on the board costs nothing until a match is played.
 *  - Playing a formation builds its familiarity (faster with a better coach).
 *  - Formations you don't use fade gradually (a one-match experiment doesn't
 *    wipe out your main system).
 *  - Dial changes cost a little, once, when first used in a match.
 */
import type { Club } from '../types/club';
import type { FormationId, TeamDials } from '../types/tactics';
import { FORMATION_IDS } from '../data/formations';
import { clamp } from './rng';

const UNUSED_FLOOR = 25;
const UNUSED_DECAY = 3;
const DIAL_PENALTY = 4;

export function famOf(club: Club, f: FormationId): number {
  return club.familiarityByFormation?.[f] ?? 35;
}

export function initFamiliarity(club: Club, current: number): void {
  const map: Partial<Record<FormationId, number>> = {};
  for (const f of FORMATION_IDS) map[f] = f === club.tactics.formation ? current : 40;
  club.familiarityByFormation = map;
  club.familiarity = current;
  club.lastPlayedDials = { ...club.tactics.dials };
}

export function dialChanges(club: Club): number {
  const last = club.lastPlayedDials;
  if (!last) return 0;
  const d = club.tactics.dials;
  return (Object.keys(d) as (keyof TeamDials)[]).filter((k) => d[k] !== last[k]).length;
}

/** Familiarity the team takes into the next match (current shape, minus untried dial tweaks). */
export function matchFamiliarity(club: Club): number {
  return clamp(famOf(club, club.tactics.formation) - dialChanges(club) * DIAL_PENALTY, 0, 100);
}

export function afterMatchFamiliarity(club: Club, coachStars: number): void {
  if (!club.familiarityByFormation) initFamiliarity(club, club.familiarity);
  const map = club.familiarityByFormation;
  const cur = club.tactics.formation;
  const played = matchFamiliarity(club);
  for (const f of FORMATION_IDS) {
    if (f === cur) map[f] = clamp(played + 9 + coachStars * 3, 0, 100);
    else map[f] = Math.max(Math.min(map[f] ?? 40, UNUSED_FLOOR), (map[f] ?? 40) - UNUSED_DECAY);
  }
  club.familiarity = map[cur] ?? 35;
  club.lastPlayedDials = { ...club.tactics.dials };
}
