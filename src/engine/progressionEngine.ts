/**
 * Weekly XP & ageing.
 * WeeklyXP = AgeCurve × MinutesPlayedFactor × MatchRatingFactor × HeadroomFactor(PA−CA)
 *            × HeadCoachStars × MoraleFactor (× training ground)
 */
import type { GameState } from '../types/world';
import type { Club } from '../types/club';
import type { CareerCurve, Player, StatKey, IndividualTrainingFocus } from '../types/player';
import type { TeamTrainingFocus } from '../types/tactics';
import type { PlayerMatchStats } from '../types/match';
import { OUTFIELD_STATS, GK_STATS } from '../types/player';
import { POSITION_WEIGHTS, moraleLevel, recomputeCA, ovrFor } from './ratings';
import { clamp, hash01, type Rng } from './rng';
import { staffStarsOf } from './staffGenerator';

export function ageCurve(age: number, curve: CareerCurve): number {
  switch (curve) {
    case 'LATE_BLOOMER':
      if (age <= 21) return 0.5;
      if (age <= 24) return 0.9;
      if (age <= 27) return 1.6;
      if (age <= 31) return 0.8;
      return 0.25;
    case 'EARLY_PEAKER':
      if (age <= 19) return 1.9;
      if (age <= 20) return 1.7;
      if (age <= 22) return 0.8;
      return 0.12;
    case 'AGELESS':
    case 'FLOP':
    case 'STANDARD':
    default:
      if (age <= 19) return 1.65;
      if (age <= 21) return 1.4;
      if (age <= 26) return 0.8;
      if (age <= 30) return 0.35;
      return 0.1;
  }
}

/** Physical decline onset per curve (Ageless is seeded 35–37). */
export function declineStart(p: Player): number {
  switch (p.careerCurve) {
    case 'LATE_BLOOMER': return 34;
    case 'EARLY_PEAKER': return 30;
    case 'AGELESS': return 35 + Math.floor(hash01(p.paSeed, 'ageless') * 3);
    case 'FLOP': return 30;
    default: return 31;
  }
}

const FOCUS_STATS: Record<TeamTrainingFocus, StatKey[]> = {
  BALANCED: [],
  ATTACKING: ['shooting', 'passing', 'dribbling'],
  DEFENDING: ['defending', 'physical', 'positioning'],
  PHYSICAL: ['pace', 'physical'],
};
const INDIV_STATS: Record<IndividualTrainingFocus, StatKey[]> = {
  NONE: [],
  SHOOTING: ['shooting'], PASSING: ['passing'], DRIBBLING: ['dribbling'], DEFENDING: ['defending'],
  PACE: ['pace'], PHYSICAL: ['physical'], GOALKEEPING: ['reflexes', 'handling', 'positioning'],
};

function chooseStat(rng: Rng, p: Player, team: TeamTrainingFocus, tagged: boolean): StatKey {
  const keys = p.position === 'GK' ? GK_STATS : OUTFIELD_STATS;
  const w = POSITION_WEIGHTS[p.position];
  const weights = keys.map((k) => {
    let x = (w[k] ?? 0.03) + 0.04;
    if (FOCUS_STATS[team].includes(k)) x *= 1.6;
    if (tagged && INDIV_STATS[p.trainingFocus].includes(k)) x *= 3.5;
    if (p.stats[k] >= 97) x = 0.0001;
    return x;
  });
  return rng.weighted<StatKey>(keys, weights);
}

/** Adds XP points to stats, respecting the hidden PA ceiling. */
export function applyXP(rng: Rng, p: Player, team: TeamTrainingFocus, tagged: boolean): void {
  let guard = 0;
  while (p.xpBank >= 1 && guard++ < 12) {
    p.xpBank -= 1;
    if (p.ca >= p.truePA) { p.xpBank = 0; break; }
    const k = chooseStat(rng, p, team, tagged);
    p.stats[k] = Math.min(99, p.stats[k] + 1);
    const ca = ovrFor(p.stats, p.position);
    if (ca > p.truePA) { p.stats[k] -= 1; p.xpBank = 0; break; }
    p.ca = ca;
  }
}

export function headroomFactor(p: Player, coachStars: number, clubWinning: boolean): number {
  const gap = p.truePA - p.ca;
  if (gap <= 0) return 0;
  // a long way below his ceiling, a young player grows fastest (steep early curve), then eases off near the top
  const cap = p.age <= 22 ? 1.9 : 1.4;
  let h = clamp(gap / 13, 0.08, cap);
  // Flop: invisible ceiling unless coached by 4–5★ in a winning team
  if (p.careerCurve === 'FLOP' && gap < 14 && !(coachStars >= 4 && clubWinning)) h *= 0.15;
  // Head coach prevents early plateaus
  if (p.careerCurve === 'EARLY_PEAKER' && p.age >= 23 && coachStars >= 4) h *= 2;
  return h;
}

