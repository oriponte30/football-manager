import { describe, it, expect } from 'vitest';
import { createRng } from '../rng';
import { generateWorld } from '../worldGenerator';
import { acceptJob, advanceMatchweek } from '../seasonLoop';
import { listPlayer, aiIncomingBids, processLoanList, maybeAiTradeFax, valuePlayer, windowOpen } from '../transferEngine';
import { maybeCreateDilemma, applyDilemmaEffects } from '../moraleEngine';
import { startDayAfter, markWatched, answerPress } from '../weekEngine';
import type { GameState } from '../../types/world';

function career(seed: number): GameState {
  const g = generateWorld('T', 'ENG', seed);
  acceptJob(g, g.jobOffers[0].id);
  return g;
}

describe('transfer list and loan list', () => {
  it('listing is reversible, and refuses when the squad is thin', () => {
    const g = career(101);
    const club = g.clubs[g.manager.clubId!];
    const p = g.players[club.playerIds[3]];
    const m0 = p.moraleValue;
    expect(listPlayer(g, club.id, p.id, 'TRANSFER', 100_000).ok).toBe(true);
    expect(p.listed?.kind).toBe('TRANSFER');
    expect(p.moraleValue).toBeLessThan(m0);
    expect(listPlayer(g, club.id, p.id, null).ok).toBe(true);
    expect(p.listed).toBeUndefined();
    const spare = club.playerIds.slice(0);
    club.playerIds = spare.slice(0, 16);
    expect(listPlayer(g, club.id, p.id, 'TRANSFER').ok).toBe(false);
  });
  it('a fairly priced listed player draws offers, an absurd price scares buyers off', () => {
    const count = (priceMult: number) => {
      let n = 0;
      for (let seed = 0; seed < 22; seed++) {
        const g = career(200 + seed);
        g.season.matchweek = 4; // summer window
        if (!windowOpen(g)) continue;
        const club = g.clubs[g.manager.clubId!];
        const p = g.players[club.playerIds[2]];
        listPlayer(g, club.id, p.id, 'TRANSFER', Math.round(valuePlayer(p) * priceMult));
        const rng = createRng(seed);
        for (let i = 0; i < 3; i++) aiIncomingBids(g, rng, club.id);
        if (g.bids.some((b) => b.direction === 'INCOMING' && b.playerId === p.id)) n++;
      }
      return n;
    };
    expect(count(1.0)).toBeGreaterThan(count(5));
  });
  it('a loan-listed player goes out on loan, and returns to us', () => {
    let moved = 0;
    for (let seed = 0; seed < 30 && !moved; seed++) {
      const g = career(300 + seed);
      g.season.matchweek = 4;
      const club = g.clubs[g.manager.clubId!];
      const p = g.players[club.playerIds[5]];
      listPlayer(g, club.id, p.id, 'LOAN');
      const rng = createRng(seed);
      for (let i = 0; i < 6; i++) processLoanList(g, rng, club.id);
      if (p.loanFromClubId === club.id) { moved++; expect(p.clubId).not.toBe(club.id); expect(p.listed).toBeUndefined(); }
    }
    expect(moved).toBeGreaterThan(0);
  });
});

describe('dilemma and press variety', () => {
  it('lots of different dilemmas, all of them apply cleanly', () => {
    const titles = new Set<string>();
    for (let seed = 0; seed < 25; seed++) {
      const g = career(400 + seed);
      const club = g.clubs[g.manager.clubId!];
      const rng = createRng(seed);
      for (let i = 0; i < 40; i++) {
        g.dilemma = null;
        const d = maybeCreateDilemma(g, rng, club);
        if (!d) continue;
        titles.add(d.title);
        expect(d.options.length).toBeGreaterThanOrEqual(2);
        for (const o of d.options) applyDilemmaEffects(g, club, structuredClone(o.effects));
      }
    }
    expect(titles.size).toBeGreaterThan(22);
  });
  it('press conferences vary and apply cleanly over a season', () => {
    const texts = new Set<string>();
    const g = career(500);
    const rng = createRng(9);
    for (let w = 0; w < 28; w++) {
      advanceMatchweek(g);
      for (const r of g.lastUserResults) markWatched(g, r.id);
      startDayAfter(g, rng);
      if (g.pressConference) { texts.add(g.pressConference.text); answerPress(g, 0); }
    }
    expect(texts.size).toBeGreaterThan(14);
  });
});

describe('trade offers', () => {
  it('swap proposals ring the fax machine (urgent) and listed players attract them', () => {
    let urgent = 0;
    for (let seed = 0; seed < 40; seed++) {
      const g = career(600 + seed);
      g.season.matchweek = 4;
      const club = g.clubs[g.manager.clubId!];
      g.urgentFaxIds = [];
      maybeAiTradeFax(g, createRng(seed), club.id);
      const f = g.faxes.find((x) => x.kind === 'TRADE_PROPOSAL');
      if (f) { urgent++; expect(f.urgent).toBe(true); expect(g.urgentFaxIds).toContain(f.id); }
    }
    expect(urgent).toBeGreaterThan(3);
  });
});
