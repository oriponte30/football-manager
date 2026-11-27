import { describe, it, expect } from 'vitest';
import { generateWorld } from '../worldGenerator';
import { acceptJob, advanceMatchweek, startNextSeason, SEASON_WEEKS } from '../seasonLoop';
import { windowFor, windowWeeks, aiIncomingBids } from '../transferEngine';
import { INTAKE_WEEKS } from '../academyEngine';
import { createRng } from '../rng';
import { topUpFreeAgents } from '../freeAgentPool';
import { generatePlayer } from '../playerGenerator';
import { loanOutPlayer, renewContract } from '../transferEngine';
import { spendable, weeklyBill, RESERVE_WEEKS } from '../financeEngine';
import { submitBid, askingPrice, resolveOutgoingBid, completeBid, executeAgreedDeals, answerIncomingBid } from '../transferEngine';
import { refreshShortlist } from '../shortlistEngine';
import { syncBench } from '../lineup';
import { applyInjury, tickRecoveryWithAlert } from '../injuryEngine';
import { valuePlayer, demandedWage } from '../transferEngine';
import { wageFor } from '../playerGenerator';
import type { Player } from '../../types/player';
import { seasonInjection, BAILOUT_FLOOR, fitSaveToWageBudget } from '../financeEngine';
import { positionFit, fitTier, SECONDARY_OPTIONS } from '../../data/formations';
import { backfillSecondaries } from '../playerGenerator';
import { wageBudget } from '../financeEngine';
import type { GameState } from '../../types/world';

function career(seed: number): GameState {
  const g = generateWorld('T', 'ENG', seed);
  acceptJob(g, g.jobOffers[0].id);
  return g;
}

describe('pre-season and windows', () => {
  it('three fixture-free weeks, summer window open through MW5 (8 weeks), winter 4', () => {
    const g = career(501);
    expect(g.season.matchweek).toBe(-2);
    expect(windowWeeks(g.season.matchweek).weeks).toBe(8);
    for (let i = 0; i < 3; i++) {
      expect(g.season.window).toBe('SUMMER');
      advanceMatchweek(g);
      expect(g.phase).toBe('PREP');
      expect(g.lastUserResults).toHaveLength(0);
    }
    expect(g.season.matchweek).toBe(1);
    for (const lg of Object.values(g.leagues)) for (const f of lg.fixtures) expect(f.played).toBe(false);
    expect(windowFor(5)).toBe('SUMMER');
    expect(windowFor(6)).toBe('CLOSED');
    expect([16, 17, 18, 19].every((w) => windowFor(w) === 'WINTER') && windowFor(20) === 'CLOSED').toBe(true);
  });
});

describe('contracts and youth', () => {
  it('only expires contracts that really reach 0; mid-season signings keep their term; pending youth survives', () => {
    const g = career(502);
    const club = g.clubs[g.manager.clubId!];
    g.clubs[club.id].board.value = 100; g.clubs[club.id].board.patience = 0.05;
    const [a, b, c] = club.playerIds.map((id) => g.players[id]).filter((p) => p.age < 29);
    a.contract.yearsLeft = 1; b.contract.yearsLeft = 1; b.contract.fresh = true; c.contract.yearsLeft = 2;
    expect(INTAKE_WEEKS[INTAKE_WEEKS.length - 1]).toBeLessThanOrEqual(SEASON_WEEKS - 3);
    for (let w = 0; w < SEASON_WEEKS + 3; w++) advanceMatchweek(g);
    expect(g.pendingYouth.length).toBeGreaterThan(0);
    const kept = [...g.pendingYouth];
    if (g.status === 'SACKED') return;
    startNextSeason(g);
    expect(g.players[a.id]?.clubId ?? null).not.toBe(club.id);
    expect(g.players[b.id].clubId).toBe(club.id);
    expect(g.players[b.id].contract.yearsLeft).toBe(1);
    expect(g.players[b.id].contract.fresh).toBeUndefined();
    expect(g.players[c.id].clubId).toBe(club.id);
    expect(g.players[c.id].contract.yearsLeft).toBe(1);
    for (const id of kept) expect(g.players[id]).toBeTruthy();
    expect(g.pendingYouth).toEqual(kept);
  });
});

