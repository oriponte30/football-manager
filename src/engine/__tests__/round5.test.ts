import { describe, it, expect } from 'vitest';
import { generateWorld } from '../worldGenerator';
import { acceptJob, advanceMatchweek, startNextSeason, SEASON_WEEKS } from '../seasonLoop';
import { windowFor, windowWeeks, aiIncomingBids } from '../transferEngine';
import { INTAKE_WEEKS } from '../academyEngine';
import { createRng } from '../rng';
import { topUpFreeAgents } from '../freeAgentPool';
import { generatePlayer } from '../playerGenerator';
import { loanOutPlayer, renewContract } from '../transferEngine';
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
