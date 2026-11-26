import type { CountryCode, GameState, Tier } from '../types/world';
import { primeWage } from './economy';
import { COUNTRY_CODES } from '../types/world';
import type { CareerCurve, NationCode, Player, PlayerStats, Position, Trait, StatKey } from '../types/player';
import { ALL_STATS } from '../types/player';
import { nationOf } from '../data/nationalities';
import { PLAYSTYLES, type Playstyle } from '../data/playstyles';
import { COUNTRIES } from '../data/countries';
import { ovrFor, POSITION_WEIGHTS } from './ratings';
import { clamp, type Rng } from './rng';
import { nextId } from './ids';

export const TRAITS: Trait[] = [
  'Poacher', 'Tireless Engine', 'Set-Piece Ace', 'Glass Ankles', 'Injury Prone', 'Big Game Player',
  'Consistent', 'Selfish', 'Clutch', 'Super-Sub', 'Reckless Tackler', 'Long-Throw Specialist',
];
const EXTREME_TRAITS: Trait[] = ['Selfish', 'Reckless Tackler', 'Glass Ankles', 'Big Game Player', 'Clutch', 'Super-Sub', 'Long-Throw Specialist', 'Poacher'];

const TRAIT_ALLOWED: Partial<Record<Trait, (pos: Position) => boolean>> = {
  Poacher: (p) => p === 'ST' || p === 'LW' || p === 'RW' || p === 'CAM',
  Selfish: (p) => p !== 'GK' && p !== 'CB',
  'Set-Piece Ace': (p) => p !== 'GK',
  'Reckless Tackler': (p) => p !== 'GK' && p !== 'ST',
  'Long-Throw Specialist': (p) => p === 'LB' || p === 'RB' || p === 'CB' || p === 'CDM' || p === 'CM',
  'Super-Sub': (p) => p !== 'GK',
  Clutch: (p) => p !== 'GK',
  'Tireless Engine': (p) => p !== 'GK',
};

const allowed = (t: Trait, pos: Position) => (TRAIT_ALLOWED[t] ? TRAIT_ALLOWED[t]!(pos) : true);

export function pickTraits(rng: Rng, pos: Position, extreme: boolean, hints: Trait[] = []): Trait[] {
  const count = extreme ? 2 : rng.chance(0.35) ? 2 : 1;
  const pool = (extreme ? EXTREME_TRAITS : TRAITS).filter((t) => allowed(t, pos));
  const out: Trait[] = [];
  // a playstyle-flavoured trait about half the time
  const fit = hints.filter((t) => allowed(t, pos));
  if (fit.length > 0 && rng.chance(extreme ? 0.6 : 0.45)) {
    const t = rng.pick(fit);
    out.push(t);
    const i = pool.indexOf(t);
    if (i >= 0) pool.splice(i, 1);
  }
  while (out.length < count && pool.length > 0) {
    const t = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
    if (t === 'Consistent' && out.includes('Selfish')) continue;
    if ((t === 'Glass Ankles' && out.includes('Injury Prone')) || (t === 'Injury Prone' && out.includes('Glass Ankles'))) continue;
    out.push(t);
  }
  return out;
}

export function rollCareerCurve(rng: Rng): CareerCurve {
  return rng.weighted<CareerCurve>(['STANDARD', 'LATE_BLOOMER', 'EARLY_PEAKER', 'AGELESS', 'FLOP'], [70, 10, 8, 7, 5]);
}

/** Potential headroom by age — identical across all countries. */
export function generatePA(rng: Rng, age: number, ca: number, curve: CareerCurve): number {
  let headroom: number;
  if (age <= 17) headroom = rng.range(4, 30);
  else if (age <= 19) headroom = rng.range(3, 24);
  else if (age <= 21) headroom = rng.range(2, 17);
  else if (age <= 23) headroom = rng.range(1, 11);
  else if (age <= 26) headroom = rng.range(0, 6);
  else headroom = rng.range(0, 2.5);
  if (curve === 'LATE_BLOOMER' && age < 27) headroom += rng.range(4, 10);
  if (curve === 'EARLY_PEAKER' && age > 21) headroom *= 0.3;
  return clamp(Math.round(ca + headroom), ca, 97);
}

const POS_WAGE: Record<Position, number> = {
  GK: 0.85, CB: 0.95, LB: 0.9, RB: 0.9, CDM: 0.95, CM: 1, CAM: 1.08, LW: 1.05, RW: 1.05, ST: 1.15,
};

export function wageFor(ca: number, tier: Tier, country: CountryCode, pos: Position): number {
  const tierMult = tier === 1 ? 1.05 : tier === 2 ? 1.0 : 0.9;
  const countryMult = 1 + (COUNTRIES[country].wageMult - 1) * 0.5;
  return Math.round((primeWage(ca) * tierMult * countryMult * POS_WAGE[pos]) / 10) * 10;
}

