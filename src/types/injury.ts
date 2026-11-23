export type InjurySeverity = 'MINOR' | 'MODERATE' | 'SERIOUS' | 'SEVERE';

export interface InjuryRecord {
  name: string;
  severity: InjurySeverity;
  /** layoff when the injury happened (after physio trim) */
  weeksTotal: number;
  /** where it happened */
  source: 'MATCH' | 'TRAINING';
  year: number;
  matchweek: number;
}
