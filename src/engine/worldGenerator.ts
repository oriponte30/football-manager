/**
 * World generation: 5 countries, 3 full tiers for the active nation, shadow
 * Tier 1s for the other four, staff, free agents and the 3 faxed job offers.
 */
import type { CountryCode, GameState, League, Tier } from '../types/world';
import { COUNTRY_CODES } from '../types/world';
import type { ArchetypeId, Club, BoardGoal } from '../types/club';
import type { Position } from '../types/player';
import type { StaffRole } from '../types/staff';
import type { FormationId, TeamDials } from '../types/tactics';
import type { JobOffer } from '../types/transfers';
import { STAFF_ROLES } from '../types/staff';
import { NAME_POOLS, CLUB_COLORS } from '../data/namePools';
import { COUNTRIES } from '../data/countries';
import { ARCHETYPES, ARCHETYPE_IDS } from '../data/archetypes';
import { FORMATION_IDS, defaultRoles } from '../data/formations';
import { rollNationality } from '../data/nationalities';
import { createRng, clamp, type Rng } from './rng';
import { nextId } from './ids';
import { generatePlayer, SQUAD_TEMPLATE } from './playerGenerator';
import { ensureFreeAgentCoverage } from './freeAgentPool';
import { generateStaff, generateStaffMarket } from './staffGenerator';
import { fillLineup, preferredRoles, squadStrength } from './lineup';
import { valuePlayer } from './transferEngine';
import { setupSeason } from './seasonLoop';

export const SAVE_VERSION = 5;

export function createEmptyGame(managerName: string, country: CountryCode, seed: number): GameState {
  return {
    saveVersion: SAVE_VERSION,
    rngState: seed >>> 0,
    idCounter: 0,
    status: 'ONBOARDING',
    manager: { name: managerName || 'The Gaffer', reputation: 20, clubId: null, seasonsManaged: 0, trophies: [], sackings: 0, matchesManaged: 0, wins: 0 },
    activeCountry: country,
    season: { year: 1994, matchweek: 1, window: 'SUMMER' },
    clubs: {}, players: {}, staff: {}, leagues: {},
    cup: { name: COUNTRIES[country].cupName, rounds: [], championId: null },
    euro: { groups: [], groupFixtures: [], quarterFinals: [], semiFinals: [], final: null, stage: 'GROUPS', championId: null, defendingChampionId: null },
    freeAgentIds: [], staffMarketIds: [], faxes: [], bids: [], scouting: [], scoutReports: {},
    pendingYouth: [], jobOffers: [], dilemma: null, lastUserResults: [], lastWeekResults: [],
    history: [], seasonSummary: null, aiTradeFaxesThisSeason: 0, lastSimMs: 0, news: [], phase: 'PREP', watchedResults: [], pressConference: null, dayAfter: { recovery: null, pressDone: false }, lastDrill: null, urgentFaxIds: [], shortlist: { ids: [], year: 0, week: 0 }, worldSeed: seed >>> 0, transferRecord: { fee: 12_000_000, playerName: 'the standing record', year: 1992 }, newsKeys: {},
  };
}

function townNames(rng: Rng, code: CountryCode, n: number): string[] {
  const pool = NAME_POOLS[code];
  const set = new Set<string>(pool.towns);
  let guard = 0;
  while (set.size < n + 10 && guard++ < 5000) {
    const pre = rng.pick(pool.townPrefixes);
    const suf = rng.pick(pool.townSuffixes);
    let name: string;
    if (code === 'ESP' || code === 'ITA') name = pre === 'San' || pre === 'Santa' ? `${pre} ${capital(suf)}` : pre + suf;
    else if (code === 'FRA') name = pre === 'Saint' ? `Saint-${capital(suf)}` : suf.includes('-') ? `${pre}${'-'}${suf.split('-').slice(1).join('-')}` : pre + suf;
    else name = pre + suf;
    set.add(name);
  }
  return rng.shuffle([...set]).slice(0, n);
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function shortName(town: string): string {
  return town.replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 3).toUpperCase();
}

/** Tactical identities for AI clubs: a named philosophy with dials + favoured shapes. */
export interface TacticalIdentity {
  name: string;
  dials: TeamDials;
  formations: FormationId[];
  weight: number;
}

