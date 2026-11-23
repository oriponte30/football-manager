/** Weekly cash flow, gate receipts, TV/prize money, facility upgrades, wage caps. */
import type { GameState, Tier } from '../types/world';
import type { Club, Facilities } from '../types/club';
import type { CompetitionKind } from '../types/match';
import { COUNTRIES } from '../data/countries';
import { clamp } from './rng';

const TICKET: Record<Tier, number> = { 1: 26, 2: 14, 3: 8 };
const TV_BASE: Record<Tier, number> = { 1: 6_000_000, 2: 1_300_000, 3: 260_000 };
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

export const CUP_PRIZE = [40_000, 90_000, 180_000, 350_000, 700_000, 1_500_000];
export const EURO_PRIZE = { group: 900_000, win: 150_000, qf: 1_200_000, sf: 2_000_000, final: 3_500_000, champion: 5_000_000 };

export type FacilityKey = keyof Facilities;
const FAC_BASE: Record<FacilityKey, number> = { stadium: 420_000, training: 300_000, youth: 260_000 };

export function facilityUpgradeCost(club: Club, key: FacilityKey): number | null {
  const lvl = club.facilities[key];
  if (lvl >= 5) return null;
  return Math.round((FAC_BASE[key] * Math.pow(2.1, lvl - 1) * COUNTRIES[club.country].facilityCostMult) / 1000) * 1000;
}

export function upgradeFacility(club: Club, key: FacilityKey): { ok: boolean; message: string } {
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