export function weeklyXP(p: Player, ms: PlayerMatchStats | undefined, coachStars: number, trainingLevel: number, clubWinning: boolean): number {
  const minutes = ms?.minutes ?? 0;
  const minutesFactor = minutes > 0 ? 0.35 + 0.65 * Math.min(1, minutes / 90) : 0.2;
  const ratingFactor = minutes > 0 ? clamp(Math.pow((ms?.rating ?? 6.5) / 6.5, 1.5), 0.5, 1.6) : 0.8;
  // the head coach matters a lot: a terrible one holds a kid back, a great one is worth ~2x
  const coachFactor = 0.42 + 0.16 * coachStars;
  const moraleFactor = 0.9 + 0.05 * moraleLevel(p.moraleValue);
  const facility = 0.92 + 0.04 * trainingLevel;
  return 0.95 * ageCurve(p.age, p.careerCurve) * minutesFactor * ratingFactor * headroomFactor(p, coachStars, clubWinning) * coachFactor * moraleFactor * facility;
}

export function weeklyProgressionForClub(g: GameState, rng: Rng, club: Club, weekStats: Record<string, PlayerMatchStats>, clubWinning: boolean): void {
  const coach = staffStarsOf(g, club.id, 'HEAD_COACH');
  const tags = new Set(club.tactics.trainingTags);
  for (const id of club.playerIds) {
    const p = g.players[id];
    if (!p || p.injuryWeeks > 0) continue;
    const tagged = tags.has(id);
    p.xpBank += weeklyXP(p, weekStats[id], coach, club.facilities.training, clubWinning) * (tagged ? 1.1 : 1);
    applyXP(rng, p, club.tactics.trainingFocus, tagged);
  }
}

/** Season-level progression for shadow-league players and loanees away from the sim. */
export function seasonalProgression(rng: Rng, p: Player, coachStars: number, minutesShare: number): void {
  const avgRating = 6.6;
  const ms = { minutes: Math.round(90 * minutesShare), rating: avgRating } as PlayerMatchStats;
  let xp = 0;
  for (let w = 0; w < 30; w++) xp += weeklyXP(p, minutesShare > 0 ? ms : undefined, coachStars, 3, true);
  p.xpBank += xp;
  let guard = 0;
  while (p.xpBank >= 1 && guard++ < 60) {
    applyXP(rng, p, 'BALANCED', false);
    if (p.ca >= p.truePA) break;
  }
  p.xpBank = 0;
}

/** Birthday + decline. Technical stats hold longer than Pace/Physical. */
export function ageOneYear(rng: Rng, p: Player): void {
  p.age += 1;
  const start = declineStart(p);
  if (p.age >= start) {
    const yrs = p.age - start;
    const phys = rng.range(1, 3) + yrs * 0.6;
    p.stats.pace = clamp(Math.round(p.stats.pace - phys), 1, 99);
    p.stats.physical = clamp(Math.round(p.stats.physical - phys * 0.8), 1, 99);
    if (p.age >= start + 2) {
      const tech = rng.range(0, 1.5) + yrs * 0.25;
      for (const k of ['shooting', 'dribbling', 'passing', 'defending', 'reflexes', 'positioning', 'handling'] as StatKey[]) {
        p.stats[k] = clamp(Math.round(p.stats[k] - tech * (rng.next() < 0.6 ? 1 : 0)), 1, 99);
      }
    }
    recomputeCA(p);
    p.truePA = Math.max(p.ca, Math.min(p.truePA, p.ca + 1));
  }
}

/** Form momentum after a match: drift + rating spike → purple patches / cold streaks. */
export function updateForm(rng: Rng, p: Player, rating: number): void {
  const k = p.traits.includes('Consistent') ? 0.5 : 1;
  p.form = clamp(p.form * 0.72 + (rating - 6.6) * 1.7 * k, -10, 10);
  if (p.streak > 0) p.streak--;
  else if (p.streak < 0) p.streak++;
  else if (p.form >= 5.5 && rng.chance(0.6)) p.streak = rng.int(3, 5);
  else if (p.form <= -5.5 && rng.chance(0.5)) p.streak = -rng.int(3, 5);
  p.recentRatings.push(rating);
  if (p.recentRatings.length > 5) p.recentRatings.shift();
}
