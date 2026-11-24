import type { Club } from './club';
import type { Player, StatKey } from './player';
import type { StaffMember } from './staff';
import type { MatchResult, CompetitionKind } from './match';
import type { NewsItem } from './news';
import type { FaxMessage, TransferBid, ScoutAssignment, ScoutReport, JobOffer, Dilemma } from './transfers';
import type { DrillKind } from '../data/drills';

export type CountryCode = 'ENG' | 'ESP' | 'ITA' | 'GER' | 'FRA';
export const COUNTRY_CODES: CountryCode[] = ['ENG', 'ESP', 'ITA', 'GER', 'FRA'];

export type Tier = 1 | 2 | 3;

export interface Country {
  code: CountryCode;
  name: string;
  leagueNames: [string, string, string];
  cupName: string;
  /** multiplier on TV/prize money */
  tvMoneyMult: number;
  /** multiplier on wages (England inflation) */
  wageMult: number;
  /** strict wage cap: max weekly wage bill as multiple of tier baseline (Spain) */
  wageCapMult: number | null;
  /** facility upgrade cost multiplier (Germany cheaper) */
  facilityCostMult: number;
  /** fee multiplier when a foreign club buys this nation's players (France) */
  foreignFeeMult: number;
  /** small regen stat leans (identical potential ceilings) */
  statLean: Partial<Record<StatKey, number>>;
  flag: string;
}

export interface TeamSeasonStats {
  year: number; clubId: string;
  g: number; w: number; d: number; l: number; cs: number; gf: number; ga: number;
  poss: number; shots: number; sot: number; xg: number; xgc: number;
}

export interface TableRow {
  clubId: string;
  p: number; w: number; d: number; l: number;
  gf: number; ga: number; pts: number;
  form: ('W' | 'D' | 'L')[];
}

export interface Fixture {
  id: string;
  competition: CompetitionKind;
  matchweek: number;
  homeId: string;
  awayId: string;
  played: boolean;
  homeGoals: number;
  awayGoals: number;
  /** knockout only */
  penalties: { home: number; away: number } | null;
  winnerId: string | null;
  label?: string;
}

export interface League {
  id: string;
  country: CountryCode;
  tier: Tier;
  name: string;
  clubIds: string[];
  /** fixtures for the active country only; shadow leagues resolve in one pass */
  fixtures: Fixture[];
  table: Record<string, TableRow>;
  isShadow: boolean;
}

export interface CupRound {
  name: string;
  matchweek: number;
  ties: Fixture[];
}

export interface DomesticCup {
  name: string;
  rounds: CupRound[];
  championId: string | null;
}

export interface EuroGroup {
  name: string;
  clubIds: string[];
  table: Record<string, TableRow>;
}

export type EuroStage = 'GROUPS' | 'QF' | 'SF' | 'FINAL' | 'DONE';

export interface EuropeanCup {
  groups: EuroGroup[];
  groupFixtures: Fixture[];
  quarterFinals: Fixture[];
  semiFinals: Fixture[];
  final: Fixture | null;
  stage: EuroStage;
  championId: string | null;
  defendingChampionId: string | null;
}

export type TransferWindow = 'SUMMER' | 'WINTER' | 'CLOSED';

export interface SeasonState {
  year: number;
  /** next matchweek to be played (1..30); 31 = season complete */
  matchweek: number;
  window: TransferWindow;
}

export interface ManagerCareer {
  name: string;
  reputation: number;
  clubId: string | null;
  seasonsManaged: number;
  trophies: string[];
  sackings: number;
  matchesManaged: number;
  wins: number;
}

export interface SeasonRecord {
  year: number;
  clubId: string;
  clubName: string;
  tier: Tier;
  position: number;
  cupResult: string;
  euroResult: string;
  champions: Record<string, string>;
  note: string;
}

export type GameStatus = 'ONBOARDING' | 'PLAYING' | 'SACKED' | 'SEASON_END';

/**
 * The manager's week: PREP (pick the team, kick off) → MATCHDAY (watch the
 * games live, one at a time, recap at full time) → DAY_AFTER (recovery,
 * press conference, one-on-one drill) → PREP for the next matchweek.
 */
export type WeekPhase = 'PREP' | 'MATCHDAY' | 'DAY_AFTER';

export type RecoveryChoice = 'REST' | 'BALANCED' | 'INTENSE';

export interface WeekResultLine {
  fixtureId: string;
  competition: CompetitionKind;
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  penalties: { home: number; away: number } | null;
}

export interface SeasonSummary {
  year: number;
  lines: string[];
  promoted: string[];
  relegated: string[];
  champions: Record<string, string>;
  boardVerdict: string;
  incomeTV: number;
  euroEntrants: string[];
}

export interface GameState {
  saveVersion: number;
  rngState: number;
  idCounter: number;
  status: GameStatus;
  manager: ManagerCareer;
  activeCountry: CountryCode;
  season: SeasonState;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  staff: Record<string, StaffMember>;
  leagues: Record<string, League>;
  /** leagueId by country + tier e.g. "ENG-1" */
  cup: DomesticCup;
  euro: EuropeanCup;
  freeAgentIds: string[];
  staffMarketIds: string[];
  faxes: FaxMessage[];
  bids: TransferBid[];
  scouting: ScoutAssignment[];
  scoutReports: Record<string, ScoutReport>;
  pendingYouth: string[];
  jobOffers: JobOffer[];
  dilemma: Dilemma | null;
  /** titles of the last few dilemmas / press questions, so they don't repeat */
  dilemmaHistory?: string[];
  pressHistory?: string[];
  lastUserResults: MatchResult[];
  /** user club season totals (all competitions), for the Team Stats view */
  teamStats?: TeamSeasonStats;
  lastWeekResults: WeekResultLine[];
  history: SeasonRecord[];
  seasonSummary: SeasonSummary | null;
  /** count of AI swap faxes sent this season (max 2) */
  aiTradeFaxesThisSeason: number;
  lastSimMs: number;
  /** back-page newspaper archive, newest first (capped ~60) */
  news: NewsItem[];
  /** seed this world was generated from (fresh every career) */
  worldSeed: number;
  /** world-record transfer fee so far (for "RECORD!" headlines) */
  transferRecord: { fee: number; playerName: string; year: number } | null;
  /** de-dupe keys for one-off stories → season year they ran */
  newsKeys: Record<string, number>;
  phase: WeekPhase;
  /** user results already watched in full (never replayed) */
  watchedResults: string[];
  /** day-after press conference (null once answered / skipped) */
  pressConference: Dilemma | null;
  /** what has been done on the current day-after */
  dayAfter: { recovery: RecoveryChoice | null; pressDone: boolean };
  /** last one-on-one drill (one per week) */
  lastDrill: { year: number; week: number; playerId: string; drill: DrillKind; gained: string } | null;
  /** this week's one-on-one sessions (up to 3 players) */
  weekDrills?: { year: number; week: number; sessions: { playerId: string; drill: DrillKind; gained: string }[] } | null;
  /** the previous week's one-on-one program, offered again */
  lastDrillPlan?: { playerId: string; drill: DrillKind }[];
  /** fractional progress from one-on-one work, keyed "playerId:stat" (1.0 = +1) */
  drillProgress?: Record<string, number>;
  /** the Chief Scout's brief for his shortlist */
  scoutBrief?: { focus: string; country: CountryCode | 'ANY' };
  /** faxes that should open the fax machine on their own (urgent) */
  urgentFaxIds: string[];
  /** scouting department's standing shortlist of transfer targets */
  shortlist: { ids: string[]; year: number; week: number; notes?: Record<string, string> };
}
