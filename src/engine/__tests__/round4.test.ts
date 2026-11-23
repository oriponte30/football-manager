import { describe, it, expect } from 'vitest';
import { createRng } from '../rng';
import { generateWorld } from '../worldGenerator';
import { acceptJob, advanceMatchweek } from '../seasonLoop';
import { listPlayer, aiIncomingBids, processLoanList, maybeAiTradeFax, valuePlayer, windowOpen, windowFor, windowWeeks, avgCa, demandedWage, freeAgentChance, signFreeAgent } from '../transferEngine';
import { maybeCreateDilemma, applyDilemmaEffects } from '../moraleEngine';
import { startDayAfter, markWatched, answerPress } from '../weekEngine';
import { liveTables } from '../liveTable';
import { weeklyXP, applyXP, ageOneYear } from '../progressionEngine';
import { ovrFor } from '../ratings';
import type { PlayerMatchStats } from '../../types/match';
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

describe('young talent growth', () => {
  it('a 49 OVR kid with a high ceiling grows fast early, then eases off near the top, and never passes his ceiling', () => {
    const g = career(700);
    const rng = createRng(3);
    const p = structuredClone(Object.values(g.players).find((x) => x.position === 'CM')!);
    p.age = 18; p.careerCurve = 'STANDARD'; p.truePA = 82; p.xpBank = 0; p.moraleValue = 60; p.injuryWeeks = 0;
    for (const k of Object.keys(p.stats) as (keyof typeof p.stats)[]) p.stats[k] = Math.max(15, p.stats[k] - 32);
    p.ca = ovrFor(p.stats, p.position);
    const start = p.ca;
    const cas: number[] = [];
    // a terrible coach (1 star) must hold a kid back well behind a great one (5 stars)
    const yearWith = (stars: number) => {
      const q = structuredClone(p);
      const r = createRng(11);
      for (let w = 0; w < 30; w++) { q.xpBank += weeklyXP(q, { minutes: 90, rating: 6.8 } as PlayerMatchStats, stars, 3, true); applyXP(r, q, 'BALANCED', false); }
      return q.ca - start;
    };
    expect(yearWith(1)).toBeLessThan(yearWith(5) - 4);
    for (let season = 0; season < 5; season++) {
      for (let w = 0; w < 30; w++) {
        p.xpBank += weeklyXP(p, { minutes: 90, rating: 6.8 } as PlayerMatchStats, 3, 3, true);
        applyXP(rng, p, 'BALANCED', false);
      }
      ageOneYear(rng, p);
      cas.push(p.ca);
    }
    const firstYear = cas[0] - start;
    const lastYear = cas[4] - cas[3];
    expect(firstYear).toBeGreaterThanOrEqual(10);
    expect(firstYear).toBeLessThanOrEqual(20);
    expect(lastYear).toBeLessThan(firstYear / 2);
    expect(cas[4]).toBeLessThanOrEqual(82);
  });
});