export const TACTICAL_IDENTITIES: TacticalIdentity[] = [
  { name: 'Balanced', dials: { mentality: 'BALANCED', passingStyle: 'BALANCED', pressing: 'MID', attackingFocus: 'BALANCED' }, formations: ['4-4-2', '4-2-3-1', '4-3-3'], weight: 3 },
  { name: 'Total Football', dials: { mentality: 'ATTACKING', passingStyle: 'SHORT', pressing: 'HIGH', attackingFocus: 'BALANCED' }, formations: ['4-3-3'], weight: 1 },
  { name: 'Catenaccio', dials: { mentality: 'DEFENSIVE', passingStyle: 'BALANCED', pressing: 'LOW', attackingFocus: 'MIDDLE' }, formations: ['5-3-2', '3-5-2'], weight: 1 },
  { name: 'Long Ball', dials: { mentality: 'BALANCED', passingStyle: 'DIRECT', pressing: 'MID', attackingFocus: 'WINGS' }, formations: ['4-4-2'], weight: 1.4 },
  { name: 'Gegenpress', dials: { mentality: 'ATTACKING', passingStyle: 'DIRECT', pressing: 'HIGH', attackingFocus: 'MIDDLE' }, formations: ['4-2-3-1', '4-3-3'], weight: 1 },
  { name: 'Counter-Attack', dials: { mentality: 'DEFENSIVE', passingStyle: 'DIRECT', pressing: 'LOW', attackingFocus: 'WINGS' }, formations: ['4-4-2', '5-3-2'], weight: 1.2 },
  { name: 'Wing Play', dials: { mentality: 'BALANCED', passingStyle: 'BALANCED', pressing: 'MID', attackingFocus: 'WINGS' }, formations: ['4-4-2', '4-3-3'], weight: 1.2 },
  { name: 'Tiki-Taka', dials: { mentality: 'BALANCED', passingStyle: 'SHORT', pressing: 'HIGH', attackingFocus: 'MIDDLE' }, formations: ['4-3-3', '4-2-3-1'], weight: 0.8 },
  { name: 'Park the Bus', dials: { mentality: 'DEFENSIVE', passingStyle: 'DIRECT', pressing: 'LOW', attackingFocus: 'BALANCED' }, formations: ['5-3-2'], weight: 0.6 },
];

/** Country flavour on identity odds (Italy loves a back five, England goes long…). */
const IDENTITY_LEAN: Record<CountryCode, Record<string, number>> = {
  ENG: { 'Long Ball': 2.2, 'Wing Play': 1.6, 'Tiki-Taka': 0.4 },
  ESP: { 'Tiki-Taka': 2.5, 'Total Football': 1.3, 'Long Ball': 0.4 },
  ITA: { Catenaccio: 3, 'Counter-Attack': 1.5, 'Park the Bus': 1.4 },
  GER: { Gegenpress: 2.5, 'Wing Play': 1.2 },
  FRA: { 'Counter-Attack': 1.6, 'Total Football': 1.3, 'Wing Play': 1.2 },
};

export function rollIdentity(rng: Rng, country: CountryCode): TacticalIdentity {
  const lean = IDENTITY_LEAN[country];
  return rng.weighted(TACTICAL_IDENTITIES, TACTICAL_IDENTITIES.map((t) => t.weight * (lean[t.name] ?? 1)));
}

/** Identity dials with a little per-club wobble so no two sides are clones. */
function identityDials(rng: Rng, id: TacticalIdentity): TeamDials {
  const d = { ...id.dials };
  if (rng.chance(0.2)) d.attackingFocus = rng.pick(['WINGS', 'BALANCED', 'MIDDLE'] as const);
  if (rng.chance(0.15)) d.passingStyle = rng.pick(['SHORT', 'BALANCED', 'DIRECT'] as const);
  return d;
}

