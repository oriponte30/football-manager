import type { CountryCode, Tier } from './world';
import type { StaffRole } from './staff';
import type { TacticalSetup, FormationId, TeamDials } from './tactics';

export type ArchetypeId = 'FALLEN_GIANT' | 'TINY_UNDERDOG' | 'YOUTH_GAMBLE' | 'VOLATILE_OWNER' | 'CULT_CLUB';

export interface Facilities {
  /** 1..5 */
  stadium: number;
  training: number;
  youth: number;
}

export interface SeasonLedger {
  tickets: number;
  tv: number;
  prize: number;
  sales: number;
  wages: number;
  transfers: number;
  facilities: number;
  staff: number;
}

export interface Finances {
  bank: number;
  ledger: SeasonLedger;
}

export type BoardGoalKind = 'TITLE' | 'PROMOTION' | 'PLAYOFF' | 'TOP_HALF' | 'SURVIVAL' | 'EUROPE';

export interface BoardGoal {
  kind: BoardGoalKind;
  /** worst acceptable league position */
  targetPosition: number;
  label: string;
}

export interface BoardConfidence {
  value: number;
  /** multiplier on negative swings (volatile owner > 1, patient board < 1) */
  patience: number;
  goal: BoardGoal;
}

export interface Club {
  id: string;
  name: string;
  shortName: string;
  country: CountryCode;
  tier: Tier;
  isShadow: boolean;
  leagueId: string;
  reputation: number;
  capacity: number;
  facilities: Facilities;
  finances: Finances;
  fanInterest: number;
  board: BoardConfidence;
  archetype: ArchetypeId | null;
  /** home advantage modifier (cult club > 1) */
  homeBoost: number;
  playerIds: string[];
  staff: Record<StaffRole, string | null>;
  tactics: TacticalSetup;
  /** familiarity of the current formation (mirrors familiarityByFormation) */
  familiarity: number;
  /** tactical familiarity per formation 0..100 — only changes when matches are played */
  familiarityByFormation: Partial<Record<FormationId, number>>;
  /** dials used in the last played match (unplayed tweaks are free to undo) */
  lastPlayedDials: TeamDials | null;
  teamAtmosphere: number;
  colors: [string, string];
  rivalId: string | null;
  /** consecutive results for streak tracking */
  streak: number;
  /** randomised tactical identity, e.g. "Catenaccio", "Gegenpress" */
  identity: string;
}
