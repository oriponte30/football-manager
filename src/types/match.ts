export type CompetitionKind = 'LEAGUE' | 'CUP' | 'EURO' | 'PLAYOFF';

/** Phase 2 foundation: the match can run fully automated or pause at key moments. */
export type MatchSimulationMode = 'AUTO_SIM' | 'KEY_MOMENTS_HOOK';

export type KeyMomentScenario = 'ONE_ON_ONE' | 'COUNTER_ATTACK' | 'BOX_CROSS' | 'SET_PIECE';

export type PitchZone = 'LEFT_FLANK' | 'RIGHT_FLANK' | 'CENTRAL' | 'PENALTY_BOX' | 'EDGE_OF_BOX' | 'SIX_YARD_BOX';

export interface KeyMomentEvent {
  minute: number;
  attackingClubId: string;
  defendingClubId: string;
  scenarioType: KeyMomentScenario;
  /** [shooter, creator?, goalkeeper, ...defenders] */
  involvedPlayerIds: string[];
  expectedXG: number;
  zone: PitchZone;
}

export type KeyMomentOutcome = 'GOAL' | 'SAVED' | 'MISSED' | 'CLEARED';

/** Synchronous resolver; return undefined to let the engine decide probabilistically. */
export type KeyMomentResolver = (moment: KeyMomentEvent) => KeyMomentOutcome | undefined;
export type AsyncKeyMomentResolver = (moment: KeyMomentEvent) => Promise<KeyMomentOutcome | undefined>;

export type ShotType = 'LONG_SHOT' | 'BOX_SHOT' | 'HEADER' | 'ONE_ON_ONE' | 'COUNTER' | 'SET_PIECE' | 'PENALTY';

export type MatchEventType =
  | 'KICK_OFF'
  | 'POSSESSION'
  | 'TURNOVER'
  | 'CHANCE_CREATED'
  | 'SHOT_OFF_TARGET'
  | 'SHOT_SAVED'
  | 'SHOT_CLEARED'
  | 'GOAL'
  | 'INJURY'
  | 'SUBSTITUTION'
  | 'TACTICAL'
  | 'HALF_TIME'
  | 'FULL_TIME'
  | 'PENALTY_SHOOTOUT';

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  clubId: string;
  playerId?: string;
  assistId?: string;
  xg?: number;
  shotType?: ShotType;
  text: string;
  /** flagged as a high-leverage highlight (Phase 2 hook) */
  keyMoment?: KeyMomentEvent;
}

export interface TeamMatchStats {
  clubId: string;
  goals: number;
  possessions: number;
  possessionPct: number;
  shots: number;
  shotsOnTarget: number;
  xg: number;
  xgc: number;
  xa: number;
  bigChances: number;
}

export interface PlayerMatchStats {
  playerId: string;
  clubId: string;
  minutes: number;
  started: boolean;
  goals: number;
  assists: number;
  xg: number;
  xa: number;
  shots: number;
  shotsOnTarget: number;
  rating: number;
  injured: boolean;
  fitnessEnd: number;
  /** sub came on */
  subbedOn: boolean;
}

export interface MatchResult {
  id: string;
  competition: CompetitionKind;
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  penalties: { home: number; away: number } | null;
  events: MatchEvent[];
  home: TeamMatchStats;
  away: TeamMatchStats;
  players: Record<string, PlayerMatchStats>;
  keyMoments: KeyMomentEvent[];
  totalPossessions: number;
}

export interface MatchContext {
  competition: CompetitionKind;
  isKnockout: boolean;
  isDerby: boolean;
  neutralVenue: boolean;
  mode: MatchSimulationMode;
  onKeyMoment?: KeyMomentResolver;
  /** emit a POSSESSION event for every possession (verbose logs) */
  verbose?: boolean;
}
