/** Weekly cash flow, gate receipts, TV/prize money, facility upgrades, wage caps. */
import type { GameState, Tier } from '../types/world';
import type { Club, Facilities } from '../types/club';
import type { CompetitionKind } from '../types/match';
import { COUNTRIES } from '../data/countries';
import { clamp } from './rng';

// 1990s scale: income is tuned so a club's gates and TV money only just cover its wage bill
// in-season gates and TV instalments roughly cover an average wage bill; the rollover injection below is the summer budget
const TICKET: Record<Tier, number> = { 1: 11.5, 2: 5.4, 3: 4.6 };
const TV_BASE: Record<Tier, number> = { 1: 2_600_000, 2: 460_000, 3: 140_000 };
const WAGE_BASELINE: Record<Tier, number> = { 1: 320_000, 2: 75_000, 3: 28_000 };

export function attendance(home: Club, away: Club, isDerby: boolean, competition: CompetitionKind): number {
  let fill = 0.32 + (home.fanInterest / 100) * 0.55 + (away.reputation / 100) * 0.12;
  if (isDerby) fill += 0.12;
  if (competition !== 'LEAGUE') fill += 0.08;
  return Math.round(home.capacity * clamp(fill, 0.18, 1));
}

/** Returns {home, away} receipts. Cup gates are split 50/50 (giant-killing paydays). */
export function gateReceipts(home: Club, away: Club, isDerby: boolean, competition: CompetitionKind): { home: number; away: number; crowd: number } {
  const crowd = attendance(home, away, isDerby, competition);
  const price = TICKET[home.tier] * (competition === 'EURO' ? 1.6 : 1) * (0.85 + home.fanInterest / 330);
  const gross = Math.round(crowd * price);
  if (competition === 'CUP' || competition === 'PLAYOFF') return { home: Math.round(gross / 2), away: Math.round(gross / 2), crowd };
  return { home: gross, away: 0, crowd };
}

export function weeklyWageBill(g: GameState, club: Club): { players: number; staff: number } {
  let players = 0;
  for (const id of club.playerIds) {
    const p = g.players[id];
    if (p) players += p.contract.wage;
  }
  let staff = 0;
  for (const sid of Object.values(club.staff)) if (sid && g.staff[sid]) staff += g.staff[sid].wage;
  return { players, staff };
}

/** The board keeps this many weeks of wages untouchable: you can spend the rest. */
export const RESERVE_WEEKS = 6;
export function weeklyBill(g: GameState, club: Club): number {
  const w = weeklyWageBill(g, club);
  return w.players + w.staff;
}
/** Cash the board will let you spend on fees, bonuses and building work. */
export function spendable(g: GameState, club: Club): number {
  return club.finances.bank - RESERVE_WEEKS * weeklyBill(g, club);
}
export function noBudget(g: GameState, club: Club, cost: number): string | null {
  const room = spendable(g, club);
  if (cost <= room) return null;
  return `The board won't sign that off: it would leave under ${RESERVE_WEEKS} weeks of wages in the bank. Your spending budget is ${fmtMoney(Math.max(0, room))}.`;
}

/** TV money arrives in weekly instalments (70%) with the rest as a merit payment at season end. */
export const TV_WEEKLY_SHARE = 0.7;
export function weeklyTV(club: Club, position: number): number {
  return Math.round((tvMoney(club, position) * TV_WEEKLY_SHARE) / 30 / 100) * 100;
}

/** Season-rollover injection: league-position prize money plus season tickets and pre-season TV rights. */
const INJECTION: Record<Tier, [number, number]> = { 1: [4_000_000, 11_000_000], 2: [1_100_000, 2_800_000], 3: [280_000, 630_000] };
export function seasonInjection(tier: Tier, position: number, leagueSize: number, mult = 1, extra = 0): { prize: number; rights: number } {
  const [lo, hi] = INJECTION[tier];
  const t = Math.pow(Math.max(0, leagueSize - position) / Math.max(1, leagueSize - 1), 1.6);
  const total = (lo + (hi - lo) * t) * mult + extra;
  return { prize: Math.round((total * 0.4) / 1000) * 1000, rights: Math.round((total * 0.6) / 1000) * 1000 };
}

/** What a typical club of each tier pays out in wages and staff each week. */
export const TIER_BILL_AVG: Record<Tier, number> = { 1: 340_000, 2: 57_000, 3: 20_000 };
/** Cash balance a board bailout restores. */
export const BAILOUT_FLOOR: Record<Tier, number> = { 1: 3_000_000, 2: 900_000, 3: 250_000 };

/**
 * What a club can expect to earn per week in a normal league season: home gates (half the weeks)
 * plus the TV instalment at mid-table. The wage budget is set against this, so it always makes sense.
 */
export function expectedWeeklyIncome(club: Club): number {
  const gate = gateReceipts(club, { ...club, reputation: 40 }, false, 'LEAGUE').home;
  return Math.round(((gate * 15) / 30 + weeklyTV(club, 8)) * 1.18); // calibrated against simulated seasons (cups and big games add gate money)
}
/** The weekly wage bill (players + staff) the club's income can carry. */
export function wageBudget(club: Club, g?: GameState): number {
  // normal weekly income, plus half of a mid-table summer injection spread over the season: wages can use it, the rest stays as transfer money
  const inj = seasonInjection(club.tier, 8, 16);
  const base = (expectedWeeklyIncome(club) * 0.95 + ((inj.prize + inj.rights) * 0.5) / 30) * 1.1;
  return Math.round(base * (g ? squadFactor(g, club) : 1));
}