export function boardGoalFor(tier: Tier, rankByStrength: number, archetypeGoal?: 'PROMOTION' | 'PLAYOFF' | 'TOP_HALF' | 'MIDTABLE' | 'SURVIVAL'): BoardGoal {
  if (archetypeGoal === 'PROMOTION') return { kind: 'PROMOTION', targetPosition: 3, label: 'Win promotion — NOW (top 3)' };
  if (archetypeGoal === 'MIDTABLE') return { kind: 'TOP_HALF', targetPosition: 12, label: 'Keep the faithful entertained (top 12)' };
  if (archetypeGoal === 'PLAYOFF') return { kind: 'PLAYOFF', targetPosition: 6, label: 'Push for promotion (top 6)' };
  if (archetypeGoal === 'TOP_HALF') return { kind: 'TOP_HALF', targetPosition: 10, label: 'Finish in the top 10' };
  if (archetypeGoal === 'SURVIVAL') return { kind: 'SURVIVAL', targetPosition: 14, label: 'Blood the kids, stay off the bottom (top 14)' };
  if (tier === 1) {
    if (rankByStrength <= 2) return { kind: 'TITLE', targetPosition: 2, label: 'Challenge for the title' };
    if (rankByStrength <= 5) return { kind: 'EUROPE', targetPosition: 4, label: 'Qualify for Europe (top 4)' };
    if (rankByStrength <= 10) return { kind: 'TOP_HALF', targetPosition: 10, label: 'Finish in the top half' };
    return { kind: 'SURVIVAL', targetPosition: 13, label: 'Avoid relegation' };
  }
  if (rankByStrength <= 3) return { kind: 'PROMOTION', targetPosition: 3, label: 'Win promotion' };
  if (rankByStrength <= 7) return { kind: 'PLAYOFF', targetPosition: 6, label: 'Push for the top 6' };
  if (rankByStrength <= 12) return { kind: 'TOP_HALF', targetPosition: 11, label: 'A comfortable mid-table finish' };
  return { kind: 'SURVIVAL', targetPosition: 13, label: 'Avoid relegation' };
}

interface ClubSpec {
  country: CountryCode;
  tier: Tier;
  rank: number;
  name: string;
  town: string;
  isShadow: boolean;
  leagueId: string;
  archetype: ArchetypeId | null;
}

/** Tier OVR bounds: every club's strength is rolled inside its tier's band. */
const TIER_BOUNDS: Record<Tier, [number, number]> = { 1: [66, 85], 2: [57, 69], 3: [50, 61] };

function tierCenter(tier: Tier, rank: number, rng: Rng): number {
  let c: number;
  if (tier === 1) c = 83 - rank * 0.95 + rng.normal(0, 1.6);
  else if (tier === 2) c = 67.5 - rank * 0.6 + rng.normal(0, 1.3);
  else c = 60 - rank * 0.45 + rng.normal(0, 1.1);
  return clamp(c, TIER_BOUNDS[tier][0], TIER_BOUNDS[tier][1]);
}

