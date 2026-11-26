/**
 * The matchweek ticker: fixtures, domestic cup, European Cup, weekly economy,
 * progression, board/sacking, job offers and season rollover.
 */
import type { CupRound, Fixture, GameState, League, SeasonSummary, Tier, WeekResultLine, CountryCode } from '../types/world';
import { COUNTRY_CODES } from '../types/world';
import type { Club } from '../types/club';
import type { MatchContext, MatchResult, PlayerMatchStats, CompetitionKind } from '../types/match';
import type { TeamDials } from '../types/tactics';
import type { JobOffer } from '../types/transfers';
import { STAFF_ROLES, STAFF_ROLE_LABELS } from '../types/staff';
import { FORMATIONS } from '../data/formations';
import { createRng, clamp, type Rng } from './rng';
import { nextId } from './ids';
import { simulateMatch, type TeamSheet } from './matchEngine';
import { fillLineup, preferredRoles, sanitiseRoles, squadStrength, syncBench } from './lineup';
import { afterMatchFamiliarity, initFamiliarity, matchFamiliarity } from './familiarityEngine';
import { afterMatchweek } from './weekEngine';
import { refreshShortlist } from './shortlistEngine';
import { applyResultToTable, emptyRow, resolveShadowLeague, sortedTable } from './shadowLeagueEngine';
import { updateForm, weeklyProgressionForClub, ageOneYear, seasonalProgression } from './progressionEngine';
import { fanInterestAfterMatch, maybeCreateDilemma, updateMoraleAfterWeek } from './moraleEngine';
import { gateReceipts, payWeeklyWages, credit, tvMoney, weeklyTV, weeklyBill, TV_WEEKLY_SHARE, CUP_PRIZE, EURO_PRIZE, fmtMoney } from './financeEngine';
import {
  aiIncomingBids, aiWorldTransfers, expireIncomingBids, fax, maybeAiTradeFax, movePlayer, resolveOutgoingBid, returnLoans, windowFor, avgCa, valuePlayer,
} from './transferEngine';
import { generateScoutReport } from './scoutingEngine';
import { INTAKE_WEEKS, youthIntake } from './academyEngine';
import { evolveStaff, generateStaff, generateStaffMarket, staffStarsOf } from './staffGenerator';
import { fullName, starsFromInternal } from './ratings';
import { generatePlayer, SQUAD_TEMPLATE, emptySeasonStats, wageFor } from './playerGenerator';
import { rollNationality } from '../data/nationalities';
import { ensureFreeAgentCoverage, freeAgentPosition, balanceFreeAgents } from './freeAgentPool';
import { applyInjury, isKeyPlayer, rollInjury, tickRecovery, tickRecoveryWithAlert, trainingInjuries } from './injuryEngine';
import {
  newsClub, newsCupWinner, newsEuroWinner, newsGiantKilling, newsInjury, newsLeagueChampion, newsManager,
  newsPurplePatch, newsWonderkidDebut, pruneNews, pruneNewsKeys, scanBreakouts,
} from './newsEngine';
import { boardGoalFor, emptyLedger, initialEuroEntrants } from './worldGenerator';

export const SEASON_WEEKS = 30;
/** pre-season runs matchweeks -2, -1, 0: no fixtures, transfer window already open */
export const PRE_SEASON_START = -2;
export const CUP_WEEKS = [3, 7, 12, 17, 22, 27];
export const CUP_ROUND_NAMES = ['Round 1', 'Round 2', 'Round of 16', 'Quarter-Final', 'Semi-Final', 'Final'];
export const EURO_GROUP_WEEKS = [4, 6, 8, 10, 12, 14];
export const EURO_QF_WEEK = 18;
export const EURO_SF_WEEK = 23;
export const EURO_FINAL_WEEK = 28;
const SACK_THRESHOLD = 18;

/* ------------------------------------------------------------------ */
/* Fixture generation                                                  */
/* ------------------------------------------------------------------ */

export function roundRobin(ids: string[]): [string, string][][] {
  const teams = [...ids];
  if (teams.length % 2) teams.push('BYE');
  const n = teams.length;
  const rounds: [string, string][][] = [];
  const arr = [...teams];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== 'BYE' && b !== 'BYE') pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop() as string);
  }
  const second = rounds.map((rd) => rd.map(([h, a]) => [a, h] as [string, string]));
  return [...rounds, ...second];
}

function mkFixture(g: GameState, comp: CompetitionKind, mw: number, homeId: string, awayId: string, label?: string): Fixture {
  return { id: nextId(g, 'fx'), competition: comp, matchweek: mw, homeId, awayId, played: false, homeGoals: 0, awayGoals: 0, penalties: null, winnerId: null, label };
}

export function setupSeason(g: GameState, rng: Rng, euroEntrants: string[]): void {
  const active = g.activeCountry;
  for (const lg of Object.values(g.leagues)) {
    lg.table = {};
    for (const id of lg.clubIds) lg.table[id] = emptyRow(id);
    lg.fixtures = [];
    if (lg.country === active) {
      const rounds = roundRobin(rng.shuffle([...lg.clubIds]));
      rounds.forEach((pairs, i) => {
        for (const [h, a] of pairs) lg.fixtures.push(mkFixture(g, 'LEAGUE', i + 1, h, a));
      });
    }
  }
  // domestic cup
  g.cup = {
    name: g.cup.name,
    championId: null,
    rounds: CUP_WEEKS.map<CupRound>((mw, i) => ({ name: CUP_ROUND_NAMES[i], matchweek: mw, ties: [] })),
  };
  // European Cup: seeded pots
  const ranked = [...euroEntrants].sort((a, b) => squadStrength(g, g.clubs[b]) - squadStrength(g, g.clubs[a]));
  const pots = [ranked.slice(0, 4), ranked.slice(4, 8), ranked.slice(8, 12), ranked.slice(12, 16)].map((p) => rng.shuffle([...p]));
  const groups = ['A', 'B', 'C', 'D'].map((name, gi) => {
    const clubIds = pots.map((p) => p[gi]).filter(Boolean);
    const table: Record<string, ReturnType<typeof emptyRow>> = {};
    for (const id of clubIds) table[id] = emptyRow(id);
    return { name, clubIds, table };
  });
  const groupFixtures: Fixture[] = [];
  const md: [number, number][][] = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]], [[1, 0], [3, 2]], [[2, 0], [3, 1]], [[3, 0], [2, 1]]];
  for (const grp of groups) {
    md.forEach((pairs, i) => {
      for (const [h, a] of pairs) {
        if (grp.clubIds[h] && grp.clubIds[a]) groupFixtures.push(mkFixture(g, 'EURO', EURO_GROUP_WEEKS[i], grp.clubIds[h], grp.clubIds[a], `Group ${grp.name}`));
      }
    });
  }
  g.euro = {
    groups, groupFixtures, quarterFinals: [], semiFinals: [], final: null, stage: 'GROUPS', championId: null,
    defendingChampionId: g.euro.championId ?? g.euro.defendingChampionId ?? null,
  };
  g.season.matchweek = PRE_SEASON_START; // three pre-season weeks (-2, -1, 0), then matchweek 1
  g.season.window = 'SUMMER';
  g.aiTradeFaxesThisSeason = 0;
  for (const p of Object.values(g.players)) p.season = emptySeasonStats();
  for (const c of Object.values(g.clubs)) c.finances.ledger = emptyLedger();
}

