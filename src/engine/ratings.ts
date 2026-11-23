import type { Player, PlayerStats, Position, StatKey, MoraleLevel } from '../types/player';

export const POSITION_WEIGHTS: Record<Position, Partial<Record<StatKey, number>>> = {
  ST: { shooting: 0.36, dribbling: 0.15, pace: 0.15, physical: 0.14, passing: 0.15, defending: 0.05 },
  LW: { pace: 0.25, dribbling: 0.3, passing: 0.2, shooting: 0.15, physical: 0.05, defending: 0.05 },
  RW: { pace: 0.25, dribbling: 0.3, passing: 0.2, shooting: 0.15, physical: 0.05, defending: 0.05 },
  CAM: { passing: 0.35, dribbling: 0.25, shooting: 0.2, pace: 0.08, physical: 0.07, defending: 0.05 },
  CM: { passing: 0.3, dribbling: 0.15, defending: 0.2, physical: 0.15, shooting: 0.1, pace: 0.1 },
  CDM: { defending: 0.35, passing: 0.25, physical: 0.2, pace: 0.08, dribbling: 0.07, shooting: 0.05 },
  LB: { defending: 0.3, pace: 0.25, passing: 0.15, physical: 0.15, dribbling: 0.1, shooting: 0.05 },
  RB: { defending: 0.3, pace: 0.25, passing: 0.15, physical: 0.15, dribbling: 0.1, shooting: 0.05 },
  CB: { defending: 0.45, physical: 0.25, pace: 0.12, passing: 0.1, dribbling: 0.04, shooting: 0.04 },
  GK: { reflexes: 0.3, handling: 0.2, positioning: 0.3, kicking: 0.1, physical: 0.1 },
};

export function ovrFor(stats: PlayerStats, pos: Position): number {
  const w = POSITION_WEIGHTS[pos];
  let sum = 0;
  for (const k in w) sum += stats[k as StatKey] * (w[k as StatKey] as number);
  return Math.round(sum);
}

export function recomputeCA(p: Player): void {
  p.ca = ovrFor(p.stats, p.position);
}

export function moraleLevel(v: number): MoraleLevel {
  if (v < 20) return 0;
  if (v < 40) return 1;
  if (v < 60) return 2;
  if (v < 80) return 3;
  return 4;
}

export function starsFromInternal(v: number): number {
  return Math.max(1, Math.min(5, Math.round((v / 10) * 2) / 2));
}

export function playerName(p: Player): string {
  return `${p.firstName.charAt(0)}. ${p.lastName}`;
}

export function fullName(p: Player): string {
  return `${p.firstName} ${p.lastName}`;
}

export function avgRating(p: Player): number {
  return p.season.apps > 0 ? p.season.ratingSum / p.season.apps : 0;
}