function createClub(g: GameState, rng: Rng, spec: ClubSpec, colorIdx: number): Club {
  const { tier, rank } = spec;
  const arch = spec.archetype ? ARCHETYPES[spec.archetype] : null;
  const center = arch ? arch.squadOvr : tierCenter(tier, rank, rng);
  const reputation = arch ? arch.reputation : Math.round((tier === 1 ? 95 - rank * 3 : tier === 2 ? 52 - rank * 1.5 : 30 - rank) + rng.normal(0, tier === 1 ? 5 : 4));
  const capacity = arch ? arch.capacity : Math.round((tier === 1 ? rng.range(28000, 78000) - rank * 1500 : tier === 2 ? rng.range(12000, 30000) : rng.range(4000, 14000)) / 100) * 100;
  const facLvl = tier === 1 ? 4 : tier === 2 ? 3 : 2;
  const bank = arch ? arch.bank : Math.round((tier === 1 ? rng.range(6e6, 30e6) - rank * 6e5 : tier === 2 ? rng.range(1.5e6, 4.5e6) : rng.range(2.5e5, 9e5)) / 1000) * 1000;
  const identity = rollIdentity(rng, spec.country);
  const formation: FormationId = rng.chance(0.8) ? rng.pick(identity.formations) : rng.pick(FORMATION_IDS);
  // squad profile: some clubs are deep, some top-heavy; some young, some veteran
  const depthSd = rng.range(2, 4.5);
  const ageMean = rng.range(23.5, 28);
  const id = nextId(g, 'c');
  const club: Club = {
    id,
    name: spec.name,
    shortName: shortName(spec.town),
    country: spec.country,
    tier,
    isShadow: spec.isShadow,
    leagueId: spec.leagueId,
    reputation: clamp(reputation, 5, 99),
    capacity: Math.max(2500, capacity),
    facilities: {
      stadium: clamp(facLvl + rng.int(-1, 1) + (arch?.id === 'FALLEN_GIANT' ? 2 : 0), 1, 5),
      training: clamp(facLvl + rng.int(-1, 1) - (arch?.id === 'TINY_UNDERDOG' ? 1 : 0), 1, 5),
      youth: clamp(facLvl + rng.int(-1, 1) + (arch?.id === 'YOUTH_GAMBLE' ? 2 : 0), 1, 5),
    },
    finances: { bank, ledger: emptyLedger() },
    fanInterest: arch ? arch.fanInterest : Math.round(clamp(rng.normal(tier === 1 ? 62 : 50, 8), 20, 90)),
    board: { value: arch ? arch.boardStart : 60, patience: arch ? arch.boardPatience : 1, goal: boardGoalFor(tier, rank + 1, arch?.boardGoal) },
    archetype: spec.archetype,
    homeBoost: arch ? arch.homeBoost : 1,
    playerIds: [],
    staff: { HEAD_COACH: null, CHIEF_SCOUT: null, YOUTH_DIRECTOR: null, PHYSIO: null },
    tactics: {
      formation,
      dials: identityDials(rng, identity),
      lineup: [],
      roles: defaultRoles(formation),
      bench: [],
      trainingFocus: 'BALANCED',
      trainingTags: [],
      instructions: [],
    },
    familiarity: 80,
    familiarityByFormation: { [formation]: 80 },
    lastPlayedDials: null,
    teamAtmosphere: 55,
    colors: CLUB_COLORS[colorIdx % CLUB_COLORS.length],
    rivalId: null,
    streak: 0,
    identity: arch ? (arch.id === 'CULT_CLUB' ? 'Chaos Ball' : 'Balanced') : identity.name,
  };
  g.clubs[id] = club;

  // staff
  for (const role of STAFF_ROLES) {
    const ability = arch ? arch.staff[role as StaffRole] : tier === 1 ? rng.int(28, 46) : tier === 2 ? rng.int(18, 34) : rng.int(10, 26);
    const s = generateStaff(g, rng, role, ability, spec.country, id);
    club.staff[role] = s.id;
  }

  // squad
  const wageMult = arch ? arch.wageMult : 1;
  const posCount: Partial<Record<Position, number>> = {};
  for (const pos of SQUAD_TEMPLATE) {
    const idx = posCount[pos] ?? 0;
    posCount[pos] = idx + 1;
    const age = arch ? rng.int(arch.ageMin, arch.ageMax) : clamp(Math.round(rng.normal(ageMean, 4)), 17, 35);
    let target = idx === 0 ? center + rng.normal(1.5, depthSd * 0.8) : center - 3 + rng.normal(0, depthSd);
    if (arch?.id === 'YOUTH_GAMBLE') target = clamp(rng.range(47.5, 52.5), 47, 53);
    if (arch?.id === 'CULT_CLUB') target = center + rng.normal(0, arch.squadSpread);
    if (age <= 20) target -= (21 - age) * 1.8;
    if (age >= 33) target -= (age - 32) * 1.2;
    const nationality = rollNationality(rng, spec.country, tier === 1 ? 'SENIOR_T1' : 'SENIOR');
    const p = generatePlayer(g, rng, {
      nationality, country: spec.country, position: pos, age, targetOvr: target, clubId: id, tier, extremeTraits: arch?.extremeTraits, wageMult,
    });
    if (rng.chance(0.2)) p.contract.releaseClause = Math.round(valuePlayer(p, 3) * rng.range(1.6, 3) / 1000) * 1000;
    g.players[p.id] = p;
    club.playerIds.push(p.id);
  }

  // Youth Gamble: 2–3 raw 18-year-olds, 72–78 PA, short contracts, low release clauses
  if (arch && arch.prospects > 0) {
    const n = rng.int(2, 3);
    const poss: Position[] = ['ST', 'CM', 'CB', 'LW', 'CAM'];
    for (let i = 0; i < n; i++) {
      const p = generatePlayer(g, rng, {
        nationality: rollNationality(rng, spec.country, 'YOUTH'), country: spec.country, position: rng.pick(poss), age: 18, targetOvr: rng.range(45, 50),
        clubId: id, tier, paOverride: rng.int(72, 78), youth: true, wageMult: 0.6,
      });
      p.careerCurve = rng.chance(0.85) ? 'STANDARD' : 'EARLY_PEAKER';
      p.contract.yearsLeft = 1;
      p.contract.releaseClause = Math.round(valuePlayer(p, 1) * 1.1 / 1000) * 1000;
      g.players[p.id] = p;
      club.playerIds.push(p.id);
    }
  }

  // Golden Ticket: 2–3% chance of a raw 17-year-old with 85+ potential
  if (!spec.isShadow && rng.chance(0.025)) {
    const p = generatePlayer(g, rng, {
      nationality: rollNationality(rng, spec.country, 'YOUTH'), country: spec.country, position: rng.pick(['ST', 'CAM', 'LW', 'RW', 'CM', 'CB'] as Position[]), age: 17,
      targetOvr: rng.range(44, 52), clubId: id, tier, paOverride: rng.int(85, 93), youth: true, wageMult: 0.5,
    });
    p.careerCurve = 'STANDARD';
    g.players[p.id] = p;
    club.playerIds.push(p.id);
  }

  const sel = fillLineup(g, club, formation);
  club.tactics.lineup = sel.lineup;
  club.tactics.bench = sel.bench;
  club.tactics.roles = preferredRoles(g, club);
  return club;
}