/* ------------------------------------------------------------------ */
/* Team sheets                                                         */
/* ------------------------------------------------------------------ */

export function buildSheet(g: GameState, club: Club, isUser: boolean, strengthDiff: number): TeamSheet {
  const formation = club.tactics.formation;
  const sel = fillLineup(g, club, formation, isUser ? club.tactics.lineup : []);
  let bench = sel.bench;
  if (isUser) {
    const used = new Set(sel.lineup.filter(Boolean) as string[]);
    const pref = club.tactics.bench.filter((id) => !used.has(id) && g.players[id]?.clubId === club.id && g.players[id].injuryWeeks === 0);
    bench = [...pref, ...sel.bench.filter((id) => !pref.includes(id))].slice(0, 7);
  }
  const roles = sanitiseRoles(formation, club.tactics.roles);
  const slots = FORMATIONS[formation].slots;
  const instr = club.tactics.instructions ?? [];
  const starters = sel.lineup
    .map((id, i) => (id ? { player: g.players[id], slot: slots[i].pos, role: roles[i], instruction: isUser ? instr[i] ?? null : null } : null))
    .filter((x): x is NonNullable<typeof x> => x !== null);
  let dials: TeamDials = club.tactics.dials;
  if (!isUser) {
    if (strengthDiff < -6) dials = { ...dials, mentality: 'DEFENSIVE' };
    else if (strengthDiff > 6) dials = { ...dials, mentality: 'ATTACKING' };
  }
  return {
    physioStars: staffStarsOf(g, club.id, 'PHYSIO'),
    autoManage: !isUser,
    clubId: club.id, name: club.name, formation, dials,
    familiarity: isUser ? matchFamiliarity(club) : 85,
    atmosphere: club.teamAtmosphere, homeBoost: club.homeBoost, fanInterest: club.fanInterest,
    starters, bench: bench.map((id) => g.players[id]).filter(Boolean),
  };
}

/* ------------------------------------------------------------------ */
/* Playing fixtures                                                    */
/* ------------------------------------------------------------------ */

interface WeekCtx {
  rng: Rng;
  strength: Record<string, number>;
  weekStats: Record<string, PlayerMatchStats>;
  clubResults: Record<string, ('W' | 'D' | 'L')[]>;
  lines: WeekResultLine[];
  userResults: MatchResult[];
}

function str(g: GameState, wc: WeekCtx, id: string): number {
  if (wc.strength[id] === undefined) wc.strength[id] = squadStrength(g, g.clubs[id]);
  return wc.strength[id];
}

function playFixture(g: GameState, wc: WeekCtx, fx: Fixture, knockout: boolean, neutral: boolean): MatchResult {
  const home = g.clubs[fx.homeId];
  const away = g.clubs[fx.awayId];
  const userId = g.manager.clubId;
  const sh = str(g, wc, home.id);
  const sa = str(g, wc, away.id);
  const ctx: MatchContext = {
    competition: fx.competition, isKnockout: knockout, isDerby: home.rivalId === away.id, neutralVenue: neutral, mode: 'AUTO_SIM',
  };
  const hs = buildSheet(g, home, home.id === userId, sh - sa);
  const as = buildSheet(g, away, away.id === userId, sa - sh);
  const r = simulateMatch(hs, as, ctx, wc.rng, fx.id);
  fx.played = true;
  fx.homeGoals = r.homeGoals;
  fx.awayGoals = r.awayGoals;
  fx.penalties = r.penalties;
  fx.winnerId = r.homeGoals > r.awayGoals ? home.id : r.homeGoals < r.awayGoals ? away.id : r.penalties ? (r.penalties.home > r.penalties.away ? home.id : away.id) : null;
  applyMatchEffects(g, wc, r, home, away, ctx);
  wc.lines.push({ fixtureId: fx.id, competition: fx.competition, homeId: home.id, awayId: away.id, homeGoals: r.homeGoals, awayGoals: r.awayGoals, penalties: r.penalties });
  if (home.id === userId || away.id === userId) {
    wc.userResults.push(r);
    const mine = home.id === userId ? r.home : r.away;
    const theirs = home.id === userId ? r.away : r.home;
    let ts = g.teamStats;
    if (!ts || ts.year !== g.season.year || ts.clubId !== userId) ts = g.teamStats = { year: g.season.year, clubId: userId as string, g: 0, w: 0, d: 0, l: 0, cs: 0, gf: 0, ga: 0, poss: 0, shots: 0, sot: 0, xg: 0, xgc: 0 };
    ts.g++; ts.gf += mine.goals; ts.ga += theirs.goals;
    if (mine.goals > theirs.goals) ts.w++; else if (mine.goals < theirs.goals) ts.l++; else ts.d++;
    if (theirs.goals === 0) ts.cs++;
    ts.poss += mine.possessionPct; ts.shots += mine.shots; ts.sot += mine.shotsOnTarget; ts.xg += mine.xg; ts.xgc += mine.xgc;
  }
  return r;
}

function applyMatchEffects(g: GameState, wc: WeekCtx, r: MatchResult, home: Club, away: Club, ctx: MatchContext): void {
  const rng = wc.rng;
  for (const ps of Object.values(r.players)) {
    const p = g.players[ps.playerId];
    if (!p) continue;
    p.fitness = ps.fitnessEnd;
    if (ps.injured) {
      const club = g.clubs[ps.clubId];
      const physio = club ? staffStarsOf(g, club.id, 'PHYSIO') : 2;
      const key = isKeyPlayer(g, p);
      const inj = rollInjury(rng, physio, 'MATCH', g.season.year, g.season.matchweek);
      applyInjury(g, p, inj);
      if (club) newsInjury(g, rng, p, club, inj, key);
    }
    p.season.apps++;
    p.season.minutes += ps.minutes;
    p.season.goals += ps.goals;
    p.season.assists += ps.assists;
    p.season.xg += ps.xg;
    p.season.xa += ps.xa;
    p.season.shots += ps.shots;
    p.season.ratingSum += ps.rating;
    const prevStreak = p.streak;
    updateForm(rng, p, ps.rating);
    if (ps.clubId === g.manager.clubId && prevStreak === 0 && p.streak > 0) newsPurplePatch(g, rng, p, g.clubs[ps.clubId]);
    if (ps.clubId === g.manager.clubId && p.isYouthProduct && p.truePA >= 85 && p.age <= 19 && ps.minutes > 0 && g.newsKeys[`debut:${p.id}`] === undefined) {
      newsWonderkidDebut(g, rng, p, g.clubs[ps.clubId]);
    }
    if (p.season.goals >= 10 && ps.goals > 0 && p.isYouthProduct) p.fanFavorite = true;
    if (p.season.apps >= 20 && p.season.ratingSum / p.season.apps >= 7.2) p.fanFavorite = true;
    const prev = wc.weekStats[p.id];
    if (prev) {
      prev.minutes += ps.minutes;
      prev.rating = (prev.rating + ps.rating) / 2;
      prev.started = prev.started || ps.started;
    } else wc.weekStats[p.id] = { ...ps };
  }
  const resH: 'W' | 'D' | 'L' = r.homeGoals > r.awayGoals ? 'W' : r.homeGoals < r.awayGoals ? 'L' : 'D';
  const resA: 'W' | 'D' | 'L' = resH === 'W' ? 'L' : resH === 'L' ? 'W' : 'D';
  (wc.clubResults[home.id] ??= []).push(resH);
  (wc.clubResults[away.id] ??= []).push(resA);
  for (const [c, res] of [[home, resH], [away, resA]] as const) {
    c.streak = res === 'W' ? Math.max(1, c.streak + 1) : res === 'L' ? Math.min(-1, c.streak - 1) : 0;
  }
  const isDerby = ctx.isDerby;
  fanInterestAfterMatch(home, r.homeGoals, r.awayGoals, isDerby, ctx.competition);
  fanInterestAfterMatch(away, r.awayGoals, r.homeGoals, isDerby, ctx.competition);
  const gate = gateReceipts(home, away, isDerby, ctx.competition);
  if (!ctx.neutralVenue) {
    credit(home, gate.home, 'tickets');
    if (gate.away > 0) credit(away, gate.away, 'tickets');
  } else {
    credit(home, Math.round(gate.home * 0.6), 'tickets');
    credit(away, Math.round(gate.home * 0.6), 'tickets');
  }
  const userId = g.manager.clubId;
  if (userId && (home.id === userId || away.id === userId)) {
    g.manager.matchesManaged++;
    const won = (home.id === userId && resH === 'W') || (away.id === userId && resA === 'W');
    if (won) g.manager.wins++;
    const userClub = g.clubs[userId];
    afterMatchFamiliarity(userClub, staffStarsOf(g, userId, 'HEAD_COACH'));
    const res = home.id === userId ? resH : resA;
    const b = userClub.board;
    const delta = res === 'W' ? 2.2 : res === 'L' ? -2.0 * b.patience : 0.3;
    b.value = clamp(b.value + delta, 0, 100);
    g.manager.reputation = clamp(g.manager.reputation + (res === 'W' ? 0.25 * (4 - userClub.tier) * 0.5 : res === 'L' ? -0.1 : 0), 1, 100);
  }
}

