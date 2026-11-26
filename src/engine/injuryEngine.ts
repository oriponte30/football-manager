/**
 * Logical injury system. Pure TS.
 *  - Risk per possession in matches (and a small weekly training risk) is
 *    scaled by fatigue, High Press, low Physical, Injury Prone / Glass Ankles
 *    and a reckless opponent; a good physio shaves a little off.
 *  - Layoff tier: Minor ~55%, Moderate ~30%, Serious ~12%, Severe ~3%.
 *  - Physio trims recovery by up to ~25% at 5★.
 */
import type { GameState } from '../types/world';
import type { Club } from '../types/club';
import type { Player } from '../types/player';
import type { Pressing } from '../types/tactics';
import type { InjuryRecord } from '../types/injury';
import { INJURY_TIERS } from '../data/injuries';
import type { Rng } from './rng';
import { fillLineup, syncBench } from './lineup';
import { fullName } from './ratings';

/** Base injury chance per player per possession at full fitness. */
export const MATCH_INJURY_BASE = 0.00007;
/** Base weekly training-ground injury chance per player. */
export const TRAINING_INJURY_BASE = 0.0008;

/** Physio cuts injury odds slightly: 1★ 0%, 5★ −12%. */
export function physioRiskFactor(physioStars: number): number {
  return 1 - 0.03 * (Math.max(1, Math.min(5, physioStars)) - 1);
}

/** Physio trims layoff: 1★ 0%, 5★ −25%. */
export function physioRecoveryFactor(physioStars: number): number {
  return 1 - 0.0625 * (Math.max(1, Math.min(5, physioStars)) - 1);
}

/** Static (per match) injury multiplier for a player. Precomputed by the match engine. */
export function injuryRiskMult(p: Player, pressing: Pressing, physioStars: number): number {
  let m = 1;
  if (p.traits.includes('Glass Ankles')) m *= 2;
  if (p.traits.includes('Injury Prone')) m *= 2.5;
  // low Physical: up to +70% at physical 30, slight protection when robust
  const phys = p.stats.physical;
  m *= phys < 65 ? 1 + ((65 - phys) / 35) * 0.7 : 1 - Math.min(0.15, (phys - 65) / 200);
  if (pressing === 'HIGH') m *= 1.35;
  else if (pressing === 'LOW') m *= 0.9;
  if (p.age >= 32) m *= 1 + (p.age - 31) * 0.06;
  return m * physioRiskFactor(physioStars);
}

/** Dynamic per-possession chance (cheap: called in the hot loop). */
export function matchInjuryChance(mult: number, fitness: number, oppReckless: boolean): number {
  let c = MATCH_INJURY_BASE * mult;
  if (fitness < 50) c *= 2.2;
  else if (fitness < 65) c *= 1.45;
  if (oppReckless) c *= 1.3;
  return c;
}

/** Pick an injury and its layoff. Training knocks skew towards Minor. */
export function rollInjury(rng: Rng, physioStars: number, source: 'MATCH' | 'TRAINING', year: number, matchweek: number): InjuryRecord {
  const weights = INJURY_TIERS.map((t) => (source === 'TRAINING' ? (t.severity === 'MINOR' ? t.weight * 1.6 : t.severity === 'SEVERE' ? t.weight * 0.4 : t.weight) : t.weight));
  const tier = rng.weighted(INJURY_TIERS, weights);
  const def = rng.pick(tier.injuries);
  const raw = rng.int(def.minWeeks, def.maxWeeks);
  const weeks = Math.max(1, Math.round(raw * physioRecoveryFactor(physioStars)));
  return { name: def.name, severity: tier.severity, weeksTotal: weeks, source, year, matchweek };
}