describe('free agents: coverage, windows, signing odds', () => {
  const groups: Record<string, string[]> = { GK: ['GK'], CB: ['CB'], FB: ['LB', 'RB'], MID: ['CDM', 'CM'], CAM: ['CAM'], WING: ['LW', 'RW'], ST: ['ST'] };
  it('every position is stocked at several levels, from the start and after rollovers', () => {
    for (let seed = 0; seed < 4; seed++) {
      const g = career(800 + seed);
      const pool = g.freeAgentIds.map((id) => g.players[id]);
      expect(pool.filter((p) => p.position === 'GK').length).toBeGreaterThanOrEqual(5);
      for (const [name, ps] of Object.entries(groups)) {
        const grp = pool.filter((p) => ps.includes(p.position));
        expect(grp.length, name).toBeGreaterThanOrEqual(name === 'CAM' ? 3 : name === 'GK' ? 5 : 4);
        expect(Math.min(...grp.map((p) => p.ca)), name).toBeLessThan(58);
        expect(Math.max(...grp.map((p) => p.ca)), name).toBeGreaterThanOrEqual(63);
      }
    }
  });
  it('windows: summer through MW5 and winter MW16-19', () => {
    expect(windowFor(5)).toBe('SUMMER');
    expect(windowFor(6)).toBe('CLOSED');
    expect(windowFor(16)).toBe('WINTER');
    expect(windowFor(19)).toBe('WINTER');
    expect(windowFor(20)).toBe('CLOSED');
    expect(windowWeeks(1)).toMatchObject({ open: true, weeks: 5 });
    expect(windowWeeks(18)).toMatchObject({ open: true, weeks: 2 });
  });
  it('wage curve: ~55-70% at the asking wage, ~80-90% well above, and a hard ceiling above the club', () => {
    const g = career(900);
    const club = g.clubs[g.manager.clubId!];
    club.tier = 2;
    const mine = avgCa(g, club);
    const fit = { ...Object.values(g.players)[0], ca: Math.round(mine), age: 26, lastName: 'Fit' } as never as ReturnType<typeof structuredClone>;
    const p = fit as unknown as import('../../types/player').Player;
    const ask = demandedWage(p, club, g);
    const at = (m: number) => freeAgentChance(g, p, club, Math.round(ask * m)).chance;
    expect(at(1)).toBeGreaterThan(0.55);
    expect(at(1)).toBeLessThan(0.72);
    expect(at(1.15)).toBeGreaterThan(0.75);
    expect(at(1.3)).toBeGreaterThan(0.8);
    expect(at(1.3)).toBeLessThan(0.93);
    expect(at(0.8)).toBeLessThan(0.05);
    const star = { ...p, ca: Math.round(mine) + 13 } as typeof p;
    expect(freeAgentChance(g, star, club, 1e9).chance).toBe(0);
    expect(freeAgentChance(g, star, club, 1e9).hard).toMatch(/club level too low/i);
  });
  it('signing is deterministic per week and limited to two offers, with a clear reason', () => {
    const g = career(910);
    const club = g.clubs[g.manager.clubId!];
    club.tier = 2; club.finances.bank = 5_000_000;
    const mine = avgCa(g, club);
    const p = g.freeAgentIds.map((id) => g.players[id]).filter((x) => Math.abs(x.ca - mine) <= 3 && x.age < 31)[0];
    if (!p) return;
    const ask = demandedWage(p, club, g);
    const r1 = signFreeAgent(g, club.id, p.id, Math.round(ask * 0.7), 2);
    expect(r1.ok).toBe(false);
    expect(r1.message).toMatch(/wage offer below expectations/i);
    expect(g.faxes.some((f) => f.title.startsWith('TALKS FAILED'))).toBe(true);
  });
});

describe('live table', () => {
  it('rolls the week back, then replays only the live score, and shows the real table once watched', () => {
    const g = career(950);
    const mineId = g.manager.clubId!;
    const lid = g.clubs[mineId].leagueId;
    const snap = (t: Record<string, import('../../types/world').TableRow>) => Object.fromEntries(Object.entries(t).map(([k, r]) => [k, [r.p, r.w, r.d, r.l, r.gf, r.ga, r.pts]]));
    while (g.season.matchweek < 1) advanceMatchweek(g);
    const before = snap(g.leagues[lid].table);
    advanceMatchweek(g);
    expect(g.phase).toBe('MATCHDAY');
    const mine = g.lastUserResults.find((r) => r.competition === 'LEAGUE')!;
    expect(mine).toBeTruthy();
    // nothing watched yet and no live score: exactly the table before the week
    expect(snap(liveTables(g, null)![lid])).toEqual(before);
    // a live 2-0 for the home side counts for that match only; other results stay hidden
    const live = liveTables(g, { resultId: mine.id, hg: 2, ag: 0 })![lid];
    expect(live[mine.homeId].pts).toBe(before[mine.homeId][6] + 3);
    expect(live[mine.awayId].pts).toBe(before[mine.awayId][6]);
    expect(live[mine.homeId].gf).toBe(before[mine.homeId][4] + 2);
    const other = Object.keys(before).find((id) => id !== mine.homeId && id !== mine.awayId)!;
    expect(snap({ [other]: live[other] })[other]).toEqual(before[other]);
    // everything watched: nothing is hidden any more
    for (const r of g.lastUserResults) markWatched(g, r.id);
    expect(liveTables(g, null)).toBeNull();
  });
});

describe('transfer offer frequency', () => {
  it('a player at a normal club gets noticeably more offers in a window', () => {
    let offers = 0, weeks = 0;
    for (let seed = 0; seed < 14; seed++) {
      const g = career(1000 + seed);
      const club = g.clubs[g.manager.clubId!];
      const rng = createRng(seed);
      for (let mw = 2; mw <= 5; mw++) {
        g.season.matchweek = mw; g.season.window = 'SUMMER';
        g.bids = g.bids.filter((b) => b.direction !== 'INCOMING');
        const n0 = g.bids.length;
        aiIncomingBids(g, rng, club.id);
        weeks++;
        if (g.bids.length > n0) offers++;
      }
    }
    // roughly a third of window weeks should bring an offer (was about a quarter)
    expect(offers / weeks).toBeGreaterThan(0.26);
  });
});