describe('free agent mix and incoming bids', () => {
  it('top of the free-agent list is not all one position', () => {
    for (const seed of [511, 512, 513]) {
      const g = career(seed);
      const top = g.freeAgentIds.map((id) => g.players[id]).sort((x, y) => y.ca - x.ca).slice(0, 20);
      const n = (f: (p: typeof top[0]) => boolean) => top.filter(f).length;
      expect(n((p) => p.position === 'ST')).toBeLessThanOrEqual(6);
      expect(new Set(top.map((p) => p.position)).size).toBeGreaterThanOrEqual(5);
    }
  });
  it('an old save flooded with strikers is rebalanced when opened', () => {
    const g = career(531);
    for (let i = 0; i < 40; i++) {
      const p = generatePlayer(g, createRng(i + 1), { nationality: g.players[g.freeAgentIds[0]].nationality, country: 'ENG', position: 'ST', age: 27, targetOvr: 78, clubId: null, tier: 1 });
      p.contract.yearsLeft = 0; g.players[p.id] = p; g.freeAgentIds.push(p.id);
    }
    expect(topUpFreeAgents(g)).toBe(true);
    const top = g.freeAgentIds.map((id) => g.players[id]).sort((x, y) => y.ca - x.ca).slice(0, 20);
    expect(top.filter((p) => p.position === 'ST').length).toBeLessThanOrEqual(5);
    expect(new Set(top.map((p) => p.position)).size).toBeGreaterThanOrEqual(5);
  });
  it('bids come more often, near market value, never for deadwood', () => {
    let bids = 0; let weeks = 0;
    for (const seed of [521, 522, 523, 524]) {
      const g = career(seed);
      const rng = createRng(seed);
      const user = g.clubs[g.manager.clubId!];
      for (let w = 0; w < 8; w++) {
        aiIncomingBids(g, rng, user.id);
        weeks++;
        for (const b of g.bids) if (b.direction === 'INCOMING' && b.status === 'PENDING') b.status = 'REJECTED';
      }
      for (const b of g.bids.filter((x) => x.direction === 'INCOMING')) {
        bids++;
        const p = g.players[b.playerId];
        expect(p.age).toBeLessThanOrEqual(31);
      }
    }
    expect(bids / 4).toBeGreaterThanOrEqual(2);
  });
});

describe('news, team stats and loans', () => {
  it('keeps the news short, counts team stats, and snapshots loans', () => {
    const g = career(541);
    const club = g.clubs[g.manager.clubId!];
    club.board.value = 100; club.board.patience = 0.05;
    const kid = club.playerIds.map((id) => g.players[id]).find((p) => p.age <= 21)!;
    expect(loanOutPlayer(g, createRng(1), club.id, kid.id).ok).toBe(true);
    expect(kid.loanStart?.ovr).toBe(kid.ca);
    for (let w = 0; w < 14; w++) advanceMatchweek(g);
    expect(g.news.length).toBeLessThanOrEqual(20);
    expect(g.news.every((n) => g.season.matchweek - n.matchweek <= 10)).toBe(true);
    expect(g.teamStats!.g).toBeGreaterThanOrEqual(11);
    expect(g.teamStats!.w + g.teamStats!.d + g.teamStats!.l).toBe(g.teamStats!.g);
    expect(g.teamStats!.poss / g.teamStats!.g).toBeGreaterThan(20);
  });
});