export interface GenPlayerOpts {
  nationality: NationCode;
  /** league the player is generated in (wages); defaults to nationality or ENG */
  country?: CountryCode;
  position: Position;
  age: number;
  targetOvr: number;
  clubId: string | null;
  tier: Tier;
  extremeTraits?: boolean;
  paOverride?: number;
  wageMult?: number;
  youth?: boolean;
}

export function rollPlaystyle(rng: Rng, pos: Position): Playstyle {
  const list = PLAYSTYLES[pos];
  return rng.weighted(list, list.map((s) => s.weight));
}

export function buildStats(rng: Rng, pos: Position, target: number, nationality: NationCode, extreme: boolean, style?: Playstyle): PlayerStats {
  const stats = {} as PlayerStats;
  const w = POSITION_WEIGHTS[pos];
  const isGK = pos === 'GK';
  const spread = extreme ? 11 : 5;
  for (const k of ALL_STATS) {
    const weight = w[k] ?? 0;
    const gkStat = k === 'reflexes' || k === 'handling' || k === 'positioning' || k === 'kicking';
    let v: number;
    if (isGK) {
      v = gkStat || k === 'physical' ? target + (weight - 0.2) * 20 + rng.normal(0, 4) : rng.range(15, 38);
    } else if (gkStat) {
      v = rng.range(5, 20);
    } else {
      v = target + (weight - 0.17) * 55 + rng.normal(0, spread);
    }
    if (style) v += ((style.bias[k] ?? 0) * (extreme ? 1.5 : 1)) * rng.range(0.6, 1.3);
    stats[k] = v;
  }
  // shift so the position OVR lands on target
  const shift = target - ovrFor(stats, pos);
  for (const k of ALL_STATS) {
    const relevant = (w[k] ?? 0) > 0;
    if (relevant) stats[k] += shift;
    stats[k] = clamp(Math.round(stats[k]), 1, 99);
  }
  // country lean (small, not a potential buff)
  const lean = nationOf(nationality).statLean;
  for (const k in lean) {
    const key = k as StatKey;
    stats[key] = clamp(stats[key] + (lean[key] as number), 1, 99);
  }
  return stats;
}

export function generatePlayer(g: GameState, rng: Rng, o: GenPlayerOpts): Player {
  const nation = nationOf(o.nationality);
  const style = rollPlaystyle(rng, o.position);
  const stats = buildStats(rng, o.position, clamp(o.targetOvr, 25, 95), o.nationality, !!o.extremeTraits, style);
  const ca = ovrFor(stats, o.position);
  const careerCurve = rollCareerCurve(rng);
  const truePA = o.paOverride !== undefined ? Math.max(o.paOverride, ca) : generatePA(rng, o.age, ca, careerCurve);
  const wageCountry: CountryCode = o.country ?? ((COUNTRY_CODES as string[]).includes(o.nationality) ? (o.nationality as CountryCode) : 'ENG');
  const wage = Math.round(wageFor(ca, o.tier, wageCountry, o.position) * (o.wageMult ?? 1));
  const years = o.youth ? 3 : o.age >= 32 ? rng.int(1, 2) : rng.int(1, 4);
  const p: Player = {
    id: nextId(g, 'p'),
    firstName: rng.pick(nation.firstNames),
    lastName: rng.pick(nation.lastNames),
    nationality: o.nationality,
    playstyle: style.name,
    preferredRole: style.role,
    age: o.age,
    position: o.position,
    stats,
    ca,
    truePA,
    paSeed: Math.floor(rng.next() * 1e9),
    careerCurve,
    traits: pickTraits(rng, o.position, !!o.extremeTraits, style.traitHints),
    fitness: 100,
    form: 0,
    streak: 0,
    moraleValue: rng.int(48, 68),
    clubId: o.clubId,
    contract: { wage: Math.max(150, wage), yearsLeft: years, releaseClause: null },
    injuryWeeks: 0,
    injury: null,
    xpBank: 0,
    trainingFocus: 'NONE',
    season: emptySeasonStats(),
    loanFromClubId: null,
    isYouthProduct: !!o.youth,
    fanFavorite: false,
    recentRatings: [],
  };
  return p;
}

export function emptySeasonStats() {
  return { apps: 0, minutes: 0, goals: 0, assists: 0, xg: 0, xa: 0, shots: 0, ratingSum: 0 };
}

export const SQUAD_TEMPLATE: Position[] = [
  'GK', 'GK', 'CB', 'CB', 'CB', 'CB', 'LB', 'LB', 'RB', 'RB', 'CDM', 'CDM', 'CM', 'CM', 'CM', 'CAM', 'LW', 'LW', 'RW', 'RW', 'ST', 'ST', 'ST',
];

export function randomAge(rng: Rng, min = 17, max = 35): number {
  // bell-ish around 25
  const a = Math.round(rng.normal(25.5, 4));
  return clamp(a, min, max);
}