/** Average CA of a club's best XI. */
export function bestXI(g: GameState, club: Club): number {
  const cas = club.playerIds.map((id) => g.players[id]?.ca ?? 0).sort((a, b) => b - a).slice(0, 11);
  return cas.length ? cas.reduce((a, b) => a + b, 0) / cas.length : 0;
}
/** A strong squad draws bigger crowds, sponsors and owners' money: 0.85 for a weak XI up to 1.4 for a stacked one, relative to its league. */
export function squadFactor(g: GameState, club: Club): number {
  const lg = g.leagues[club.leagueId];
  if (!lg || lg.clubIds.length < 2) return 1;
  let sum = 0, n = 0;
  for (const id of lg.clubIds) { const c = g.clubs[id]; if (c) { sum += bestXI(g, c); n++; } }
  const diff = bestXI(g, club) - sum / Math.max(1, n);
  return Math.max(0.85, Math.min(1.4, 1 + diff * 0.035));
}

/** Set a club's player contracts so its weekly bill fits the wage budget (AI clubs and new worlds; never the user's). */
export function trimToWageBudget(g: GameState, club: Club): void {
  const w = weeklyWageBill(g, club);
  const room = wageBudget(club, g) - w.staff;
  if (w.players <= room || room <= 0) return;
  const f = room / w.players;
  for (const id of club.playerIds) {
    const p = g.players[id];
    if (p) p.contract.wage = Math.max(150, Math.round((p.contract.wage * f) / 10) * 10);
  }
}

/**
 * One-time fix for saves made before wage budgets existed: bring every club's bill inside its budget
 * (the user's wages only ever go down), lift any old transfer freeze, and top the bank up to the bailout floor.
 */
export function fitSaveToWageBudget(g: GameState): boolean {
  if (g.wageFitV3) return false;
  for (const c of Object.values(g.clubs)) {
    if (c.isShadow) continue;
    trimToWageBudget(g, c);
    if (c.id === g.manager.clubId) {
      c.finances.restructuring = false;
      const floor = Math.max(BAILOUT_FLOOR[c.tier], Math.round(weeklyBill(g, c) * 12 / 1000) * 1000);
      if (c.finances.bank < floor) c.finances.bank = floor;
    }
  }
  g.wageFitV3 = true;
  return true;
}

export function payWeeklyWages(g: GameState, club: Club): void {
  const w = weeklyWageBill(g, club);
  club.finances.bank -= w.players + w.staff;
  club.finances.ledger.wages += w.players;
  club.finances.ledger.staff += w.staff;
}

export function credit(club: Club, amount: number, cat: 'tickets' | 'tv' | 'prize' | 'sales'): void {
  club.finances.bank += amount;
  club.finances.ledger[cat] += amount;
}

export function tvMoney(club: Club, position: number): number {
  const posFactor = 1.3 - (position - 1) * 0.04;
  const fanFactor = 0.8 + club.fanInterest / 250;
  return Math.round(TV_BASE[club.tier] * COUNTRIES[club.country].tvMoneyMult * posFactor * fanFactor / 1000) * 1000;
}

export const CUP_PRIZE = [15_000, 30_000, 60_000, 120_000, 250_000, 500_000];
export const EURO_PRIZE = { group: 350_000, win: 60_000, qf: 450_000, sf: 800_000, final: 1_400_000, champion: 2_000_000 };

export type FacilityKey = keyof Facilities;
const FAC_BASE: Record<FacilityKey, number> = { stadium: 190_000, training: 135_000, youth: 120_000 };

export function facilityUpgradeCost(club: Club, key: FacilityKey): number | null {
  const lvl = club.facilities[key];
  if (lvl >= 5) return null;
  return Math.round((FAC_BASE[key] * Math.pow(2.1, lvl - 1) * COUNTRIES[club.country].facilityCostMult) / 1000) * 1000;
}

export function upgradeFacility(club: Club, key: FacilityKey, _g?: GameState): { ok: boolean; message: string } {
  const cost = facilityUpgradeCost(club, key);
  if (cost === null) return { ok: false, message: 'Already at maximum level.' };
  if (club.finances.bank < cost) return { ok: false, message: 'Insufficient funds.' };
  club.finances.bank -= cost;
  club.finances.ledger.facilities += cost;
  club.facilities[key] += 1;
  if (key === 'stadium') club.capacity = Math.round((club.capacity * 1.22 + 1500) / 100) * 100;
  return { ok: true, message: `${key === 'stadium' ? 'Stadium' : key === 'training' ? 'Training ground' : 'Youth academy'} upgraded to level ${club.facilities[key]}.` };
}

/** Spain: strict weekly wage cap. */
export function wageCap(club: Club): number | null {
  const m = COUNTRIES[club.country].wageCapMult;
  return m === null ? null : Math.round(WAGE_BASELINE[club.tier] * m * (0.8 + club.reputation / 250));
}

export function canAffordWage(g: GameState, club: Club, extraWeekly: number): { ok: boolean; message: string } {
  const cap = wageCap(club);
  if (cap === null) return { ok: true, message: '' };
  const bill = weeklyWageBill(g, club).players;
  if (bill + extraWeekly > cap) return { ok: false, message: `League wage cap: bill would exceed $${cap.toLocaleString()}/wk.` };
  return { ok: true, message: '' };
}

export function inTheRed(club: Club): boolean {
  return club.finances.bank < 0;
}

export function fmtMoney(v: number): string {
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}K`;
  return `${sign}$${Math.round(a)}`;
}

/** Summer funding: league-position money, scaled by squad quality, plus the owners backing the wage commitments (8 weeks of the bill). */
export function summerFunding(g: GameState, club: Club, position: number, leagueSize: number): { prize: number; rights: number } {
  return seasonInjection(club.tier, position, leagueSize, squadFactor(g, club), weeklyBill(g, club) * 8);
}
