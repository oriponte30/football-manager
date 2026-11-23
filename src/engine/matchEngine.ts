/**
 * Possession-by-possession logical match engine.
 *
 * Pure TypeScript — no React. Each match is ~100 discrete possessions:
 *   1. Midfield battle  → who owns the possession (generates % possession)
 *   2. Chance creation  → creator vs. defensive block (generates xG + exact xA)
 *   3. Shot resolution  → finisher vs. goalkeeper (off target / saved / goal)
 *
 * PHASE 2 FOUNDATION: the core is a generator that *yields* high-leverage
 * `KeyMomentEvent`s and accepts a `KeyMomentOutcome` back. In `AUTO_SIM`
 * (Phase 1 default) every moment resolves probabilistically. In
 * `KEY_MOMENTS_HOOK`, the caller's `onKeyMoment` resolver (sync) or
 * `simulateMatchAsync` (async, e.g. a 2D mini-game canvas) decides outcomes.
 */
import type { Player, Position } from '../types/player';
import { injuryRiskMult, matchInjuryChance } from './injuryEngine';
import { INSTRUCTIONS, type InstructionId } from '../data/instructions';
import type { Duty, FormationId, PlayerRole, RoleAssignment, TeamDials } from '../types/tactics';
import type {
  AsyncKeyMomentResolver,
  KeyMomentEvent,
  KeyMomentOutcome,
  KeyMomentScenario,
  MatchContext,
  MatchEvent,
  MatchResult,
  PitchZone,
  PlayerMatchStats,
  ShotType,
  TeamMatchStats,
} from '../types/match';
import { positionFit } from '../data/formations';
import { moraleLevel, playerName } from './ratings';
import { clamp, type Rng } from './rng';

export type { MatchSimulationMode, KeyMomentEvent, KeyMomentOutcome } from '../types/match';

export interface SheetStarter {
  player: Player;
  slot: Position;
  role: RoleAssignment;
  /** individual instruction for this slot */
  instruction?: InstructionId | null;
}

export interface TeamSheet {
  clubId: string;
  name: string;
  formation: FormationId;
  dials: TeamDials;
  familiarity: number;
  atmosphere: number;
  homeBoost: number;
  fanInterest: number;
  starters: SheetStarter[];
  bench: Player[];
  /** physio rating (1–5★) — trims injury odds a touch */
  physioStars?: number;
  /** AI sides: the engine may change mentality in-game when chasing/protecting a result */
  autoManage?: boolean;
}

/* ------------------------------------------------------------------ */
/* Weight tables                                                       */
/* ------------------------------------------------------------------ */

const CTRL_W: Record<Position, number> = { GK: 0.05, CB: 0.3, LB: 0.5, RB: 0.5, CDM: 1.0, CM: 1.2, CAM: 1.0, LW: 0.6, RW: 0.6, ST: 0.3 };
const DEF_W: Record<Position, number> = { GK: 0, CB: 1.4, LB: 0.9, RB: 0.9, CDM: 1.1, CM: 0.6, CAM: 0.25, LW: 0.25, RW: 0.25, ST: 0.1 };
const CREATE_W: Record<Position, number> = { GK: 0.01, CB: 0.08, LB: 0.5, RB: 0.5, CDM: 0.3, CM: 0.7, CAM: 1.6, LW: 1.3, RW: 1.3, ST: 0.6 };
const SHOOT_W: Record<Position, number> = { GK: 0, CB: 0.15, LB: 0.2, RB: 0.2, CDM: 0.25, CM: 0.55, CAM: 1.3, LW: 1.3, RW: 1.3, ST: 2.8 };

const ROLE_CTRL: Partial<Record<PlayerRole, number>> = {
  'Deep Playmaker': 1.3, 'Ball-Playing Defender': 1.6, 'Box-to-Box': 1.1, Playmaker: 1.2, 'False 9': 2.0, 'Sweeper Keeper': 3,
};
const ROLE_DEF: Partial<Record<PlayerRole, number>> = {
  'Ball-Winner': 1.4, Stopper: 1.2, 'Stay-Back Fullback': 1.25, 'Attacking Wingback': 0.75, 'Box-to-Box': 1.1, 'Deep Playmaker': 0.9,
};
const ROLE_CREATE: Partial<Record<PlayerRole, number>> = {
  Playmaker: 1.6, 'Deep Playmaker': 1.25, 'Touchline Winger': 1.3, 'Attacking Wingback': 1.6, 'False 9': 1.8, 'Shadow Striker': 0.8, 'Target Man': 0.7, Poacher: 0.5,
};
const ROLE_SHOOT: Partial<Record<PlayerRole, number>> = {
  Poacher: 1.5, 'Shadow Striker': 1.6, 'Inside Forward': 1.5, 'Touchline Winger': 0.7, 'Target Man': 1.1, 'False 9': 0.7, 'Box-to-Box': 1.3, 'Attacking Wingback': 1.2, Playmaker: 0.8,
};
const DUTY_ATT: Record<Duty, number> = { DEFEND: 0.6, SUPPORT: 1, ATTACK: 1.25 };
const DUTY_DEF: Record<Duty, number> = { DEFEND: 1.2, SUPPORT: 1, ATTACK: 0.8 };

