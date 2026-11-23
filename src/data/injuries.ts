/**
 * Injury catalogue. Four severity tiers with base odds and layoff ranges
 * (weeks). The physio trims these at injury time (up to ~25% at 5★).
 */
import type { InjurySeverity } from '../types/injury';

export interface InjuryDef {
  name: string;
  minWeeks: number;
  maxWeeks: number;
}

export interface InjuryTier {
  severity: InjurySeverity;
  label: string;
  /** base share of all injuries, % */
  weight: number;
  injuries: InjuryDef[];
}

export const INJURY_TIERS: InjuryTier[] = [
  {
    severity: 'MINOR', label: 'Minor', weight: 55,
    injuries: [
      { name: 'Knock', minWeeks: 1, maxWeeks: 1 },
      { name: 'Dead Leg', minWeeks: 1, maxWeeks: 2 },
      { name: 'Tight Calf', minWeeks: 1, maxWeeks: 2 },
    ],
  },
  {
    severity: 'MODERATE', label: 'Moderate', weight: 30,
    injuries: [
      { name: 'Hamstring Strain', minWeeks: 3, maxWeeks: 5 },
      { name: 'Ankle Sprain', minWeeks: 3, maxWeeks: 6 },
      { name: 'Groin Pull', minWeeks: 3, maxWeeks: 5 },
    ],
  },
  {
    severity: 'SERIOUS', label: 'Serious', weight: 12,
    injuries: [
      { name: 'Torn Hamstring', minWeeks: 8, maxWeeks: 12 },
      { name: 'Broken Metatarsal', minWeeks: 10, maxWeeks: 14 },
      { name: 'Dislocated Shoulder', minWeeks: 8, maxWeeks: 11 },
    ],
  },
  {
    severity: 'SEVERE', label: 'Severe', weight: 3,
    injuries: [
      { name: 'Torn ACL', minWeeks: 26, maxWeeks: 32 },
      { name: 'Achilles Rupture', minWeeks: 22, maxWeeks: 30 },
    ],
  },
];

export const SEVERITY_LABEL: Record<InjurySeverity, string> = {
  MINOR: 'Minor', MODERATE: 'Moderate', SERIOUS: 'Serious', SEVERE: 'Severe',
};