export function applyInjury(g: GameState, p: Player, rec: InjuryRecord): void {
  // a fresh knock never shortens an existing long layoff
  if (p.injuryWeeks >= rec.weeksTotal && p.injury) return;
  p.injury = rec;
  p.injuryWeeks = rec.weeksTotal;
  p.fitness = Math.min(p.fitness, rec.severity === 'MINOR' ? 85 : rec.severity === 'MODERATE' ? 70 : 55);
  // injured players are pulled from the user's Starting XI (and bench)
  const club = p.clubId ? g.clubs[p.clubId] : null;
  if (club) {
    const wasStarting = club.tactics.lineup.includes(p.id);
    const topBench = [...club.tactics.bench].map((id) => g.players[id]).filter(Boolean).sort((a, b) => b.ca - a.ca).slice(0, 3).some((x) => x.id === p.id);
    rec.roleBeforeInjury = wasStarting ? 'STARTER' : topBench ? 'TOP_BENCH' : 'RESERVE';
    club.tactics.lineup = club.tactics.lineup.map((id) => (id === p.id ? null : id));
    club.tactics.bench = club.tactics.bench.filter((id) => id !== p.id);
    club.tactics.trainingTags = club.tactics.trainingTags.filter((id) => id !== p.id);
    if (wasStarting) {
      // the assistant plugs the gap with the best fit; the rest of the XI is untouched
      const sel = fillLineup(g, club, club.tactics.formation, club.tactics.lineup);
      club.tactics.lineup = sel.lineup;
      club.tactics.bench = club.tactics.bench.filter((id) => !sel.lineup.includes(id));
    }
    if (club.id === g.manager.clubId) {
      syncBench(g, club);
      if (rec.roleBeforeInjury === 'STARTER') {
        addMedicalAlert(g, 'INJURED', p, `${fullName(p)} (${p.position}) is out for ${rec.weeksTotal} week${rec.weeksTotal > 1 ? 's' : ''} with ${/^[aeiou]/i.test(rec.name) ? 'an' : 'a'} ${rec.name.toLowerCase()}. He was in your starting XI: check your replacement.`);
      }
    }
  }
}

export function addMedicalAlert(g: GameState, kind: 'INJURED' | 'CLEARED', p: Player, text: string): void {
  g.medicalAlerts = [...(g.medicalAlerts ?? []).filter((a) => a.playerId !== p.id), { id: `${kind}:${p.id}:${g.season.year}:${g.season.matchweek}`, kind, playerId: p.id, text }];
}

/** Tick a player's recovery; if he is back and mattered to the manager, raise a CLEARED alert. */
export function tickRecoveryWithAlert(g: GameState, p: Player): void {
  const rec = p.injury;
  tickRecovery(p);
  if (!rec || p.injuryWeeks > 0) return;
  if (p.clubId && p.clubId === g.manager.clubId && (rec.roleBeforeInjury === 'STARTER' || rec.roleBeforeInjury === 'TOP_BENCH')) {
    addMedicalAlert(g, 'CLEARED', p, `${fullName(p)} (${p.position}, OVR ${p.ca}) is fit again. He ${rec.roleBeforeInjury === 'STARTER' ? 'was a starter' : 'was a top bench option'} before the injury: put him back in your plans.`);
  }
}

/** Advance recovery by `weeks`; clears the record once fit. */
export function tickRecovery(p: Player, weeks = 1): void {
  if (p.injuryWeeks <= 0) { p.injury = null; return; }
  p.injuryWeeks = Math.max(0, p.injuryWeeks - weeks);
  if (p.injuryWeeks === 0) p.injury = null;
}

/** Weekly training-ground injuries for one club. Returns the players hurt. */
export function trainingInjuries(g: GameState, rng: Rng, club: Club, physioStars: number): Player[] {
  const hurt: Player[] = [];
  const intensity = club.tactics.trainingFocus === 'PHYSICAL' ? 1.4 : 1;
  const press = club.tactics.dials.pressing;
  for (const id of club.playerIds) {
    const p = g.players[id];
    if (!p || p.injuryWeeks > 0) continue;
    let c = TRAINING_INJURY_BASE * intensity * injuryRiskMult(p, press, physioStars);
    if (p.fitness < 60) c *= 1.5;
    if (rng.next() < c) {
      applyInjury(g, p, rollInjury(rng, physioStars, 'TRAINING', g.season.year, g.season.matchweek));
      hurt.push(p);
    }
  }
  return hurt;
}

/** Ballpark importance of a player inside his squad (used for "key player" news). */
export function isKeyPlayer(g: GameState, p: Player): boolean {
  const club = p.clubId ? g.clubs[p.clubId] : null;
  if (!club) return false;
  const sorted = club.playerIds.map((id) => g.players[id]?.ca ?? 0).sort((a, b) => b - a);
  return p.ca >= (sorted[5] ?? 0) || club.tactics.lineup.includes(p.id) || p.fanFavorite;
}