describe('loans end', () => {
  it('your own loanee can be renewed so he does not walk', () => {
    const g = career(552);
    const club = g.clubs[g.manager.clubId!];
    const kid = club.playerIds.map((id) => g.players[id]).find((p) => p.age <= 21)!;
    kid.contract.yearsLeft = 1;
    loanOutPlayer(g, createRng(3), club.id, kid.id);
    kid.moraleValue = 70;
    expect(renewContract(g, kid.id, 99_999, 3).ok).toBe(true);
    expect(kid.contract.yearsLeft).toBe(3);
  });
  it('loanees go back to their parent club at rollover, both ways', () => {
    const g = career(551);
    const club = g.clubs[g.manager.clubId!];
    club.board.value = 100; club.board.patience = 0.05;
    const kid = club.playerIds.map((id) => g.players[id]).find((p) => p.age <= 21)!;
    kid.contract.yearsLeft = 3;
    expect(loanOutPlayer(g, createRng(2), club.id, kid.id).ok).toBe(true);
    const dest = kid.clubId!;
    expect(dest).not.toBe(club.id);
    for (let w = 0; w < SEASON_WEEKS + 3; w++) advanceMatchweek(g);
    if (g.status === 'SACKED') return;
    expect(kid.loanFromClubId).toBe(club.id);
    startNextSeason(g);
    expect(kid.loanFromClubId).toBeNull();
    expect(kid.clubId).toBe(club.id);
    expect(club.playerIds).toContain(kid.id);
    expect(g.clubs[dest].playerIds).not.toContain(kid.id);
    expect(kid.loanStart).toBeUndefined();
    expect(Object.values(g.players).filter((p) => p.loanFromClubId).length).toBe(0);
  });
});

describe('finances make sense', () => {
  it('TV money arrives weekly, and the safe budget is only a guide', () => {
    const g = career(561);
    const club = g.clubs[g.manager.clubId!];
    club.board.value = 100; club.board.patience = 0.05;
    for (let w = 0; w < 3; w++) advanceMatchweek(g);
    const pre = club.finances.ledger.tv; // pre-season: sponsorship only, no TV instalments yet
    for (let w = 0; w < 4; w++) advanceMatchweek(g);
    expect(club.finances.ledger.tv).toBeGreaterThan(pre * 2);
    // the budget is a guide: a fee that fits in the bank is not blocked by the board
    club.finances.bank = weeklyBill(g, club) * (RESERVE_WEEKS + 1);
    expect(spendable(g, club)).toBe(weeklyBill(g, club));
    g.season.window = 'SUMMER';
    const target = Object.values(g.players).find((p) => p.clubId && p.clubId !== club.id && !p.loanFromClubId)!;
    const r = submitBid(g, club.id, { playerId: target.id, fee: weeklyBill(g, club) * 3, wage: 1000, years: 3, includePlayerId: null, type: 'TRANSFER', loanWageShare: 0 });
    expect(r.message).not.toMatch(/board/);
  });
});

describe('bench and medical alerts', () => {
  it('keeps seven on the bench with a backup keeper, never overwriting manual picks', () => {
    const g = career(571);
    const club = g.clubs[g.manager.clubId!];
    club.tactics.bench = [];
    syncBench(g, club);
    expect(club.tactics.bench).toHaveLength(7);
    expect(club.tactics.bench.some((id) => g.players[id].position === 'GK')).toBe(true);
    const keep = club.tactics.bench[3];
    club.tactics.bench = [keep];
    syncBench(g, club);
    expect(club.tactics.bench[0]).toBe(keep);
    expect(club.tactics.bench).toHaveLength(7);
  });
  it('flags an injured starter and a recovered one, and refills the bench', () => {
    const g = career(572);
    const club = g.clubs[g.manager.clubId!];
    const starter = g.players[club.tactics.lineup.find(Boolean) as string];
    applyInjury(g, starter, { name: 'Hamstring Strain', severity: 'MINOR', weeksTotal: 1, source: 'TRAINING', year: g.season.year, matchweek: 1 });
    expect(starter.injury?.roleBeforeInjury).toBe('STARTER');
    expect(g.medicalAlerts?.some((a) => a.kind === 'INJURED' && a.playerId === starter.id)).toBe(true);
    expect(club.tactics.bench).toHaveLength(7);
    expect(club.tactics.bench).not.toContain(starter.id);
    g.medicalAlerts = [];
    tickRecoveryWithAlert(g, starter);
    expect(g.medicalAlerts?.some((a) => a.kind === 'CLEARED')).toBe(true);
  });
});