/* ------------------------------------------------------------------ */
/* Cup & European Cup progression                                      */
/* ------------------------------------------------------------------ */

function drawCupRound(g: GameState, rng: Rng, idx: number): void {
  const round = g.cup.rounds[idx];
  if (round.ties.length > 0) return;
  let entrants: string[];
  if (idx === 0) {
    entrants = Object.values(g.clubs).filter((c) => c.country === g.activeCountry && c.tier >= 2).map((c) => c.id);
  } else {
    const prev = g.cup.rounds[idx - 1].ties.map((t) => t.winnerId).filter((x): x is string => !!x);
    entrants = idx === 1 ? [...prev, ...Object.values(g.clubs).filter((c) => c.country === g.activeCountry && c.tier === 1).map((c) => c.id)] : prev;
  }
  rng.shuffle(entrants);
  for (let i = 0; i + 1 < entrants.length; i += 2) {
    round.ties.push(mkFixture(g, 'CUP', round.matchweek, entrants[i], entrants[i + 1], round.name));
  }
}

function playCupRound(g: GameState, wc: WeekCtx, idx: number): void {
  const round = g.cup.rounds[idx];
  const isFinal = idx === CUP_WEEKS.length - 1;
  for (const t of round.ties) {
    if (t.played) continue;
    playFixture(g, wc, t, true, isFinal);
    if (t.winnerId) {
      const winner = g.clubs[t.winnerId];
      credit(winner, CUP_PRIZE[idx], 'prize');
      const loser = g.clubs[t.winnerId === t.homeId ? t.awayId : t.homeId];
      if (winner.tier === 3 && loser.tier < 3) {
        const pens = t.penalties ? ` (${t.penalties.home}-${t.penalties.away} pens)` : '';
        newsGiantKilling(g, wc.rng, winner, loser, `${t.homeGoals}-${t.awayGoals}${pens}`, g.cup.name);
        if (winner.tier > loser.tier + 1) winner.fanInterest = clamp(winner.fanInterest + 5, 0, 100);
      }
    }
  }
  if (isFinal && round.ties[0]?.winnerId) {
    g.cup.championId = round.ties[0].winnerId;
    credit(g.clubs[g.cup.championId], 400_000, 'prize');
    const fin = round.ties[0];
    newsCupWinner(g, wc.rng, g.clubs[g.cup.championId], g.cup.name, g.clubs[fin.winnerId === fin.homeId ? fin.awayId : fin.homeId] ?? null);
  }
}

function euroGroupStandings(g: GameState) {
  return g.euro.groups.map((grp) => sortedTable(grp.table).map((r) => r.clubId));
}

function playEuro(g: GameState, wc: WeekCtx, mw: number): void {
  const e = g.euro;
  const gi = EURO_GROUP_WEEKS.indexOf(mw);
  if (gi >= 0) {
    for (const fx of e.groupFixtures) {
      if (fx.matchweek !== mw || fx.played) continue;
      playFixture(g, wc, fx, false, false);
      const grp = e.groups.find((x) => x.clubIds.includes(fx.homeId));
      if (grp) applyResultToTable(grp.table, fx.homeId, fx.awayId, fx.homeGoals, fx.awayGoals);
      if (fx.winnerId) credit(g.clubs[fx.winnerId], EURO_PRIZE.win, 'prize');
    }
    if (gi === 0) for (const grp of e.groups) for (const id of grp.clubIds) credit(g.clubs[id], EURO_PRIZE.group, 'prize');
    if (gi === EURO_GROUP_WEEKS.length - 1) e.stage = 'QF';
    return;
  }
  if (mw === EURO_QF_WEEK) {
    const st = euroGroupStandings(g);
    const pairs: [string, string][] = [[st[0][0], st[1][1]], [st[1][0], st[0][1]], [st[2][0], st[3][1]], [st[3][0], st[2][1]]];
    e.quarterFinals = pairs.filter(([a, b]) => a && b).map(([a, b]) => mkFixture(g, 'EURO', mw, a, b, 'Quarter-Final'));
    for (const fx of e.quarterFinals) {
      playFixture(g, wc, fx, true, false);
      if (fx.winnerId) credit(g.clubs[fx.winnerId], EURO_PRIZE.qf, 'prize');
    }
    e.stage = 'SF';
    return;
  }
  if (mw === EURO_SF_WEEK) {
    const w = e.quarterFinals.map((f) => f.winnerId).filter((x): x is string => !!x);
    e.semiFinals = [];
    for (let i = 0; i + 1 < w.length; i += 2) e.semiFinals.push(mkFixture(g, 'EURO', mw, w[i], w[i + 1], 'Semi-Final'));
    for (const fx of e.semiFinals) {
      playFixture(g, wc, fx, true, false);
      if (fx.winnerId) credit(g.clubs[fx.winnerId], EURO_PRIZE.sf, 'prize');
    }
    e.stage = 'FINAL';
    return;
  }
  if (mw === EURO_FINAL_WEEK) {
    const w = e.semiFinals.map((f) => f.winnerId).filter((x): x is string => !!x);
    if (w.length === 2) {
      e.final = mkFixture(g, 'EURO', mw, w[0], w[1], 'Final');
      playFixture(g, wc, e.final, true, true);
      if (e.final.winnerId) {
        e.championId = e.final.winnerId;
        credit(g.clubs[e.championId], EURO_PRIZE.champion, 'prize');
        const ru = e.final.winnerId === e.final.homeId ? e.final.awayId : e.final.homeId;
        newsEuroWinner(g, wc.rng, g.clubs[e.championId], g.clubs[ru] ?? null);
      }
    }
    e.stage = 'DONE';
  }
}