const isWide = (p: Position) => p === 'LW' || p === 'RW' || p === 'LB' || p === 'RB';
const isCentralAtt = (p: Position) => p === 'CAM' || p === 'CM' || p === 'ST';
const isDefender = (p: Position) => p === 'CB' || p === 'LB' || p === 'RB' || p === 'GK' || p === 'CDM';

/* ------------------------------------------------------------------ */
/* Live state                                                          */
/* ------------------------------------------------------------------ */

interface LivePlayer {
  p: Player;
  slot: Position;
  role: PlayerRole;
  duty: Duty;
  /** static multiplier: position fit × familiarity × morale × home × big-game */
  mult: number;
  fit: number;
  on: boolean;
  st: PlayerMatchStats;
  defActions: number;
  saves: number;
  conceded: number;
  enteredAt: number;
  leftAt: number;
  /* precomputed (static) composites & weights for speed */
  ctrlW: number; resW: number; defW: number; shootW: number; aerialW: number; createW: number;
  ctrlB: number; resB: number; defB: number; attB: number; createB: number;
  drain: number; injMult: number;
  tTireless: boolean;
  instr: InstructionId | null;
}

interface LiveTeam {
  sheet: TeamSheet;
  players: LivePlayer[];
  bench: Player[];
  subsLeft: number;
  stats: TeamMatchStats;
  hasReckless: boolean;
  isHome: boolean;
  /** minutes at which the bench considers a tactical change */
  subPlan: number[];
  mentalityShifted: boolean;
  /* cached aggregates (refreshed every few possessions) */
  cMid: number; cDef: number; cAtt: number;
}

function effStat(lp: LivePlayer, k: keyof Player['stats']): number {
  return lp.p.stats[k] * lp.mult * (0.76 + 0.24 * (lp.fit / 100));
}

function newPlayerStats(p: Player, clubId: string, started: boolean): PlayerMatchStats {
  return {
    playerId: p.id, clubId, minutes: 0, started, goals: 0, assists: 0, xg: 0, xa: 0, shots: 0,
    shotsOnTarget: 0, rating: 6, injured: false, fitnessEnd: p.fitness, subbedOn: !started,
  };
}

function staticMult(p: Player, slot: Position, sheet: TeamSheet, isHome: boolean, ctx: MatchContext, sub: boolean): number {
  let m = positionFit(p.position, slot);
  m *= 0.93 + 0.07 * (sheet.familiarity / 100);
  m *= 1 + (moraleLevel(p.moraleValue) - 2) * 0.025 + ((sheet.atmosphere - 50) / 50) * 0.015;
  if (isHome && !ctx.neutralVenue) m *= 1 + 0.03 * sheet.homeBoost * (0.7 + 0.6 * (sheet.fanInterest / 100));
  if ((ctx.isKnockout || ctx.isDerby || ctx.competition === 'EURO') && p.traits.includes('Big Game Player')) m *= 1.06;
  if (sub && p.traits.includes('Super-Sub')) m *= 1.08;
  return m;
}

function buildLive(p: Player, slot: Position, role: RoleAssignment, sheet: TeamSheet, isHome: boolean, ctx: MatchContext, sub: boolean, minute: number, instr: InstructionId | null = null): LivePlayer {
  const mult = staticMult(p, slot, sheet, isHome, ctx, sub);
  const s = p.stats;
  const lp: LivePlayer = {
    p, slot, role: role.role, duty: role.duty, mult, fit: p.fitness, on: true,
    st: newPlayerStats(p, sheet.clubId, !sub), defActions: 0, saves: 0, conceded: 0, enteredAt: minute, leftAt: 90,
    ctrlW: CTRL_W[slot] * (ROLE_CTRL[role.role] ?? 1),
    resW: (DEF_W[slot] + CTRL_W[slot] * 0.5) * (ROLE_DEF[role.role] ?? 1) * DUTY_DEF[role.duty],
    defW: slot === 'GK' ? 0 : DEF_W[slot] * (ROLE_DEF[role.role] ?? 1) * DUTY_DEF[role.duty],
    shootW: 0, aerialW: 0, createW: 0,
    ctrlB: mult * (0.5 * s.passing + 0.3 * s.dribbling + 0.2 * s.physical),
    resB: mult * (0.5 * s.defending + 0.3 * s.physical + 0.2 * s.pace),
    defB: mult * (0.6 * s.defending + 0.25 * s.pace + 0.15 * s.physical),
    attB: mult * (0.4 * s.shooting + 0.3 * s.pace + 0.3 * s.dribbling),
    createB: mult * (0.55 * s.passing + 0.45 * s.dribbling),
    drain: 0.25 * (sheet.dials.pressing === 'HIGH' ? 1.35 : sheet.dials.pressing === 'LOW' ? 0.8 : 1) * (1.15 - s.physical / 400) * (p.traits.includes('Tireless Engine') ? 0.6 : 1),
    injMult: injuryRiskMult(p, sheet.dials.pressing, sheet.physioStars ?? 2),
    tTireless: p.traits.includes('Tireless Engine'),
    instr,
  };
  lp.shootW = shooterWeight(lp, false);
  lp.aerialW = shooterWeight(lp, true);
  lp.createW = creatorWeight(lp, sheet.dials.attackingFocus);
  if (instr) applyInstruction(lp, instr);
  return lp;
}