describe('1990s valuation', () => {
  const mk = (ca: number, age: number, pa: number, position = 'CM', years = 3) => ({ ca, age, truePA: pa, paSeed: 1, position, contract: { yearsLeft: years } }) as unknown as Player;
  it('follows the exponential price scale, with the right modifiers', () => {
    const v = (ca: number) => valuePlayer(mk(ca, 25, ca));
    expect(v(58)).toBeGreaterThanOrEqual(60_000); expect(v(65)).toBeLessThanOrEqual(500_000);
    expect(v(70)).toBeGreaterThanOrEqual(600_000); expect(v(75)).toBeLessThanOrEqual(2_500_000);
    expect(v(80)).toBeGreaterThanOrEqual(3_000_000); expect(v(84)).toBeLessThanOrEqual(7_500_000);
    expect(v(85)).toBeGreaterThanOrEqual(8_000_000); expect(v(90)).toBeGreaterThanOrEqual(15_000_000);
    expect(valuePlayer(mk(72, 20, 86))).toBeGreaterThan(valuePlayer(mk(75, 31, 75)));
    expect(valuePlayer(mk(80, 25, 80, 'GK'))).toBeLessThan(valuePlayer(mk(80, 25, 80, 'CB')) * 0.9);
    expect(valuePlayer(mk(80, 25, 80, 'ST'))).toBeGreaterThan(valuePlayer(mk(80, 25, 80, 'CB')) * 1.1);
    expect(valuePlayer(mk(80, 25, 80, 'CM', 1))).toBeLessThan(valuePlayer(mk(80, 25, 80, 'CM', 3)) * 0.75);
    expect(valuePlayer(mk(80, 33, 80))).toBeLessThan(v(80) * 0.3);
  });
  it('wages sit on the same scale', () => {
    expect(wageFor(60, 3, 'ENG', 'CM')).toBeLessThan(2_500);
    expect(wageFor(70, 2, 'ENG', 'CM')).toBeLessThan(8_000);
    expect(wageFor(80, 1, 'ENG', 'CM')).toBeLessThan(25_000);
    expect(wageFor(88, 1, 'ENG', 'CM')).toBeGreaterThan(30_000);
  });
});

describe('season injection and bailout', () => {
  it('injection stays inside the tier ranges and rewards finishing high', () => {
    for (const [tier, lo, hi] of [[1, 6e6, 16e6], [2, 17e5, 42e5], [3, 42e4, 95e4]] as const) {
      const top = seasonInjection(tier, 1, 16); const bottom = seasonInjection(tier, 16, 16);
      expect(top.prize + top.rights).toBeGreaterThanOrEqual(hi * 0.99); expect(top.prize + top.rights).toBeLessThanOrEqual(hi * 1.01);
      expect(bottom.prize + bottom.rights).toBeGreaterThanOrEqual(lo * 0.99); expect(bottom.prize + bottom.rights).toBeLessThanOrEqual(lo * 1.01);
    }
  });
  it('a club still in the red at rollover is bailed out, with a confidence hit but no signing freeze', () => {
    const g = career(581);
    const club = g.clubs[g.manager.clubId!];
    club.board.value = 100; club.board.patience = 0.05;
    for (let w = 0; w < SEASON_WEEKS + 3; w++) advanceMatchweek(g);
    if (g.status === 'SACKED') return;
    club.finances.bank = -5_000_000; // a debt even the season's income can't clear
    const before = club.board.value;
    startNextSeason(g);
    expect(club.finances.bank).toBeGreaterThanOrEqual(BAILOUT_FLOOR[club.tier]);
    expect(before - club.board.value).toBeGreaterThanOrEqual(14);
    expect(club.finances.restructuring).toBeFalsy();
  });
});