/* ------------------------------------------------------------------ */
/* Board, sacking, job offers                                          */
/* ------------------------------------------------------------------ */

export function leaguePosition(g: GameState, clubId: string): number {
  const c = g.clubs[clubId];
  const lg = g.leagues[c.leagueId];
  return sortedTable(lg.table).findIndex((r) => r.clubId === clubId) + 1;
}

function weeklyBoard(g: GameState, club: Club): void {
  const b = club.board;
  if (g.season.matchweek >= 8) {
    const pos = leaguePosition(g, club.id);
    const diff = b.goal.targetPosition - pos;
    b.value += diff >= 0 ? 0.5 : -0.22 * Math.min(6, -diff) * b.patience;
  }
  if (club.finances.bank < 0) b.value -= 1.5 * b.patience;
  b.value = clamp(b.value, 0, 100);
}

export function sackManager(g: GameState, rng: Rng, reason: string): void {
  const clubId = g.manager.clubId;
  if (!clubId) return;
  const club = g.clubs[clubId];
  club.board.value = 55;
  g.manager.sackings++;
  g.manager.reputation = clamp(g.manager.reputation - 8, 1, 100);
  g.manager.clubId = null;
  g.status = 'SACKED';
  for (const b of g.bids) if (b.direction === 'OUTGOING' && (b.status === 'PENDING' || b.status === 'ACCEPTED' || b.status === 'COUNTERED')) b.status = 'COLLAPSED';
  g.scouting = [];
  for (const id of g.pendingYouth) delete g.players[id];
  g.pendingYouth = [];
  g.dilemma = null;
  for (const f of g.faxes) f.resolved = true;
  g.jobOffers = lifelineOffers(g, rng, clubId);
  fax(g, {
    kind: 'TERMINATION', from: `${club.name} Board`, title: 'NOTICE OF TERMINATION', resolved: false,
    body: `${reason}\nThe board has decided to relieve you of your duties with immediate effect. Please clear your desk.\n${g.jobOffers.length > 0 ? `${g.jobOffers.length} desperate club${g.jobOffers.length > 1 ? 's have' : ' has'} faxed a lifeline offer.` : 'No offers yet.'}`,
  });
  newsManager(g, club, 'SACKED');
}

function lifelineOffers(g: GameState, rng: Rng, excludeId: string): JobOffer[] {
  const pool = Object.values(g.clubs).filter((c) => !c.isShadow && c.id !== excludeId && c.tier === 3 && c.reputation <= g.manager.reputation + 15);
  const fallback = Object.values(g.clubs).filter((c) => !c.isShadow && c.id !== excludeId && c.tier === 3);
  const picks = rng.shuffle([...(pool.length >= 2 ? pool : fallback)]).slice(0, rng.int(1, 2));
  return picks.map((c) => ({ id: nextId(g, 'j'), clubId: c.id, reason: `${c.name} are desperate. Their board will give you a chance.`, expiresWeek: 99, isLifeline: true }));
}

function makeJobOffers(g: GameState, rng: Rng, maxOffers: number, midSeason: boolean): void {
  const curId = g.manager.clubId;
  if (!curId) return;
  const cur = g.clubs[curId];
  const rep = g.manager.reputation;
  const cands = Object.values(g.clubs).filter((c) => !c.isShadow && c.id !== curId && c.reputation > cur.reputation + 4 && c.reputation * 0.75 <= rep && (c.tier <= cur.tier));
  if (cands.length === 0) return;
  const n = Math.min(maxOffers, cands.length);
  const picks = rng.shuffle([...cands]).slice(0, n);
  for (const c of picks) {
    if (g.jobOffers.some((o) => o.clubId === c.id)) continue;
    const offer: JobOffer = { id: nextId(g, 'j'), clubId: c.id, reason: `${c.name} (Tier ${c.tier}) want you as their new manager.`, expiresWeek: midSeason ? g.season.matchweek + 2 : 99, isLifeline: false };
    g.jobOffers.push(offer);
    fax(g, {
      kind: 'JOB_OFFER', from: `${c.name} Chairman`, title: `JOB OFFER: ${c.name}`, jobOfferId: offer.id, resolved: false,
      body: `Our chairman has been impressed by your work. We are offering you the manager's job at ${c.name} (Tier ${c.tier}, reputation ${c.reputation}). Board goal: ${c.board.goal.label}.${midSeason ? ' This offer expires in 2 weeks.' : ''}`,
    });
  }
}

export function acceptJob(g: GameState, offerId: string): { ok: boolean; message: string } {
  const offer = g.jobOffers.find((o) => o.id === offerId);
  if (!offer) return { ok: false, message: 'Offer expired.' };
  const club = g.clubs[offer.clubId];
  if (g.manager.clubId) {
    for (const b of g.bids) if (b.direction === 'OUTGOING' && b.status !== 'COMPLETED') b.status = 'COLLAPSED';
    g.scouting = [];
    for (const id of g.pendingYouth) delete g.players[id];
    g.pendingYouth = [];
  }
  g.manager.clubId = club.id;
  club.board.value = offer.isLifeline ? 52 : 62;
  initFamiliarity(club, 70);
  const sel = fillLineup(g, club, club.tactics.formation);
  club.tactics.lineup = sel.lineup;
  club.tactics.bench = sel.bench;
  club.tactics.roles = sanitiseRoles(club.tactics.formation, club.tactics.roles);
  club.tactics.trainingTags = [];
  g.jobOffers = [];
  g.dilemma = null;
  for (const f of g.faxes) if (f.kind === 'JOB_OFFER' || f.kind === 'TERMINATION') f.resolved = true;
  g.status = g.season.matchweek > SEASON_WEEKS ? 'SEASON_END' : 'PLAYING';
  g.phase = 'PREP';
  g.watchedResults = g.lastUserResults.map((r) => r.id);
  const srng = createRng((g.rngState ^ 0x51ab) >>> 0);
  refreshShortlist(g, srng, true);
  newsManager(g, club, 'HIRED');
  return { ok: true, message: `Welcome to ${club.name}.` };
}

/* ------------------------------------------------------------------ */
/* Weekly ticker                                                       */
/* ------------------------------------------------------------------ */