/** Individual instruction: tilts weights; players whose natural role suits it get more out of it. */
function applyInstruction(lp: LivePlayer, id: InstructionId): void {
  const def = INSTRUCTIONS[id];
  if (!def) return;
  const suited = def.suits.includes(lp.p.preferredRole) || def.suits.includes(lp.role);
  const k = suited ? 1.25 : 0.8;
  const f = (m: number | undefined) => (m === undefined ? 1 : m >= 1 ? 1 + (m - 1) * k : m);
  const m = def.mods;
  lp.shootW *= f(m.shoot);
  lp.aerialW *= f(m.aerial ?? m.shoot);
  lp.createW *= f(m.create);
  lp.ctrlW *= f(m.ctrl);
  lp.resW *= f(m.res);
  lp.defW *= f(m.def);
  lp.drain *= m.drain ?? 1;
  lp.injMult *= m.inj ?? 1;
}

const ff = (fit: number) => 0.76 + 0.24 * (fit / 100);

function refreshAggregates(t: LiveTeam): void {
  let ctrl = 0, cw = 0, res = 0, rw = 0, def = 0, dw = 0, att = 0, aw = 0;
  for (const lp of t.players) {
    if (!lp.on) continue;
    const f = ff(lp.fit);
    ctrl += lp.ctrlW * lp.ctrlB * f; cw += lp.ctrlW;
    res += lp.resW * lp.resB * f; rw += lp.resW;
    def += lp.defW * lp.defB * f; dw += lp.defW;
    att += lp.shootW * lp.attB * f; aw += lp.shootW;
  }
  const d = t.sheet.dials;
  let c = cw > 0 ? ctrl / cw : 30;
  let r = rw > 0 ? res / rw : 30;
  if (d.passingStyle === 'SHORT') c += 3;
  if (d.passingStyle === 'DIRECT') c -= 2;
  if (d.pressing === 'HIGH') r += 3;
  if (d.pressing === 'LOW') r -= 2;
  if (d.mentality === 'ATTACKING') c += 1;
  if (d.mentality === 'DEFENSIVE') c -= 1;
  t.cMid = 0.55 * c + 0.45 * r;
  t.cDef = dw > 0 ? def / dw : 30;
  t.cAtt = aw > 0 ? att / aw : 30;
}