export function emptyLedger() {
  return { tickets: 0, tv: 0, prize: 0, sales: 0, wages: 0, transfers: 0, facilities: 0, staff: 0 };
}

export function generateWorld(managerName: string, country: CountryCode, seed: number): GameState {
  const g = createEmptyGame(managerName, country, seed);
  const rng = createRng(seed);
  let colorIdx = 0;

  for (const code of COUNTRY_CODES) {
    const active = code === country;
    const tiers: Tier[] = active ? [1, 2, 3] : [1];
    const pool = NAME_POOLS[code];
    const towns = townNames(rng, code, tiers.length * 16);
    let t = 0;
    for (const tier of tiers) {
      const leagueId = `${code}-${tier}`;
      const league: League = {
        id: leagueId, country: code, tier, name: COUNTRIES[code].leagueNames[tier - 1], clubIds: [], fixtures: [], table: {}, isShadow: !active,
      };
      g.leagues[leagueId] = league;
      // pick 5 archetype slots among tier-3 clubs (ranks 4..14 to stay "balanced")
      const archSlots = new Map<number, ArchetypeId>();
      if (active && tier === 3) {
        const ranks = rng.shuffle([3, 5, 6, 7, 8, 9, 10, 11, 12, 13]).slice(0, 5);
        ARCHETYPE_IDS.forEach((a, i) => archSlots.set(ranks[i], a));
      }
      for (let rank = 0; rank < 16; rank++) {
        const town = towns[t++];
        const name = rng.pick(pool.clubPatterns).replace('{T}', town);
        const club = createClub(g, rng, { country: code, tier, rank, name, town, isShadow: !active, leagueId, archetype: archSlots.get(rank) ?? null }, colorIdx++);
        league.clubIds.push(club.id);
      }
      // derbies: pair clubs
      const ids = rng.shuffle([...league.clubIds]);
      for (let i = 0; i + 1 < ids.length; i += 2) {
        g.clubs[ids[i]].rivalId = ids[i + 1];
        g.clubs[ids[i + 1]].rivalId = ids[i];
      }
    }
  }

  // free agents
  for (let i = 0; i < 60; i++) {
    const pos = rng.pick(SQUAD_TEMPLATE);
    const age = rng.chance(0.3) ? rng.int(31, 35) : rng.int(19, 30);
    const p = generatePlayer(g, rng, { nationality: rollNationality(rng, country, 'FREE_AGENT'), country, position: pos, age, targetOvr: rng.range(46, 66), clubId: null, tier: 3 });
    p.contract.yearsLeft = 0;
    g.players[p.id] = p;
    g.freeAgentIds.push(p.id);
  }
  ensureFreeAgentCoverage(g, rng, country);

  generateStaffMarket(g, rng, country);

  // initial European Cup entrants: top 3 by strength per Tier 1 + 4th from strongest nation
  const euroEntrants = initialEuroEntrants(g);
  setupSeason(g, rng, euroEntrants);

  // job offers: 3 random archetype clubs
  const archClubs = Object.values(g.clubs).filter((c) => c.archetype);
  const picks = rng.shuffle([...archClubs]).slice(0, 3);
  g.jobOffers = picks.map<JobOffer>((c) => ({ id: nextId(g, 'j'), clubId: c.id, reason: ARCHETYPES[c.archetype as ArchetypeId].pitch, expiresWeek: 99, isLifeline: false }));

  g.rngState = rng.state;
  return g;
}

export function initialEuroEntrants(g: GameState): string[] {
  const entrants: string[] = [];
  const nationStrength: { code: CountryCode; s: number; fourth: string }[] = [];
  for (const code of COUNTRY_CODES) {
    const lg = g.leagues[`${code}-1`];
    const ranked = lg.clubIds.map((id) => ({ id, s: squadStrength(g, g.clubs[id]) })).sort((a, b) => b.s - a.s);
    entrants.push(...ranked.slice(0, 3).map((r) => r.id));
    nationStrength.push({ code, s: ranked.slice(0, 6).reduce((a, r) => a + r.s, 0), fourth: ranked[3].id });
  }
  nationStrength.sort((a, b) => b.s - a.s);
  entrants.push(nationStrength[0].fourth);
  return entrants;
}