export function advanceMatchweek(g: GameState): void {
  if (g.status === 'SEASON_END' || g.season.matchweek > SEASON_WEEKS) return;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const rng = createRng(g.rngState);
  const mw = g.season.matchweek;
  const wc: WeekCtx = { rng, strength: {}, weekStats: {}, clubResults: {}, lines: [], userResults: [] };
  if (g.manager.clubId && g.clubs[g.manager.clubId]) syncBench(g, g.clubs[g.manager.clubId]); // bench full before every matchday

  // midweek: European Cup and domestic cup
  const pre = mw < 1;
  if (!pre) playEuro(g, wc, mw);
  const cupIdx = CUP_WEEKS.indexOf(mw);
  if (cupIdx >= 0) {
    drawCupRound(g, rng, cupIdx);
    playCupRound(g, wc, cupIdx);
  }
  // short midweek recovery for clubs that played
  for (const id of Object.keys(wc.weekStats)) {
    const p = g.players[id];
    if (p) p.fitness = Math.min(100, p.fitness + 9);
  }
  // weekend: league
  for (const lg of Object.values(g.leagues)) {
    if (lg.isShadow) continue;
    for (const fx of lg.fixtures) {
      if (fx.matchweek !== mw || fx.played) continue;
      playFixture(g, wc, fx, false, false);
      applyResultToTable(lg.table, fx.homeId, fx.awayId, fx.homeGoals, fx.awayGoals);
    }
  }
  const simMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;

  // weekly club processing (active country)
  const userId = g.manager.clubId;
  for (const club of Object.values(g.clubs)) {
    if (club.isShadow) {
      for (const id of club.playerIds) {
        const p = g.players[id];
        if (p) { p.fitness = Math.min(100, p.fitness + 40); tickRecovery(p); }
      }
      continue;
    }
    const lg = g.leagues[club.leagueId];
    const pos = sortedTable(lg.table).findIndex((r) => r.clubId === club.id) + 1;
    if (!pre) {
      weeklyProgressionForClub(g, rng, club, wc.weekStats, pos <= 8);
      updateMoraleAfterWeek(g, club, wc.clubResults[club.id] ?? [], wc.weekStats);
    }
    const physio = staffStarsOf(g, club.id, 'PHYSIO');
    const extra = club.tactics.trainingFocus === 'PHYSICAL' ? 3 : 0;
    for (const id of club.playerIds) {
      const p = g.players[id];
      if (!p) continue;
      // a knock picked up this weekend doesn't start healing until next week
      if (p.injuryWeeks > 0) { if (!(p.injury && p.injury.year === g.season.year && p.injury.matchweek === mw)) tickRecoveryWithAlert(g, p); }
      else p.fitness = Math.min(100, p.fitness + 20 + physio * 3 + extra);
    }
    // rare training-ground knocks
    for (const hurt of trainingInjuries(g, rng, club, physio)) {
      if (club.id === userId && hurt.injury) {
        fax(g, { kind: 'NEWS', from: 'Physio', title: `TRAINING INJURY: ${fullName(hurt)}`, body: `${fullName(hurt)} picked up ${/^[aeiou]/i.test(hurt.injury.name) ? 'an' : 'a'} ${hurt.injury.name.toLowerCase()} in training. Out for ${hurt.injuryWeeks} week${hurt.injuryWeeks > 1 ? 's' : ''}.`, resolved: true });
        newsInjury(g, rng, hurt, club, hurt.injury, true);
      }
    }
    payWeeklyWages(g, club);
    if (!pre && mw <= SEASON_WEEKS) credit(club, weeklyTV(club, pos), 'tv');
    if (club.id !== userId && club.playerIds.length < 19) aiSignFreeAgent(g, rng, club);
  }

  if (userId) {
    const userClub = g.clubs[userId];
    if (!pre) weeklyBoard(g, userClub);
    // the finance director speaks up when cash gets thin (a warning, not a block)
    const bill = weeklyBill(g, userClub);
    const runway = bill > 0 ? userClub.finances.bank / bill : 99;
    const cashKey = `cash:${Math.floor(mw / 4)}`;
    if (runway >= 0 && runway < 4 && g.newsKeys[cashKey] !== g.season.year) {
      g.newsKeys[cashKey] = g.season.year;
      fax(g, { kind: 'NEWS', from: 'Finance Director', title: 'CASH WARNING', body: `The bank covers only ${Math.floor(runway)} week${Math.floor(runway) === 1 ? '' : 's'} of wages. If it goes below zero, all signings are frozen and the board's patience runs out. Sell, or hold off on spending.`, resolved: true });
    }
    // transfers
    for (const b of g.bids) {
      if (b.direction === 'OUTGOING' && b.status === 'PENDING' && b.resolveWeek <= mw && b.season === g.season.year) resolveOutgoingBid(g, rng, b);
      else if (b.direction === 'OUTGOING' && (b.status === 'ACCEPTED' || b.status === 'COUNTERED') && (b.resolveWeek < mw - 1 || windowFor(mw + 1) === 'CLOSED' && windowFor(mw) !== 'CLOSED')) {
        b.status = 'COLLAPSED';
        for (const f of g.faxes) if (f.bidId === b.id) f.resolved = true;
      }
    }
    expireIncomingBids(g);
    aiIncomingBids(g, rng, userId);
    refreshShortlist(g, rng);
    maybeAiTradeFax(g, rng, userId);
    balanceFreeAgents(g);
    ensureFreeAgentCoverage(g, rng, g.activeCountry); // AI clubs soak up free agents all season: keep every position stocked
    // scouting
    const ready = g.scouting.filter((s) => s.readySeason === g.season.year && s.readyWeek <= mw);
    g.scouting = g.scouting.filter((s) => !ready.includes(s));
    for (const s of ready) {
      const p = g.players[s.playerId];
      if (!p) continue;
      const rep = generateScoutReport(g, p, userClub.staff.CHIEF_SCOUT);
      g.scoutReports[p.id] = rep;
      fax(g, {
        kind: 'SCOUT_REPORT', from: 'Chief Scout', title: `SCOUT REPORT: ${fullName(p)}`, playerId: p.id, resolved: true,
        body: `${p.age}yo ${p.position} at ${p.clubId ? g.clubs[p.clubId].name : 'Free Agent'}. OVR ${rep.ovrRange[0]}–${rep.ovrRange[1]}${rep.staffStars < 3 ? '?' : ''}. Potential ${rep.paRange[0]}–${rep.paRange[1]}. "${rep.verdict}"`,
      });
    }
    // youth intake
    if (INTAKE_WEEKS.includes(mw)) youthIntake(g, rng, userClub, true);
    // dressing room dilemma
    const d = pre ? null : maybeCreateDilemma(g, rng, userClub);
    if (d) {
      g.dilemma = d;
      fax(g, { kind: 'DILEMMA', from: 'Dressing Room', title: `DILEMMA: ${d.title}`, body: d.text, resolved: false });
    }
    // job offers expiry & mid-season offers
    g.jobOffers = g.jobOffers.filter((o) => o.expiresWeek > mw);
    if ((mw === 12 || mw === 22) && userClub.board.value > 45 && rng.chance(0.4)) makeJobOffers(g, rng, 1, true);
    // sacking
    if (userClub.board.value < SACK_THRESHOLD && mw >= 6) {
      sackManager(g, rng, `Board confidence has collapsed to ${Math.round(userClub.board.value)}%.`);
    }
  } else if (g.status === 'SACKED' && rng.chance(0.5)) {
    const extra = lifelineOffers(g, rng, '');
    for (const o of extra) if (!g.jobOffers.some((x) => x.clubId === o.clubId)) g.jobOffers.push(o);
  }

  g.lastWeekResults = wc.lines;
  if (wc.userResults.length > 0 || userId) g.lastUserResults = wc.userResults;
  aiWorldTransfers(g, rng);
  scanBreakouts(g, rng);
  g.lastSimMs = Math.round(simMs * 10) / 10;
  g.season.matchweek = mw + 1;
  g.season.window = windowFor(g.season.matchweek);
  pruneNews(g);
  if (g.season.matchweek > SEASON_WEEKS) finalizeSeason(g, rng);
  if (pre) { g.phase = 'PREP'; g.dayAfter = { recovery: null, pressDone: false }; g.pressConference = null; }
  else afterMatchweek(g, rng);
  g.rngState = rng.state;
}