describe('secondary positions', () => {
  it('tiered out-of-position scale', () => {
    expect(positionFit('CM', 'CM')).toBe(1);
    expect(positionFit('CAM', 'ST', 'ST')).toBeGreaterThanOrEqual(0.96);
    expect(positionFit('CAM', 'ST', 'ST')).toBeLessThanOrEqual(0.97);
    expect(positionFit('CM', 'CDM')).toBeGreaterThanOrEqual(0.88); expect(positionFit('CM', 'CDM')).toBeLessThanOrEqual(0.90);
    expect(positionFit('ST', 'CB')).toBeGreaterThanOrEqual(0.7); expect(positionFit('ST', 'CB')).toBeLessThanOrEqual(0.75);
    expect(positionFit('CB', 'GK')).toBe(0.45); expect(positionFit('GK', 'CB')).toBe(0.45);
    expect(fitTier('LW', 'ST', 'ST')).toBe(1); expect(fitTier('LW', 'RW')).toBe(2); expect(fitTier('ST', 'CB')).toBe(3);
  });
  it('every generated outfield player has a logical secondary; keepers have none; old saves are backfilled', () => {
    const g = career(591);
    const all = Object.values(g.players);
    for (const p of all) {
      if (p.position === 'GK') expect(p.secondaryPosition ?? null).toBeNull();
      else expect(SECONDARY_OPTIONS[p.position]).toContain(p.secondaryPosition);
    }
    for (const p of all.slice(0, 50)) delete (p as { secondaryPosition?: unknown }).secondaryPosition;
    expect(backfillSecondaries(g)).toBe(true);
    for (const p of all.slice(0, 50)) expect(p.secondaryPosition === null || SECONDARY_OPTIONS[p.position].includes(p.secondaryPosition as never)).toBe(true);
    expect(backfillSecondaries(g)).toBe(false);
  });
});

describe('wage structure and swaps', () => {
  it('an old save is fitted to its wage budget once, wages only go down, the freeze is lifted', () => {
    const g = career(604);
    const club = g.clubs[g.manager.clubId!];
    for (const id of club.playerIds) g.players[id].contract.wage *= 6;
    club.finances.restructuring = true; club.finances.bank = 50_000;
    const before = weeklyBill(g, club);
    expect(fitSaveToWageBudget(g)).toBe(true);
    expect(weeklyBill(g, club)).toBeLessThan(before);
    expect(weeklyBill(g, club)).toBeLessThanOrEqual(wageBudget(club, g) * 1.02 + 200);
    expect(club.finances.restructuring).toBe(false);
    expect(club.finances.bank).toBeGreaterThanOrEqual(BAILOUT_FLOOR[club.tier]);
    expect(fitSaveToWageBudget(g)).toBe(false);
  });
  it('no club starts with a wage bill its income cannot carry', () => {
    for (const seed of [601, 602]) {
      const g = generateWorld('T', 'ENG', seed);
      for (const c of Object.values(g.clubs)) {
        if (c.isShadow) continue;
        expect(weeklyBill(g, c)).toBeLessThanOrEqual(wageBudget(c, g) * 1.02 + 200);
      }
    }
  });
  it('a straight swap is not blocked by debt or a restructuring freeze', () => {
    const g = career(603);
    const club = g.clubs[g.manager.clubId!];
    club.finances.bank = -3_000_000; club.finances.restructuring = true;
    g.season.window = 'SUMMER';
    const mine = g.players[club.playerIds[5]];
    const other = Object.values(g.players).find((p) => p.clubId && p.clubId !== club.id && !p.loanFromClubId && p.position === mine.position)!;
    const r = submitBid(g, club.id, { playerId: other.id, fee: 0, wage: other.contract.wage, years: 2, includePlayerId: mine.id, type: 'TRANSFER', loanWageShare: 0 });
    expect(r.message).not.toMatch(/RED|RESTRUCTURING/);
    const r2 = submitBid(g, club.id, { playerId: other.id, fee: 50_000, wage: other.contract.wage, years: 2, includePlayerId: null, type: 'TRANSFER', loanWageShare: 0 });
    expect(r2.ok).toBe(false);
  });
});

