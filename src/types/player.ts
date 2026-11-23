import type { CountryCode } from './world';
import type { PlayerRole } from './tactics';
import type { InjuryRecord } from './injury';

/** 30 football nations. The five playable leagues are a subset. */
export type NationCode =
  | CountryCode
  | 'BRA' | 'ARG' | 'POR' | 'NED' | 'BEL' | 'CRO' | 'URU' | 'COL'
  | 'JPN' | 'KOR' | 'NGA' | 'MAR' | 'SEN' | 'USA' | 'MEX' | 'SWE' | 'DEN' | 'POL' | 'SCO' | 'SRB' | 'CIV'
  | 'IRL' | 'CMR' | 'GHA' | 'AUT';

export type Position = 'GK' | 'CB' | 'LB' | 'RB' | 'CDM' | 'CM' | 'CAM' | 'LW' | 'RW' | 'ST';

export type OutfieldStatKey = 'shooting' | 'passing' | 'dribbling' | 'defending' | 'pace' | 'physical';
export type GoalkeeperStatKey = 'reflexes' | 'handling' | 'positioning' | 'kicking' | 'physical';
export type StatKey = OutfieldStatKey | GoalkeeperStatKey;

export const OUTFIELD_STATS: OutfieldStatKey[] = ['shooting', 'passing', 'dribbling', 'defending', 'pace', 'physical'];
export const GK_STATS: GoalkeeperStatKey[] = ['reflexes', 'handling', 'positioning', 'kicking', 'physical'];
export const ALL_STATS: StatKey[] = [
  'shooting', 'passing', 'dribbling', 'defending', 'pace', 'physical',
  'reflexes', 'handling', 'positioning', 'kicking',
];

/** Every player carries every stat; outfielders have weak GK stats and vice-versa. */
export type PlayerStats = Record<StatKey, number>;

export type Trait =
  | 'Poacher'
  | 'Tireless Engine'
  | 'Set-Piece Ace'
  | 'Glass Ankles'
  | 'Injury Prone'
  | 'Big Game Player'
  | 'Consistent'
  | 'Selfish'
  | 'Clutch'
  | 'Super-Sub'
  | 'Reckless Tackler'
  | 'Long-Throw Specialist';

export type CareerCurve = 'STANDARD' | 'LATE_BLOOMER' | 'EARLY_PEAKER' | 'AGELESS' | 'FLOP';

/** 0 Furious, 1 Unhappy, 2 Content, 3 Happy, 4 Fired Up */
export type MoraleLevel = 0 | 1 | 2 | 3 | 4;
export const MORALE_LABELS: Record<MoraleLevel, string> = {
  0: 'Furious', 1: 'Unhappy', 2: 'Content', 3: 'Happy', 4: 'Fired Up',
};

export type IndividualTrainingFocus = 'NONE' | 'SHOOTING' | 'PASSING' | 'DRIBBLING' | 'DEFENDING' | 'PACE' | 'PHYSICAL' | 'GOALKEEPING';

export interface Contract {
  /** weekly wage in $ */
  wage: number;
  yearsLeft: number;
  releaseClause: number | null;
}

export interface SeasonPlayerStats {
  apps: number;
  minutes: number;
  goals: number;
  assists: number;
  xg: number;
  xa: number;
  shots: number;
  ratingSum: number;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  nationality: NationCode;
  /** randomised playing archetype, e.g. "Target Man", "Speed Merchant" */
  playstyle: string;
  /** the tactical role this player naturally gravitates to */
  preferredRole: PlayerRole;
  age: number;
  position: Position;
  stats: PlayerStats;
  /** current ability / OVR (position weighted) */
  ca: number;
  /** hidden true potential — never shown directly in UI */
  truePA: number;
  /** seed used to derive per-staff perceived-PA bias (no midpoint exploit) */
  paSeed: number;
  careerCurve: CareerCurve;
  traits: Trait[];
  fitness: number;
  /** hidden momentum -10..10 */
  form: number;
  /** remaining matches of a purple patch (>0) or cold streak (<0) */
  streak: number;
  moraleValue: number;
  clubId: string | null;
  contract: Contract;
  injuryWeeks: number;
  /** current injury details (null when fit) */
  injury: InjuryRecord | null;
  xpBank: number;
  trainingFocus: IndividualTrainingFocus;
  season: SeasonPlayerStats;
  /** if on loan: the parent club */
  loanFromClubId: string | null;
  isYouthProduct: boolean;
  fanFavorite: boolean;
  /** last 5 match ratings */
  recentRatings: number[];
  /** the manager has put him in the shop window (transfer list / loan list) */
  listed?: { kind: 'TRANSFER' | 'LOAN'; ask: number; season: number; week: number };
}

/** UI-facing range read of a potential, produced by staff. */
export interface PerceivedPA {
  low: number;
  high: number;
  staffStars: number;
}