function aiSignFreeAgent(g: GameState, rng: Rng, club: Club): void {
  const need = SQUAD_TEMPLATE.find((pos) => club.playerIds.filter((id) => g.players[id]?.position === pos).length < SQUAD_TEMPLATE.filter((x) => x === pos).length) ?? 'CM';
  const fa = g.freeAgentIds.map((id) => g.players[id]).filter((p) => p && p.position === need).sort((a, b) => b.ca - a.ca)[0];
  if (fa) {
    movePlayer(g, fa, club.id);
    fa.contract = { wage: wageFor(fa.ca, club.tier, club.country, fa.position), yearsLeft: rng.int(1, 2), releaseClause: null };
  } else {
    const p = generatePlayer(g, rng, { nationality: rollNationality(rng, club.country, club.tier === 1 ? 'SENIOR_T1' : 'SENIOR'), country: club.country, position: need, age: rng.int(18, 30), targetOvr: avgCa(g, club) - 4, clubId: club.id, tier: club.tier });
    g.players[p.id] = p;
    club.playerIds.push(p.id);
  }
}

/* ------------------------------------------------------------------ */
/* Season end                                                          */
/* ------------------------------------------------------------------ */

function playoff(g: GameState, rng: Rng, lg: League): string | null {
  const t = sortedTable(lg.table);
  if (t.length < 4) return null;
  const fx = mkFixture(g, 'PLAYOFF', 31, t[2].clubId, t[3].clubId, 'Play-off Final');
  const wc: WeekCtx = { rng, strength: {}, weekStats: {}, clubResults: {}, lines: [], userResults: [] };
  playFixture(g, wc, fx, true, true);
  if (wc.userResults.length) g.lastUserResults = [...g.lastUserResults, ...wc.userResults];
  return fx.winnerId;
}