function makeLive(sheet: TeamSheet, isHome: boolean, ctx: MatchContext): LiveTeam {
  // private copy: AI may shift mentality during the match
  const own: TeamSheet = { ...sheet, dials: { ...sheet.dials } };
  const players: LivePlayer[] = own.starters.map((s) => buildLive(s.player, s.slot, s.role, own, isHome, ctx, false, 0, s.instruction ?? null));
  return {
    cMid: 0, cDef: 0, cAtt: 0,
    sheet: own,
    isHome,
    subPlan: [],
    mentalityShifted: false,
    players,
    bench: [...sheet.bench],
    subsLeft: 3,
    hasReckless: players.some((lp) => lp.p.traits.includes('Reckless Tackler')),
    stats: {
      clubId: sheet.clubId, goals: 0, possessions: 0, possessionPct: 0, shots: 0, shotsOnTarget: 0,
      xg: 0, xgc: 0, xa: 0, bigChances: 0,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Aggregates                                                          */
/* ------------------------------------------------------------------ */

function creatorWeight(lp: LivePlayer, focus: TeamDials['attackingFocus']): number {
  let w = CREATE_W[lp.slot] * (ROLE_CREATE[lp.role] ?? 1) * DUTY_ATT[lp.duty];
  if (lp.p.traits.includes('Selfish')) w *= 0.7;
  if (focus === 'WINGS') w *= isWide(lp.slot) ? 1.4 : 0.8;
  if (focus === 'MIDDLE') w *= isCentralAtt(lp.slot) ? 1.35 : isWide(lp.slot) ? 0.75 : 1;
  return w * (0.5 + (lp.p.stats.passing + lp.p.stats.dribbling) / 200);
}

function shooterWeight(lp: LivePlayer, aerial: boolean): number {
  let w = SHOOT_W[lp.slot] * (ROLE_SHOOT[lp.role] ?? 1) * DUTY_ATT[lp.duty];
  if (aerial) {
    if (lp.slot === 'CB') w *= 4;
    if (lp.role === 'Target Man') w *= 2.5;
    w *= 0.5 + lp.p.stats.physical / 100;
  }
  if (lp.p.traits.includes('Poacher')) w *= 1.4;
  if (lp.p.traits.includes('Selfish')) w *= 1.35;
  return w;
}

type WeightKey = 'createW' | 'shootW' | 'aerialW' | 'defW';

function pickWeighted(rng: Rng, list: LivePlayer[], key: WeightKey, exclude?: LivePlayer): LivePlayer {
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    const lp = list[i];
    if (lp.on && lp !== exclude) total += lp[key];
  }
  if (total <= 0) return list.find((l) => l.on && l !== exclude) ?? list[0];
  let r = rng.next() * total;
  let last = list[0];
  for (let i = 0; i < list.length; i++) {
    const lp = list[i];
    if (!lp.on || lp === exclude) continue;
    last = lp;
    r -= lp[key];
    if (r <= 0) return lp;
  }
  return last;
}

function attackQuality(t: LiveTeam, creator: LivePlayer): number {
  return 0.5 * t.cAtt + 0.5 * creator.createB * ff(creator.fit);
}

function keeperOf(t: LiveTeam): LivePlayer {
  return t.players.find((lp) => lp.on && lp.slot === 'GK') ?? t.players.find((lp) => lp.on) ?? t.players[0];
}

/* ------------------------------------------------------------------ */
/* Scenario / xG                                                       */
/* ------------------------------------------------------------------ */

interface Scenario {
  shot: ShotType;
  xg: number;
  zone: PitchZone;
  key: KeyMomentScenario | null;
  aerial: boolean;
  assisted: boolean;
}

function rollScenario(rng: Rng, att: LiveTeam, def: LiveTeam, edge: number): Scenario {
  const ad = att.sheet.dials;
  const dd = def.sheet.dials;
  let wLong = 0.25, wBox = 0.36, wHead = 0.17, wCounter = 0.1, wOne = 0.07, wPen = 0.018;
  if (ad.attackingFocus === 'WINGS') wHead *= 1.6;
  if (ad.attackingFocus === 'MIDDLE') { wBox *= 1.2; wOne *= 1.3; wHead *= 0.7; }
  if (ad.passingStyle === 'DIRECT') wCounter *= 1.5;
  if (dd.pressing === 'HIGH') wCounter *= 1.6;
  if (ad.pressing === 'LOW') wCounter *= 1.3;
  if (att.players.some((lp) => lp.on && lp.role === 'Target Man')) wHead *= 1.3;
  if (dd.mentality === 'DEFENSIVE') { wLong *= 1.3; wOne *= 0.7; }
  const shot = rng.weighted<ShotType>(
    ['LONG_SHOT', 'BOX_SHOT', 'HEADER', 'COUNTER', 'ONE_ON_ONE', 'PENALTY'],
    [wLong, wBox, wHead, wCounter, wOne, wPen],
  );
  const e = clamp(edge / 300, -0.15, 0.15);
  switch (shot) {
    case 'LONG_SHOT':
      return { shot, xg: rng.range(0.03, 0.08) * (1 + e), zone: 'EDGE_OF_BOX', key: null, aerial: false, assisted: rng.chance(0.5) };
    case 'BOX_SHOT':
      return { shot, xg: rng.range(0.07, 0.2) * (1 + e), zone: 'PENALTY_BOX', key: null, aerial: false, assisted: rng.chance(0.85) };
    case 'HEADER':
      return { shot, xg: rng.range(0.05, 0.17) * (1 + e), zone: 'SIX_YARD_BOX', key: 'BOX_CROSS', aerial: true, assisted: true };
    case 'COUNTER':
      return { shot, xg: rng.range(0.14, 0.32) * (1 + e), zone: rng.chance(0.5) ? 'CENTRAL' : rng.chance(0.5) ? 'LEFT_FLANK' : 'RIGHT_FLANK', key: 'COUNTER_ATTACK', aerial: false, assisted: rng.chance(0.8) };
    case 'ONE_ON_ONE':
      return { shot, xg: rng.range(0.3, 0.48) * (1 + e), zone: 'PENALTY_BOX', key: 'ONE_ON_ONE', aerial: false, assisted: rng.chance(0.7) };
    case 'PENALTY':
      return { shot, xg: 0.76, zone: 'PENALTY_BOX', key: 'SET_PIECE', aerial: false, assisted: false };
    default:
      return { shot: 'SET_PIECE', xg: rng.range(0.05, 0.12), zone: 'SIX_YARD_BOX', key: 'SET_PIECE', aerial: true, assisted: true };
  }
}

const KEY_MOMENT_XG = 0.2;
const MAX_KEY_MOMENTS = 5;

/* ------------------------------------------------------------------ */
/* Core generator                                                      */
/* ------------------------------------------------------------------ */

export function* matchCore(
  homeSheet: TeamSheet,
  awaySheet: TeamSheet,
  ctx: MatchContext,
  rng: Rng,
  matchId: string,
): Generator<KeyMomentEvent, MatchResult, KeyMomentOutcome | undefined> {
  const H = makeLive(homeSheet, true, ctx);
  const A = makeLive(awaySheet, false, ctx);
  for (const t of [H, A]) t.subPlan = [rng.int(55, 64), rng.int(66, 74), rng.int(76, 84)];
  const events: MatchEvent[] = [];
  const keyMoments: KeyMomentEvent[] = [];
  const total = rng.int(94, 106);
  let halfTimeDone = false;

  events.push({ minute: 0, type: 'KICK_OFF', clubId: H.sheet.clubId, text: `${H.sheet.name} get us under way.` });


  for (let i = 0; i < total; i++) {
    const minute = Math.min(90, Math.floor((i * 90) / total) + 1);
    if (!halfTimeDone && minute > 45) {
      halfTimeDone = true;
      events.push({ minute: 45, type: 'HALF_TIME', clubId: H.sheet.clubId, text: `HALF TIME: ${H.sheet.name} ${H.stats.goals}-${A.stats.goals} ${A.sheet.name}` });
    }

    // 1. MIDFIELD BATTLE
    if (i % 4 === 0) { refreshAggregates(H); refreshAggregates(A); }
    const mH = H.cMid;
    const mA = A.cMid;
    const pHome = clamp(1 / (1 + Math.exp(-(mH - mA) / 50)), 0.3, 0.7);
    const att = rng.next() < pHome ? H : A;
    const def = att === H ? A : H;
    att.stats.possessions++;
    if (ctx.verbose) events.push({ minute, type: 'POSSESSION', clubId: att.sheet.clubId, text: `${att.sheet.name} in possession.` });

    // 2. CHANCE CREATION
    const creator = pickWeighted(rng, att.players, 'createW');
    const A_q = attackQuality(att, creator);
    const D_q = def.cDef;
    const edge = A_q - D_q;
    let pChance = 0.18 * Math.exp(edge / 65);
    const am = att.sheet.dials.mentality;
    const dm = def.sheet.dials.mentality;
    if (am === 'ATTACKING') pChance *= 1.15;
    if (am === 'DEFENSIVE') pChance *= 0.85;
    if (dm === 'ATTACKING') pChance *= 1.12;
    if (dm === 'DEFENSIVE') pChance *= 0.86;
    if (def.sheet.dials.pressing === 'LOW') pChance *= 0.92;
    if (att.sheet.dials.passingStyle === 'DIRECT') pChance *= 1.06;
    pChance = clamp(pChance, 0.03, 0.5);

    let scenario: Scenario | null = null;
    if (rng.next() < pChance) {
      scenario = rollScenario(rng, att, def, edge);
    } else {
      // turnover: credit a defender; small chance of a set piece / long throw
      const tackler = pickWeighted(rng, def.players, 'defW');
      tackler.defActions++;
      const reckless = tackler.p.traits.includes('Reckless Tackler');
      const throwIn = att.players.some((lp) => lp.on && lp.p.traits.includes('Long-Throw Specialist'));
      const spChance = 0.035 + (reckless ? 0.04 : 0) + (throwIn ? 0.02 : 0);
      if (rng.next() < spChance) {
        scenario = { shot: 'SET_PIECE', xg: rng.range(0.05, 0.12), zone: 'SIX_YARD_BOX', key: 'SET_PIECE', aerial: true, assisted: true };
        if (reckless && rng.chance(0.12)) scenario = { shot: 'PENALTY', xg: 0.76, zone: 'PENALTY_BOX', key: 'SET_PIECE', aerial: false, assisted: false };
      } else if (ctx.verbose) {
        events.push({ minute, type: 'TURNOVER', clubId: def.sheet.clubId, playerId: tackler.p.id, text: `${playerName(tackler.p)} wins it back.` });
      }
    }

    if (scenario) {
      // 3. SHOT RESOLUTION
      let shooter: LivePlayer;
      if (scenario.shot === 'PENALTY' || scenario.shot === 'SET_PIECE') {
        const ace = att.players.find((lp) => lp.on && lp.p.traits.includes('Set-Piece Ace'));
        if (scenario.shot === 'PENALTY') {
          shooter = ace ?? att.players.filter((lp) => lp.on).sort((a, b) => b.p.stats.shooting - a.p.stats.shooting)[0];
        } else {
          shooter = pickWeighted(rng, att.players, 'aerialW', creator);
          if (ace && ace !== shooter) scenario.xg *= 1.3;
        }
      } else {
        const solo = !scenario.assisted;
        shooter = solo ? creator : pickWeighted(rng, att.players, scenario.aerial ? 'aerialW' : 'shootW', creator);
      }
      const assister = scenario.assisted && shooter !== creator ? (scenario.shot === 'SET_PIECE' ? (att.players.find((lp) => lp.on && lp.p.traits.includes('Set-Piece Ace') && lp !== shooter) ?? creator) : creator) : null;
      if (shooter.p.traits.includes('Poacher') && (scenario.zone === 'PENALTY_BOX' || scenario.zone === 'SIX_YARD_BOX')) scenario.xg *= 1.1;
      const xg = Math.round(clamp(scenario.xg, 0.01, 0.95) * 100) / 100;
      const gk = keeperOf(def);

      // finishing vs keeping
      let fin = scenario.aerial
        ? 0.5 * effStat(shooter, 'shooting') + 0.5 * effStat(shooter, 'physical')
        : effStat(shooter, 'shooting');
      fin += shooter.p.form * 0.6 + (shooter.p.streak > 0 ? 5 : shooter.p.streak < 0 ? -4 : 0);
      if (minute >= 75 && shooter.p.traits.includes('Clutch')) fin += 6;
      let keep = 0.5 * effStat(gk, 'reflexes') + 0.35 * effStat(gk, 'positioning') + 0.15 * effStat(gk, 'handling');
      if (gk.role === 'Shot-Stopper') keep *= 1.04;
      if (gk.role === 'Sweeper Keeper' && (scenario.shot === 'COUNTER' || scenario.shot === 'ONE_ON_ONE')) keep *= 1.06;
      if (gk.slot !== 'GK' || gk.p.position !== 'GK') keep *= 0.6;

      const pGoal = clamp(xg * Math.exp((fin - keep) / 100), 0.01, 0.92);
      const pOnTarget = clamp(0.38 + (fin - 55) / 180, 0.22, 0.62);

      let outcome: KeyMomentOutcome | undefined;
      let km: KeyMomentEvent | undefined;
      const isKey = scenario.key !== null && xg >= KEY_MOMENT_XG && keyMoments.length < MAX_KEY_MOMENTS;
      if (isKey) {
        km = {
          minute,
          attackingClubId: att.sheet.clubId,
          defendingClubId: def.sheet.clubId,
          scenarioType: scenario.key as KeyMomentScenario,
          involvedPlayerIds: [shooter.p.id, ...(assister ? [assister.p.id] : []), gk.p.id],
          expectedXG: xg,
          zone: scenario.zone,
        };
        keyMoments.push(km);
        if (ctx.mode === 'KEY_MOMENTS_HOOK') outcome = yield km;
      }
      if (!outcome) {
        const r = rng.next();
        if (r < pGoal) outcome = 'GOAL';
        else if (rng.next() < pOnTarget) outcome = 'SAVED';
        else if ((scenario.zone === 'PENALTY_BOX' || scenario.zone === 'SIX_YARD_BOX') && rng.chance(0.35)) outcome = 'CLEARED';
        else outcome = 'MISSED';
      }

      // book-keeping (xG and xA always credited exactly)
      att.stats.shots++;
      att.stats.xg += xg;
      def.stats.xgc += xg;
      if (xg >= 0.3) att.stats.bigChances++;
      shooter.st.shots++;
      shooter.st.xg += xg;
      if (assister) {
        assister.st.xa += xg;
        att.stats.xa += xg;
      }
      const sName = playerName(shooter.p);
      const base: Omit<MatchEvent, 'type' | 'text'> = {
        minute, clubId: att.sheet.clubId, playerId: shooter.p.id, assistId: assister?.p.id, xg, shotType: scenario.shot, keyMoment: km,
      };
      const flavour = shotFlavour(scenario.shot, sName, assister ? playerName(assister.p) : null);
      if (outcome === 'GOAL') {
        att.stats.goals++;
        att.stats.shotsOnTarget++;
        shooter.st.shotsOnTarget++;
        shooter.st.goals++;
        if (assister) assister.st.assists++;
        gk.conceded++;
        for (const lp of def.players) if (lp.on) lp.conceded++;
        events.push({ ...base, type: 'GOAL', text: `GOAL! ${flavour}! — ${H.sheet.name} ${H.stats.goals}-${A.stats.goals} ${A.sheet.name}` });
      } else if (outcome === 'SAVED') {
        att.stats.shotsOnTarget++;
        shooter.st.shotsOnTarget++;
        gk.saves++;
        events.push({ ...base, type: 'SHOT_SAVED', text: `${flavour} — saved by ${playerName(gk.p)}.` });
      } else if (outcome === 'CLEARED') {
        events.push({ ...base, type: 'SHOT_CLEARED', text: `${flavour} — blocked and cleared!` });
      } else {
        events.push({ ...base, type: 'SHOT_OFF_TARGET', text: `${flavour} — off target.` });
      }
    }

    // FITNESS DRAIN & INJURY
    for (let ti = 0; ti < 2; ti++) {
      const t = ti === 0 ? H : A;
      const opp = ti === 0 ? A : H;
      for (const lp of t.players) {
        if (!lp.on) continue;
        lp.fit = Math.max(0, lp.fit - lp.drain);
        if (!lp.st.injured && rng.next() < matchInjuryChance(lp.injMult, lp.fit, opp.hasReckless)) {
          lp.st.injured = true;
          events.push({ minute, type: 'INJURY', clubId: t.sheet.clubId, playerId: lp.p.id, text: `${playerName(lp.p)} goes down injured.` });
        }
      }
    }

    // SUBSTITUTIONS: forced (injury), fatigue, then planned tactical changes
    if (minute < 55 && !injuredOn(H) && !injuredOn(A)) continue;
    for (const t of [H, A]) {
      const opp = t === H ? A : H;
      const diff = t.stats.goals - opp.stats.goals;
      // AI benches chase or protect a result
      if (t.sheet.autoManage && !t.mentalityShifted) {
        if (minute >= 70 && diff < 0 && t.sheet.dials.mentality !== 'ATTACKING') { t.sheet.dials.mentality = 'ATTACKING'; t.mentalityShifted = true; refreshAggregates(t); events.push({ minute, type: 'TACTICAL', clubId: t.sheet.clubId, text: `${t.sheet.name} throw caution to the wind — all-out attack.` }); }
        else if (minute >= 80 && diff > 0 && t.sheet.dials.mentality !== 'DEFENSIVE') { t.sheet.dials.mentality = 'DEFENSIVE'; t.mentalityShifted = true; refreshAggregates(t); events.push({ minute, type: 'TACTICAL', clubId: t.sheet.clubId, text: `${t.sheet.name} drop deep to see it out.` }); }
      }
      if (t.subsLeft <= 0 || t.bench.length === 0) continue;
      for (const lp of t.players) {
        if (t.subsLeft <= 0) break;
        if (!lp.on) continue;
        const needs = lp.st.injured || (minute >= 58 && lp.fit < 55) || (minute >= 70 && lp.fit < 62 && t.subsLeft >= 2);
        if (!needs) continue;
        makeSub(t, lp, minute, diff, ctx, events, lp.st.injured ? 'INJURY' : 'FATIGUE');
      }
      if (t.subsLeft > 0 && t.subPlan.length > 0 && minute >= t.subPlan[0]) {
        t.subPlan.shift();
        const off = tacticalOff(t, diff, minute);
        if (off) makeSub(t, off, minute, diff, ctx, events, 'TACTICAL');
      }
    }
  }

  // PENALTIES (knockout draws)
  let penalties: { home: number; away: number } | null = null;
  if (ctx.isKnockout && H.stats.goals === A.stats.goals) {
    penalties = shootout(rng, H, A);
    events.push({ minute: 120, type: 'PENALTY_SHOOTOUT', clubId: penalties.home > penalties.away ? H.sheet.clubId : A.sheet.clubId, text: `Penalties: ${H.sheet.name} ${penalties.home}-${penalties.away} ${A.sheet.name}` });
  }
  events.push({ minute: 90, type: 'FULL_TIME', clubId: H.sheet.clubId, text: `FULL TIME: ${H.sheet.name} ${H.stats.goals}-${A.stats.goals} ${A.sheet.name}` });

  // finalise stats
  const totalPoss = H.stats.possessions + A.stats.possessions;
  H.stats.possessionPct = Math.round((H.stats.possessions / totalPoss) * 100);
  A.stats.possessionPct = 100 - H.stats.possessionPct;
  for (const t of [H, A]) {
    t.stats.xg = round2(t.stats.xg);
    t.stats.xgc = round2(t.stats.xgc);
    t.stats.xa = round2(t.stats.xa);
  }
  const players: Record<string, PlayerMatchStats> = {};
  for (const t of [H, A]) {
    const opp = t === H ? A : H;
    const res = t.stats.goals - opp.stats.goals;
    for (const lp of t.players) {
      const st = lp.st;
      st.minutes = Math.max(1, (lp.on ? 90 : lp.leftAt) - lp.enteredAt);
      st.xg = round2(st.xg);
      st.xa = round2(st.xa);
      st.fitnessEnd = Math.round(lp.fit);
      st.rating = rateLive(lp, res, opp.stats.goals, rng);
      players[lp.p.id] = st;
    }
  }

  return {
    id: matchId,
    competition: ctx.competition,
    homeId: H.sheet.clubId,
    awayId: A.sheet.clubId,
    homeGoals: H.stats.goals,
    awayGoals: A.stats.goals,
    penalties,
    events,
    home: H.stats,
    away: A.stats,
    players,
    keyMoments,
    totalPossessions: totalPoss,
  };
}

function injuredOn(t: LiveTeam): boolean {
  for (const lp of t.players) if (lp.on && lp.st.injured) return true;
  return false;
}

function bestSubFor(bench: Player[], slot: Position, chasing = false): number {
  let best = -1, score = -1;
  for (let i = 0; i < bench.length; i++) {
    const p = bench[i];
    if (p.injuryWeeks > 0) continue;
    if ((slot === 'GK') !== (p.position === 'GK')) continue;
    let s = p.ca * positionFit(p.position, slot) * (0.7 + 0.3 * p.fitness / 100);
    if (chasing && p.traits.includes('Super-Sub')) s *= 1.12;
    s *= 1 - i * 0.004; // respect the manager's bench order on ties
    if (s > score) { score = s; best = i; }
  }
  return best;
}

const ATTACKING_SLOTS: Position[] = ['ST', 'LW', 'RW', 'CAM'];

/** Who comes off at a planned window: the most tired, or (chasing) the quietest attacker. */
function tacticalOff(t: LiveTeam, diff: number, minute: number): LivePlayer | null {
  let best: LivePlayer | null = null, bestScore = Infinity;
  for (const lp of t.players) {
    if (!lp.on || lp.slot === 'GK' || lp.enteredAt > 0) continue;
    const impact = lp.st.goals * 30 + lp.st.assists * 20 + lp.st.shots * 3 + lp.defActions * 1.5 + lp.st.xg * 25;
    let score = lp.fit + impact;
    if (diff < 0 && ATTACKING_SLOTS.includes(lp.slot)) score -= 12;
    if (lp.p.traits.includes('Tireless Engine')) score += 10;
    if (score < bestScore) { bestScore = score; best = lp; }
  }
  if (!best) return null;
  // nothing to fix: fresh legs only when someone is flagging or the game needs changing
  if (best.fit > 80 && diff === 0 && minute < 75) return null;
  if (best.fit > 86 && diff > 0) return null;
  return best;
}

function makeSub(t: LiveTeam, lp: LivePlayer, minute: number, diff: number, ctx: MatchContext, events: MatchEvent[], why: 'INJURY' | 'FATIGUE' | 'TACTICAL'): void {
  const subIdx = bestSubFor(t.bench, lp.slot, diff <= 0 && ATTACKING_SLOTS.includes(lp.slot));
  if (subIdx < 0) return;
  const sub = t.bench.splice(subIdx, 1)[0];
  lp.on = false;
  lp.leftAt = minute;
  t.subsLeft--;
  const np = buildLive(sub, lp.slot, { role: lp.role, duty: lp.duty }, t.sheet, t.isHome, ctx, true, minute, lp.instr);
  t.players.push(np);
  refreshAggregates(t);
  const reason = why === 'INJURY' ? ' (injury)' : why === 'FATIGUE' ? ' (tired legs)' : diff < 0 ? ' — chasing the game' : diff > 0 ? ' — shoring things up' : '';
  events.push({ minute, type: 'SUBSTITUTION', clubId: t.sheet.clubId, playerId: sub.id, text: `${t.sheet.name}: ${playerName(sub)} on for ${playerName(lp.p)}${reason}.` });
}

function shootout(rng: Rng, H: LiveTeam, A: LiveTeam): { home: number; away: number } {
  const takers = (t: LiveTeam) => t.players.filter((l) => l.on).sort((a, b) => b.p.stats.shooting - a.p.stats.shooting);
  const hT = takers(H), aT = takers(A);
  const hk = keeperOf(H), ak = keeperOf(A);
  const kick = (taker: LivePlayer, gk: LivePlayer) => rng.next() < clamp(0.75 + (taker.p.stats.shooting - gk.p.stats.reflexes) / 250, 0.55, 0.9);
  let h = 0, a = 0;
  for (let i = 0; i < 5; i++) {
    if (kick(hT[i % hT.length], ak)) h++;
    if (kick(aT[i % aT.length], hk)) a++;
  }
  let k = 5;
  while (h === a && k < 30) {
    const hs = kick(hT[k % hT.length], ak);
    const as = kick(aT[k % aT.length], hk);
    if (hs) h++;
    if (as) a++;
    k++;
  }
  if (h === a) h++;
  return { home: h, away: a };
}

function rateLive(lp: LivePlayer, resultDiff: number, conceded: number, rng: Rng): number {
  const st = lp.st;
  let r = 6.0;
  r += st.goals * 1.0 + st.assists * 0.75 + st.xg * 0.6 + st.xa * 0.6 + st.shotsOnTarget * 0.12;
  r += lp.defActions * 0.045;
  r += resultDiff > 0 ? 0.35 : resultDiff < 0 ? -0.35 : 0;
  if (isDefender(lp.slot)) {
    r -= lp.conceded * 0.35;
    if (conceded === 0 && st.minutes >= 60) r += 0.7;
  }
  if (lp.slot === 'GK') r += lp.saves * 0.3;
  r += rng.normal(0, lp.p.traits.includes('Consistent') ? 0.15 : 0.35);
  if (st.minutes < 25) r = 6 + (r - 6) * 0.5;
  return Math.round(clamp(r, 1, 10) * 10) / 10;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function shotFlavour(t: ShotType, shooter: string, assister: string | null): string {
  switch (t) {
    case 'LONG_SHOT': return `${shooter} lets fly from 25 yards`;
    case 'BOX_SHOT': return assister ? `${assister} slips it to ${shooter} in the box` : `${shooter} shoots from inside the area`;
    case 'HEADER': return `${assister ?? 'A cross'} whips it in, ${shooter} heads`;
    case 'COUNTER': return `Lightning counter! ${assister ? `${assister} releases ` : ''}${shooter} bears down`;
    case 'ONE_ON_ONE': return `${shooter} is clean through, one-on-one`;
    case 'SET_PIECE': return `Set piece swung in, ${shooter} attacks it`;
    case 'PENALTY': return `PENALTY! ${shooter} steps up`;
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Simulate a match synchronously. In KEY_MOMENTS_HOOK mode the optional
 * `ctx.onKeyMoment` resolver is consulted for each flagged highlight.
 */
export function simulateMatch(home: TeamSheet, away: TeamSheet, ctx: MatchContext, rng: Rng, matchId = 'm'): MatchResult {
  const gen = matchCore(home, away, ctx, rng, matchId);
  let step = gen.next();
  while (!step.done) {
    const outcome = ctx.mode === 'KEY_MOMENTS_HOOK' && ctx.onKeyMoment ? ctx.onKeyMoment(step.value) : undefined;
    step = gen.next(outcome);
  }
  return step.value;
}

/**
 * Phase 2 entry point: await the user's mini-game outcome for each key moment.
 */
export async function simulateMatchAsync(
  home: TeamSheet,
  away: TeamSheet,
  ctx: Omit<MatchContext, 'mode' | 'onKeyMoment'>,
  rng: Rng,
  resolver: AsyncKeyMomentResolver,
  matchId = 'm',
): Promise<MatchResult> {
  const gen = matchCore(home, away, { ...ctx, mode: 'KEY_MOMENTS_HOOK' }, rng, matchId);
  let step = gen.next();
  while (!step.done) {
    const outcome = await resolver(step.value);
    step = gen.next(outcome);
  }
  return step.value;
}

/** Top-N highlights by xG for the CRT ticker. */
export function topHighlights(result: MatchResult, n = 5): MatchEvent[] {
  return result.events
    .filter((e) => e.xg !== undefined)
    .sort((a, b) => (b.xg ?? 0) - (a.xg ?? 0))
    .slice(0, n)
    .sort((a, b) => a.minute - b.minute);
}
