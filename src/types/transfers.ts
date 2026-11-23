import type { StatKey, Trait } from './player';

export type BidType = 'TRANSFER' | 'LOAN';
export type BidStatus = 'PENDING' | 'ACCEPTED' | 'COUNTERED' | 'REJECTED' | 'COMPLETED' | 'COLLAPSED';
export type BidDirection = 'OUTGOING' | 'INCOMING';

export interface TransferBid {
  id: string;
  type: BidType;
  direction: BidDirection;
  playerId: string;
  buyerClubId: string;
  sellerClubId: string | null;
  fee: number;
  wage: number;
  years: number;
  /** trade toggle */
  includePlayerId: string | null;
  /** fraction of wages paid by the borrowing club (loans) */
  loanWageShare: number;
  status: BidStatus;
  counterFee: number | null;
  resolveWeek: number;
  season: number;
  note: string;
  /** incoming bids: the buyer's hidden walk-away price */
  walkAway?: number;
  /** incoming bids: negotiation rounds used */
  rounds?: number;
}

export interface LoanOffer {
  playerId: string;
  fromClubId: string;
  toClubId: string;
  wageShare: number;
}

export interface TradeProposal {
  id: string;
  fromClubId: string;
  offeredPlayerId: string;
  requestedPlayerId: string;
  cashAdjustment: number;
}

export interface ScoutAssignment {
  id: string;
  playerId: string;
  readyWeek: number;
  readySeason: number;
}

export interface ScoutReport {
  playerId: string;
  staffStars: number;
  season: number;
  week: number;
  statRanges: Partial<Record<StatKey, [number, number]>>;
  ovrRange: [number, number];
  paRange: [number, number];
  revealedTraits: Trait[];
  hiddenTraitCount: number;
  verdict: string;
  /** clarity 0..1 drives fax rendering (messy vs crisp) */
  clarity: number;
  /** plain-language notes (strengths, fitness, mood, outlook); older saves lack it */
  notes?: string[];
}

export interface JobOffer {
  id: string;
  clubId: string;
  reason: string;
  expiresWeek: number;
  isLifeline: boolean;
}

export type DilemmaEffect =
  | { kind: 'PLAYER_MORALE'; playerId: string; delta: number }
  | { kind: 'TEAM_ATMOSPHERE'; delta: number }
  | { kind: 'SQUAD_FITNESS'; delta: number }
  | { kind: 'BANK'; delta: number }
  | { kind: 'FAN_INTEREST'; delta: number }
  | { kind: 'BOARD'; delta: number }
  | { kind: 'WAGE_RISE'; playerId: string; pct: number }
  | { kind: 'SQUAD_MORALE'; delta: number }
  | { kind: 'PLAYER_FITNESS'; playerId: string; delta: number };

export interface DilemmaOption {
  label: string;
  description: string;
  effects: DilemmaEffect[];
}

export interface Dilemma {
  id: string;
  title: string;
  text: string;
  options: DilemmaOption[];
}

export type FaxKind =
  | 'SCOUT_REPORT'
  | 'BID_RESPONSE'
  | 'INCOMING_BID'
  | 'LOAN_RESPONSE'
  | 'TRADE_PROPOSAL'
  | 'JOB_OFFER'
  | 'TERMINATION'
  | 'DILEMMA'
  | 'YOUTH_INTAKE'
  | 'BOARD'
  | 'NEWS'
  | 'CONTRACT';

export interface FaxMessage {
  id: string;
  kind: FaxKind;
  season: number;
  week: number;
  from: string;
  title: string;
  body: string;
  read: boolean;
  /** action references */
  bidId?: string;
  playerId?: string;
  jobOfferId?: string;
  tradeId?: string;
  trade?: TradeProposal;
  resolved: boolean;
  /** urgent faxes open the fax machine on their own */
  urgent?: boolean;
}