export function finalizeSeason(g: GameState, rng: Rng): void {
  const lines: string[] = [];
  const champions: Record<string, string> = {};
  // shadow leagues: single fast pass
  for (const lg of Object.values(g.leagues)) if (lg.isShadow) resolveShadowLeague(g, rng, lg);
  for (const lg of Object.values(g.leagues)) {
    const t = sortedTable(lg.table);
    champions[lg.name] = g.clubs[t[0].clubId].name;
    lines.push(`${lg.name}: ${g.clubs[t[0].clubId].name} are champions.`);
    newsLeagueChampion(g, rng, g.clubs[t[0].clubId], lg.name, t[0].pts);
  }
  pruneNewsKeys(g);
  const promoted: string[] = [];
  const relegated: string[] = [];
  const a = g.activeCountry;
  for (const tier of [2, 3] as Tier[]) {
    const lg = g.leagues[`${a}-${tier}`];
    const t = sortedTable(lg.table);
    const po = playoff(g, rng, lg);
    const up = [t[0].clubId, t[1].clubId, ...(po ? [po] : [])];
    promoted.push(...up);
    lines.push(`Promoted from ${lg.name}: ${up.map((id) => g.clubs[id].name).join(', ')}${po ? ' (play-off)' : ''}`);
  }
  for (const tier of [1, 2] as Tier[]) {
    const lg = g.leagues[`${a}-${tier}`];
    const t = sortedTable(lg.table);
    const down = t.slice(-3).map((r) => r.clubId);
    relegated.push(...down);
    lines.push(`Relegated from ${lg.name}: ${down.map((id) => g.clubs[id].name).join(', ')}`);
  }
  if (g.cup.championId) {
    champions[g.cup.name] = g.clubs[g.cup.championId].name;
    lines.push(`${g.cup.name}: won by ${g.clubs[g.cup.championId].name}.`);
  }
  if (g.euro.championId) {
    champions['European Cup'] = g.clubs[g.euro.championId].name;
    lines.push(`European Cup: won by ${g.clubs[g.euro.championId].name}.`);
  }
  // TV & prize money
  let userTV = 0;
  for (const lg of Object.values(g.leagues)) {
    sortedTable(lg.table).forEach((r, i) => {
      const c = g.clubs[r.clubId];
      const tv = tvMoney(c, i + 1);
      credit(c, c.isShadow ? tv : Math.round(tv * (1 - TV_WEEKLY_SHARE)), 'tv'); // merit payment on final position; the rest came weekly
      if (c.isShadow) c.finances.bank -= Math.round(tv * 0.85);
      if (c.id === g.manager.clubId) userTV = tv;
    });
  }
  // European qualification for next season
  const euroEntrants: string[] = [];
  const nation: { code: CountryCode; s: number; fourth: string }[] = [];
  for (const code of COUNTRY_CODES) {
    const t = sortedTable(g.leagues[`${code}-1`].table);
    euroEntrants.push(t[0].clubId, t[1].clubId, t[2].clubId);
    nation.push({ code, s: t.slice(0, 6).reduce((acc, r) => acc + squadStrength(g, g.clubs[r.clubId]), 0), fourth: t[3].clubId });
  }
  const champ = g.euro.championId;
  if (champ && !euroEntrants.includes(champ) && !relegated.includes(champ)) euroEntrants.push(champ);
  else euroEntrants.push(nation.sort((x, y) => y.s - x.s)[0].fourth);

  // board verdict + manager career
  let boardVerdict = '';
  const userId = g.manager.clubId;
  if (userId) {
    const club = g.clubs[userId];
    const pos = leaguePosition(g, userId);
    const goal = club.board.goal;
    const met = pos <= goal.targetPosition;
    let delta = met ? 18 : -4 * Math.min(5, pos - goal.targetPosition) * club.board.patience;
    let rep = met ? 5 : -4;
    if (promoted.includes(userId)) { delta += 12; rep += 12; g.manager.trophies.push(`${g.season.year} Promotion (${g.leagues[club.leagueId].name})`); }
    if (pos === 1) { rep += 10 + (4 - club.tier) * 4; g.manager.trophies.push(`${g.season.year} ${g.leagues[club.leagueId].name} Champions`); }
    if (relegated.includes(userId)) { delta -= 20; rep -= 10; }
    if (g.cup.championId === userId) { rep += 10; delta += 10; g.manager.trophies.push(`${g.season.year} ${g.cup.name}`); }
    if (g.euro.championId === userId) { rep += 20; delta += 15; g.manager.trophies.push(`${g.season.year} European Cup`); }
    if (club.finances.bank < 0) delta -= 8;
    club.board.value = clamp(club.board.value + delta, 0, 100);
    g.manager.reputation = clamp(g.manager.reputation + rep, 1, 100);
    g.manager.seasonsManaged++;
    boardVerdict = met ? `Board goal achieved (${goal.label}). Finished ${ordinal(pos)}.` : `Board goal missed (${goal.label}). Finished ${ordinal(pos)}.`;
    const cupRes = cupResult(g, userId);
    g.history.unshift({
      year: g.season.year, clubId: userId, clubName: club.name, tier: club.tier, position: pos, cupResult: cupRes,
      euroResult: euroResult(g, userId), champions, note: boardVerdict,
    });
    lines.unshift(`${club.name}: finished ${ordinal(pos)} in ${g.leagues[club.leagueId].name}. ${cupRes}.`);
    if (club.board.value < SACK_THRESHOLD) {
      sackManager(g, rng, `Season verdict: ${boardVerdict}`);
      boardVerdict += ' YOU HAVE BEEN SACKED.';
    } else if (met || pos <= 6 || g.cup.championId === userId) {
      makeJobOffers(g, rng, 2, false);
    }
  }
  g.seasonSummary = { year: g.season.year, lines, promoted, relegated, champions, boardVerdict, incomeTV: userTV, euroEntrants };
  if (g.status !== 'SACKED') g.status = 'SEASON_END';
  g.season.window = 'SUMMER';
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function cupResult(g: GameState, clubId: string): string {
  if (g.cup.championId === clubId) return `${g.cup.name} WINNERS`;
  for (let i = g.cup.rounds.length - 1; i >= 0; i--) {
    if (g.cup.rounds[i].ties.some((t) => t.homeId === clubId || t.awayId === clubId)) return `${g.cup.name}: out in the ${g.cup.rounds[i].name}`;
  }
  return `${g.cup.name}: did not enter`;
}

function euroResult(g: GameState, clubId: string): string {
  const e = g.euro;
  if (e.championId === clubId) return 'European Cup WINNERS';
  if (e.final && (e.final.homeId === clubId || e.final.awayId === clubId)) return 'European Cup finalists';
  if (e.semiFinals.some((f) => f.homeId === clubId || f.awayId === clubId)) return 'European Cup semi-finalists';
  if (e.quarterFinals.some((f) => f.homeId === clubId || f.awayId === clubId)) return 'European Cup quarter-finalists';
  if (e.groups.some((gr) => gr.clubIds.includes(clubId))) return 'European Cup group stage';
  return '—';
}

/* ------------------------------------------------------------------ */
/* Rollover                                                            */
/* ------------------------------------------------------------------ */

export function startNextSeason(g: GameState): void {
  const summary = g.seasonSummary;
  if (!summary) return;
  const rng = createRng(g.rngState);
  const a = g.activeCountry;
  const userId = g.manager.clubId;

  // positions before moving clubs (for staff / reputation)
  const finish: Record<string, number> = {};
  for (const lg of Object.values(g.leagues)) sortedTable(lg.table).forEach((r, i) => (finish[r.clubId] = i + 1));

  // promotion / relegation
  for (const id of summary.relegated) moveTier(g, g.clubs[id], (g.clubs[id].tier + 1) as Tier);
  for (const id of summary.promoted) moveTier(g, g.clubs[id], (g.clubs[id].tier - 1) as Tier);
  for (const id of summary.promoted) g.clubs[id].fanInterest = clamp(g.clubs[id].fanInterest + 10, 0, 100);
  for (const id of summary.relegated) g.clubs[id].fanInterest = clamp(g.clubs[id].fanInterest - 12, 0, 100);

  returnLoans(g);

  // players: ageing, seasonal progression for shadow/free agents, contracts, retirements
  const departures: string[] = [];
  for (const p of Object.values(g.players)) {
    if (g.pendingYouth.includes(p.id)) continue;
    const club = p.clubId ? g.clubs[p.clubId] : null;
    if (!club || club.isShadow) seasonalProgression(rng, p, club ? staffStarsOf(g, club.id, 'HEAD_COACH') : 1.5, club ? 0.6 : 0);
    ageOneYear(rng, p);
    p.season = emptySeasonStats();
    p.fitness = 100;
    tickRecovery(p, 4);
    p.moraleValue = clamp(p.moraleValue + (55 - p.moraleValue) * 0.4, 0, 100);
    p.form = 0;
    p.streak = 0;
    // retirement
    const retireP = p.age >= 39 ? 1 : p.age >= 34 ? 0.15 + (p.age - 34) * 0.2 - (p.careerCurve === 'AGELESS' ? 0.1 : 0) : 0;
    const faRetire = !club && p.age >= 32 && rng.chance(0.5);
    if (rng.chance(retireP) || faRetire) {
      if (club?.id === userId) departures.push(`${fullName(p)} (${p.age}) retires.`);
      movePlayer(g, p, null);
      g.freeAgentIds = g.freeAgentIds.filter((x) => x !== p.id);
      delete g.players[p.id];
      delete g.scoutReports[p.id];
      continue;
    }
    if (club) {
      if (p.contract.fresh) delete p.contract.fresh; // signed mid-season: this rollover doesn't use up a year
      else p.contract.yearsLeft -= 1;
      if (p.contract.yearsLeft <= 0) {
        if (club.id === userId) {
          departures.push(`${fullName(p)} leaves on a free (contract expired).`);
          movePlayer(g, p, null);
          p.contract.yearsLeft = 0;
        } else if (p.age < 33 && p.ca >= avgCa(g, club) - 8 && rng.chance(0.75)) {
          p.contract.yearsLeft = rng.int(1, 3);
          p.contract.wage = Math.round(Math.max(p.contract.wage, wageFor(p.ca, club.tier, club.country, p.position)) / 10) * 10;
        } else {
          movePlayer(g, p, null);
          p.contract.yearsLeft = 0;
        }
      }
    }
  }
  if (userId && departures.length) {
    fax(g, { kind: 'NEWS', from: 'Club Secretary', title: 'SUMMER DEPARTURES', body: departures.join('\n'), resolved: true });
  }
  // an unreviewed youth intake stays in the folder across the rollover
  g.pendingYouth = g.pendingYouth.filter((id) => g.players[id]);

  // AI clubs: youth regens + squad maintenance
  for (const club of Object.values(g.clubs)) {
    if (club.id === userId) continue;
    const ids = youthIntake(g, rng, club, false);
    for (const id of ids.slice(0, 2)) { g.players[id].clubId = null; movePlayer(g, g.players[id], club.id); }
    for (const id of ids.slice(2)) delete g.players[id];
    const squad = club.playerIds.map((id) => g.players[id]).filter(Boolean).sort((x, y) => x.ca - y.ca);
    while (club.playerIds.length > 27) {
      const out = squad.shift();
      if (!out) break;
      movePlayer(g, out, null);
      out.contract.yearsLeft = 0;
    }
    let guard = 0;
    while (club.playerIds.length < 22 && guard++ < 10) aiSignFreeAgent(g, rng, club);
    const sel = fillLineup(g, club, club.tactics.formation);
    club.tactics.lineup = sel.lineup;
    club.tactics.bench = sel.bench;
    club.tactics.roles = preferredRoles(g, club);
  }
  // free agent pool upkeep
  g.freeAgentIds = g.freeAgentIds.filter((id) => g.players[id]);
  balanceFreeAgents(g);
  if (g.freeAgentIds.length > 90) {
    const sorted = g.freeAgentIds.map((id) => g.players[id]).sort((x, y) => (y.ca - y.age) - (x.ca - x.age));
    for (const p of sorted.slice(90)) { delete g.players[p.id]; delete g.scoutReports[p.id]; }
    g.freeAgentIds = sorted.slice(0, 90).map((p) => p.id);
  }
  while (g.freeAgentIds.length < 50) {
    const p = generatePlayer(g, rng, { nationality: rollNationality(rng, a, 'FREE_AGENT'), country: a, position: freeAgentPosition(g, rng), age: rng.int(19, 32), targetOvr: rng.range(46, 64), clubId: null, tier: 3 });
    p.contract.yearsLeft = 0;
    g.players[p.id] = p;
    g.freeAgentIds.push(p.id);
  }
  ensureFreeAgentCoverage(g, rng, a);

  // staff evolution
  for (const club of Object.values(g.clubs)) {
    const did = (finish[club.id] ?? 9) <= 8;
    for (const role of STAFF_ROLES) {
      const sid = club.staff[role];
      const s = sid ? g.staff[sid] : null;
      if (!s) continue;
      const before = starsFromInternal(s.ability);
      if (evolveStaff(s, rng, did) === 'RETIRED') {
        delete g.staff[s.id];
        const repl = generateStaff(g, rng, role, club.id === userId ? 15 : clamp(s.ability + rng.int(-5, 5), 10, 50), club.country, club.id);
        club.staff[role] = repl.id;
        if (club.id === userId) {
          fax(g, { kind: 'NEWS', from: 'Club Secretary', title: `${STAFF_ROLE_LABELS[role].toUpperCase()} RETIRES`, body: `${s.name} has retired. ${repl.name} (${starsFromInternal(repl.ability)}★) steps in as caretaker. Hire a replacement in Club & Finances.`, resolved: true });
        }
      } else if (club.id === userId && starsFromInternal(s.ability) !== before) {
        newsClub(g, club, `${s.name.toUpperCase()} ${starsFromInternal(s.ability) > before ? 'EARNS' : 'SLIPS TO'} ${starsFromInternal(s.ability)}★`, `${STAFF_ROLE_LABELS[role]} ${s.name} is now rated ${starsFromInternal(s.ability)}★.`);
      }
    }
  }
  generateStaffMarket(g, rng, a);

  // clubs: reputation, board goals, finances
  for (const lgTier of [1, 2, 3] as Tier[]) {
    const lg = g.leagues[`${a}-${lgTier}`];
    const ranked = [...lg.clubIds].sort((x, y) => squadStrength(g, g.clubs[y]) - squadStrength(g, g.clubs[x]));
    ranked.forEach((id, i) => {
      const c = g.clubs[id];
      const base = lgTier === 1 ? 95 - i * 3 : lgTier === 2 ? 52 - i * 1.5 : 30 - i;
      c.reputation = Math.round(clamp(c.reputation * 0.75 + base * 0.25, 5, 99));
      const arch = c.archetype === 'VOLATILE_OWNER' ? 'PROMOTION' : undefined;
      c.board.goal = boardGoalFor(c.tier, i + 1, c.tier > 1 ? arch : undefined);
      if (c.id !== userId) c.board.value = 60;
      else c.board.value = clamp(Math.max(c.board.value, 40), 0, 100);
    });
  }
  for (const c of Object.values(g.clubs)) {
    if (c.isShadow) { c.finances.bank = Math.max(c.finances.bank, 2_000_000); }
    c.teamAtmosphere = clamp(c.teamAtmosphere + (55 - c.teamAtmosphere) * 0.5, 0, 100);
  }

  // housekeeping
  g.bids = [];
  g.scouting = [];
  g.dilemma = null;
  g.lastUserResults = [];
  g.lastWeekResults = [];
  for (const f of g.faxes) if (f.kind !== 'JOB_OFFER') f.resolved = true;
  const known = new Set(Object.keys(g.players));
  for (const k of Object.keys(g.scoutReports)) if (!known.has(k)) delete g.scoutReports[k];

  g.season.year += 1;
  setupSeason(g, rng, summary.euroEntrants.filter((id) => g.clubs[id]).slice(0, 16).length === 16 ? summary.euroEntrants : initialEuroEntrants(g));
  if (userId) {
    const club = g.clubs[userId];
    club.tactics.lineup = club.tactics.lineup.map((id) => (id && g.players[id]?.clubId === userId ? id : null));
    club.tactics.bench = club.tactics.bench.filter((id) => g.players[id]?.clubId === userId);
    club.tactics.trainingTags = club.tactics.trainingTags.filter((id) => g.players[id]?.clubId === userId);
    const sel = fillLineup(g, club, club.tactics.formation, club.tactics.lineup);
    club.tactics.lineup = sel.lineup;
    fax(g, {
      kind: 'BOARD', from: `${club.name} Board`, title: `SEASON ${g.season.year}/${(g.season.year + 1) % 100} OBJECTIVES`, resolved: true,
      body: `Welcome back. This season the board expects: ${club.board.goal.label}. Board confidence: ${Math.round(club.board.value)}%. Bank: ${fmtMoney(club.finances.bank)}. The summer window is open.`,
    });
  }
  g.seasonSummary = null;
  pruneNews(g);
  if (g.status !== 'SACKED') g.status = 'PLAYING';
  g.phase = 'PREP';
  g.watchedResults = [];
  g.rngState = rng.state;
  void valuePlayer;
}

function moveTier(g: GameState, club: Club, tier: Tier): void {
  const from = g.leagues[club.leagueId];
  from.clubIds = from.clubIds.filter((x) => x !== club.id);
  const to = g.leagues[`${club.country}-${tier}`];
  to.clubIds.push(club.id);
  club.tier = tier;
  club.leagueId = to.id;
}

export function userFixturesThisWeek(g: GameState): Fixture[] {
  const id = g.manager.clubId;
  if (!id) return [];
  const mw = g.season.matchweek;
  const out: Fixture[] = [];
  for (const f of g.euro.groupFixtures) if (f.matchweek === mw && (f.homeId === id || f.awayId === id)) out.push(f);
  const cupIdx = CUP_WEEKS.indexOf(mw);
  if (cupIdx >= 0) {
    const round = g.cup.rounds[cupIdx];
    const tie = round.ties.find((t) => t.homeId === id || t.awayId === id);
    if (tie) out.push(tie);
  }
  const lg = g.leagues[g.clubs[id].leagueId];
  const lf = lg.fixtures.find((f) => f.matchweek === mw && (f.homeId === id || f.awayId === id));
  if (lf) out.push(lf);
  return out;
}

export function nextLeagueFixture(g: GameState): Fixture | null {
  const id = g.manager.clubId;
  if (!id) return null;
  const lg = g.leagues[g.clubs[id].leagueId];
  return lg.fixtures.find((f) => !f.played && (f.homeId === id || f.awayId === id)) ?? null;
}

/** Is the user's club still alive in the domestic cup? */
export function userInCup(g: GameState): boolean {
  const id = g.manager.clubId;
  if (!id) return false;
  for (let i = 0; i < g.cup.rounds.length; i++) {
    const r = g.cup.rounds[i];
    if (r.ties.length === 0) {
      if (i === 0) return g.clubs[id].tier >= 2;
      if (i === 1 && g.clubs[id].tier === 1) return true;
      const prev = g.cup.rounds[i - 1];
      return prev.ties.some((t) => t.winnerId === id);
    }
    const tie: Fixture | undefined = r.ties.find((x) => x.homeId === id || x.awayId === id);
    if (tie && tie.played && tie.winnerId !== id) return false;
    if (tie && !tie.played) return true;
  }
  return g.cup.championId === id;
}

export type { SeasonSummary };

/** Warm the JIT so the very first matchweek is as fast as the rest. Pure: mutates nothing. */
export function warmUpEngine(g: GameState): void {
  const ids = Object.keys(g.clubs).slice(0, 2);
  if (ids.length < 2) return;
  const rng = createRng(12345);
  const a = buildSheet(g, g.clubs[ids[0]], false, 0);
  const b = buildSheet(g, g.clubs[ids[1]], false, 0);
  for (let i = 0; i < 25; i++) simulateMatch(a, b, { competition: 'LEAGUE', isKnockout: false, isDerby: false, neutralVenue: false, mode: 'AUTO_SIM' }, rng);
}
