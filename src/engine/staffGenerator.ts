import type { CountryCode, GameState } from '../types/world';
import type { StaffMember, StaffRole } from '../types/staff';
import { STAFF_ROLES } from '../types/staff';
import { NAME_POOLS } from '../data/namePools';
import { COUNTRIES } from '../data/countries';
import { clamp, type Rng } from './rng';
import { nextId } from './ids';
import { starsFromInternal } from './ratings';
import { fmtMoney } from './financeEngine';
import type { Club } from '../types/club';

/** Staff ability is stored 10..50, snapped to 5 (0.5★) steps. */
export function snapStaff(v: number): number {
  return clamp(Math.round(v / 5) * 5, 10, 50);
}

export function staffWage(ability: number, country: CountryCode): number {
  const stars = starsFromInternal(ability);
  return Math.round((450 * Math.pow(2.3, stars - 1) * COUNTRIES[country].wageMult) / 10) * 10;
}

/** The best staff a club can attract: reputation and division set the ceiling. */
export function staffCeiling(club: Club): number {
  return Math.min(5, 1.5 + club.reputation / 28 + (club.tier === 1 ? 0.5 : 0));
}

export type StaffInterest =
  | { kind: 'KEEN'; wage: number; fee: number; payoff: number }
  | { kind: 'PREMIUM'; wage: number; fee: number; payoff: number }
  | { kind: 'REFUSES'; reason: string };

/**
 * Would this person come? Within the club's ceiling they sign for their usual
 * wage; up to half a star above it they want a 60% premium; beyond that they
 * won't take the call. The fee is a signing-on payment (16 weeks' wages),
 * plus the departing incumbent's pay-off (8 weeks).
 */
export function staffInterest(g: GameState, club: Club, s: StaffMember): StaffInterest {
  const stars = starsFromInternal(s.ability);
  const cap = staffCeiling(club);
  const oldId = club.staff[s.role];
  const old = oldId ? g.staff[oldId] : null;
  const payoff = old ? old.wage * 8 : 0;
  if (stars > cap + 0.5) {
    return { kind: 'REFUSES', reason: stars >= 4.5 ? 'Laughs down the phone. He only talks to the big clubs.' : 'Not interested in a project at your level.' };
  }
  const premium = stars > cap;
  const wage = Math.round((s.wage * (premium ? 1.6 : 1)) / 10) * 10;
  return { kind: premium ? 'PREMIUM' : 'KEEN', wage, fee: wage * 16, payoff };
}

export function generateStaff(g: GameState, rng: Rng, role: StaffRole, ability: number, country: CountryCode, clubId: string | null): StaffMember {
  const pool = NAME_POOLS[country];
  const a = snapStaff(ability);
  const age = rng.int(34, 66);
  const headroom = age < 45 ? rng.int(0, 15) : age < 55 ? rng.int(0, 8) : rng.int(0, 3);
  const s: StaffMember = {
    id: nextId(g, 's'),
    name: `${rng.pick(pool.staffFirst)} ${rng.pick(pool.lastNames)}`,
    role,
    age,
    ability: a,
    staffPA: clamp(a + headroom, a, 50),
    wage: staffWage(a, country),
    clubId,
  };
  g.staff[s.id] = s;
  return s;
}

export function generateStaffMarket(g: GameState, rng: Rng, country: CountryCode): void {
  for (const id of g.staffMarketIds) delete g.staff[id];
  g.staffMarketIds = [];
  for (const role of STAFF_ROLES) {
    for (let i = 0; i < 4; i++) {
      const ability = rng.weighted([10, 15, 20, 25, 30, 35, 40, 45, 50], [10, 14, 16, 16, 14, 11, 9, 6, 4]);
      const s = generateStaff(g, rng, role, ability, country, null);
      g.staffMarketIds.push(s.id);
    }
  }
}

/**
 * Seasonal organic evolution: ±0.1–0.3★ (internal 1–3) based on age, club
 * performance and hidden ceiling, then possible retirement. Display snaps to 0.5★.
 */
export function evolveStaff(s: StaffMember, rng: Rng, clubDidWell: boolean): 'RETIRED' | 'OK' {
  s.age += 1;
  let delta = 0;
  if (s.age < 50 && s.ability < s.staffPA) delta += rng.range(1, 3) * (clubDidWell ? 1.2 : 0.8);
  else if (s.age >= 60) delta -= rng.range(0.5, 2.5);
  else delta += rng.range(-1, 1.2);
  s.ability = clamp(Math.round((s.ability + delta) * 10) / 10, 10, Math.max(s.staffPA, 10));
  if (s.age >= 67 || (s.age >= 62 && rng.chance(0.25))) return 'RETIRED';
  return 'OK';
}

export function staffStarsOf(g: GameState, clubId: string, role: StaffRole): number {
  const c = g.clubs[clubId];
  const id = c?.staff[role];
  if (!id) return 1;
  const s = g.staff[id];
  return s ? starsFromInternal(s.ability) : 1;
}

export function hireStaff(g: GameState, clubId: string, staffId: string): { ok: boolean; message: string } {
  const s = g.staff[staffId];
  const club = g.clubs[clubId];
  if (!s || s.clubId) return { ok: false, message: 'Not available.' };
  const it = staffInterest(g, club, s);
  if (it.kind === 'REFUSES') return { ok: false, message: `${s.name}: ${it.reason}` };
  const total = it.fee + it.payoff;
  if (club.finances.bank < total) return { ok: false, message: `You need ${fmtMoney(total)} for the signing-on fee${it.payoff ? ' and the pay-off' : ''}.` };
  const oldId = club.staff[s.role];
  if (oldId && g.staff[oldId]) {
    g.staff[oldId].clubId = null;
    g.staffMarketIds.push(oldId);
  }
  s.wage = it.wage;
  club.staff[s.role] = s.id;
  s.clubId = clubId;
  g.staffMarketIds = g.staffMarketIds.filter((x) => x !== staffId);
  club.finances.bank -= total;
  club.finances.ledger.staff += total;
  return { ok: true, message: `${s.name} hired (${starsFromInternal(s.ability)}★) on ${fmtMoney(it.wage)}/wk. Fees paid: ${fmtMoney(total)}.` };
}