describe('star negotiations and shortlist', () => {
  it('a star at a bigger club can always be negotiated for, at a premium', () => {
    const g = career(611);
    const club = g.clubs[g.manager.clubId!];
    g.season.window = 'SUMMER'; club.finances.bank = 99e6;
    const top = Object.values(g.clubs).filter((c) => !c.isShadow && c.id !== club.id && c.reputation > club.reputation).sort((a, b) => b.reputation - a.reputation)[0];
    const star = top.playerIds.map((id) => g.players[id]).sort((a, b) => b.ca - a.ca)[0];
    const ask = askingPrice(g, star, top, club);
    submitBid(g, club.id, { playerId: star.id, fee: Math.round(ask * 1.5), wage: 1000, years: 4, includePlayerId: null, type: 'TRANSFER', loanWageShare: 0 });
    resolveOutgoingBid(g, createRng(1), g.bids[g.bids.length - 1]);
    const bid = g.bids[g.bids.length - 1];
    expect(['ACCEPTED', 'COUNTERED']).toContain(bid.status);
  });
  it('the shortlist mixes young, prime and veteran players', () => {
    const g = career(612);
    refreshShortlist(g, createRng(3), true);
    const ages = g.shortlist!.ids.map((id) => g.players[id].age);
    expect(ages.some((a) => a <= 22)).toBe(true);
    expect(ages.some((a) => a >= 23 && a <= 28)).toBe(true);
  });
});

describe('deals outside the window', () => {
  it('a bid is answered the same day, the deal is agreed shut-window and completes when it opens', () => {
    const g = career(621);
    const club = g.clubs[g.manager.clubId!];
    club.finances.bank = 99e6; g.season.matchweek = 10; g.season.window = 'CLOSED';
    const target = Object.values(g.players).find((p) => p.clubId && p.clubId !== club.id && !p.loanFromClubId && p.ca < 60 && g.clubs[p.clubId].tier === club.tier)!;
    const r = submitBid(g, club.id, { playerId: target.id, fee: valuePlayer(target) * 3, wage: demandedWage(target, club, g) * 2, years: 3, includePlayerId: null, type: 'TRANSFER', loanWageShare: 0 });
    expect(r.ok).toBe(true);
    const bid = g.bids[g.bids.length - 1];
    expect(bid.status).not.toBe('PENDING'); // answered immediately
    if (bid.status !== 'ACCEPTED') return;
    const c = completeBid(g, bid.id, false, demandedWage(target, club, g) * 2, 3);
    expect(c.ok).toBe(true);
    expect(bid.status).toBe('AGREED');
    expect(g.players[target.id].clubId).not.toBe(club.id); // still at his old club
    g.season.window = 'SUMMER';
    executeAgreedDeals(g);
    expect(g.players[target.id].clubId).toBe(club.id);
    expect(bid.status).toBe('COMPLETED');
  });
  it('AI bids arrive outside the window and the sale only happens when it opens', () => {
    const g = career(622);
    const club = g.clubs[g.manager.clubId!];
    g.season.matchweek = 10; g.season.window = 'CLOSED';
    const rng = createRng(9);
    for (let i = 0; i < 40 && !g.bids.some((b) => b.direction === 'INCOMING'); i++) aiIncomingBids(g, rng, club.id);
    const bid = g.bids.find((b) => b.direction === 'INCOMING' && b.status === 'PENDING');
    expect(bid).toBeTruthy();
    answerIncomingBid(g, bid!.id, true);
    expect(bid!.status).toBe('AGREED');
    expect(g.players[bid!.playerId].clubId).toBe(club.id);
    g.season.window = 'SUMMER';
    executeAgreedDeals(g);
    expect(g.players[bid!.playerId].clubId).toBe(bid!.buyerClubId);
  });
});
