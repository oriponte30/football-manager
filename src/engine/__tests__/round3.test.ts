import { describe, it, expect } from 'vitest';
import { createRng } from '../rng';
import { generateWorld } from '../worldGenerator';
import { advanceMatchweek, acceptJob } from '../seasonLoop';
import { changeFormation } from '../lineup';
import { afterMatchFamiliarity } from '../familiarityEngine';
import { staffInterest, staffCeiling, generateStaff } from '../staffGenerator';
import { counterIncomingBid } from '../transferEngine';
import { startDayAfter, beginPrep, runDrill, recoverySession, markWatched } from '../weekEngine';
import { refreshShortlist } from '../shortlistEngine';
import type { GameState } from '../../types/world';

function careerAt(seed: number, offer = 0): GameState {
  const g = generateWorld('T', 'ENG', seed);
  acceptJob(g, g.jobOffers[offer].id);
  return g;
}

describe('familiarity', () => {
  it('switching shape and back without playing costs nothing', () => {
    const g = careerAt(21);
    const club = g.clubs[g.manager.clubId!];
    const start = club.familiarity;
    const f0 = club.tactics.formation;
    changeFormation(club, f0 === '4-4-2' ? '4-3-3' : '4-4-2');
    changeFormation(club, f0);
    expect(club.familiarity).toBe(start);
  });
  it('one match in another shape only dents the old one', () => {
    const g = careerAt(22);
    const club = g.clubs[g.manager.clubId!];
    const f0 = club.tactics.formation;
    const before = club.familiarityByFormation[f0]!;
    changeFormation(club, f0 === '4-4-2' ? '4-3-3' : '4-4-2');
    afterMatchFamiliarity(club, 3);
    changeFormation(club, f0);
    expect(club.familiarity).toBeGreaterThan(before - 6);
    expect(club.familiarity).toBeLessThan(before);
  });
});

describe('staff market', () => {
  it('top coaches refuse small clubs, and hiring costs real money', () => {
    const g = careerAt(31);
    const club = g.clubs[g.manager.clubId!];
    const rng = createRng(5);
    const star = generateStaff(g, rng, 'HEAD_COACH', 50, 'ENG', null);
    expect(staffCeiling(club)).toBeLessThan(4.5);
    expect(staffInterest(g, club, star).kind).toBe('REFUSES');
    const decent = generateStaff(g, rng, 'HEAD_COACH', Math.max(10, Math.floor(staffCeiling(club) * 2) * 5), 'ENG', null);
    const it = staffInterest(g, club, decent);
    expect(it.kind).not.toBe('REFUSES');
    if (it.kind !== 'REFUSES') expect(it.fee).toBeGreaterThanOrEqual(it.wage * 16);
  });
});

describe('incoming bids', () => {
  it('the buyer accepts within its ceiling, walks when you get greedy', () => {
    const g = careerAt(41);
    const club = g.clubs[g.manager.clubId!];
    const pid = club.playerIds[0];
    const buyer = Object.values(g.clubs).find((c) => c.id !== club.id && c.tier === 1)!;
    let n = 0;
    const mk = (fee: number, walkAway: number) => {
      const b = { id: `tb${n++}`, type: 'TRANSFER' as const, direction: 'INCOMING' as const, playerId: pid, buyerClubId: buyer.id, sellerClubId: club.id, fee, wage: 1000, years: 3, includePlayerId: null, loanWageShare: 0, status: 'PENDING' as const, counterFee: null, resolveWeek: 99, season: g.season.year, note: '', walkAway, rounds: 0 };
      g.bids.push(b);
      return b;
    };
    const greedy = mk(100_000, 150_000);
    expect(counterIncomingBid(g, greedy.id, 400_000).ok).toBe(false);
    expect(greedy.status).toBe('REJECTED');
    const near = mk(100_000, 150_000);
    counterIncomingBid(g, near.id, 170_000);
    expect(near.status).toBe('PENDING');
    expect(near.fee).toBeGreaterThan(100_000);
    expect(near.fee).toBeLessThanOrEqual(150_000);
    const fair = mk(100_000, 150_000);
    counterIncomingBid(g, fair.id, 140_000);
    expect(fair.status).toBe('COMPLETED');
    expect(g.players[pid].clubId).toBe(buyer.id);
  });
});

describe('the manager\'s week', () => {
  it('matchday → day after → prep, one drill a week, one recovery a day', () => {
    const g = careerAt(51);
    advanceMatchweek(g);
    expect(g.lastUserResults.length).toBeGreaterThan(0);
    expect(g.phase).toBe('MATCHDAY');
    const rng = createRng(9);
    for (const r of g.lastUserResults) markWatched(g, r.id);
    startDayAfter(g, rng);
    expect(g.phase).toBe('DAY_AFTER');
    expect(recoverySession(g, rng, 'REST').ok || g.dayAfter.recovery === 'REST').toBe(true);
    expect(recoverySession(g, rng, 'INTENSE').ok).toBe(false);
    const club = g.clubs[g.manager.clubId!];
    const pid = club.playerIds.find((id) => g.players[id].position !== 'GK' && g.players[id].injuryWeeks === 0)!;
    runDrill(g, rng, pid, 'PASSING');
    expect(runDrill(g, rng, pid, 'PASSING').ok).toBe(false);
    beginPrep(g, rng);
    expect(g.phase).toBe('PREP');
  });
  it('the scout shortlist scales with the scout', () => {
    const g = careerAt(61);
    const club = g.clubs[g.manager.clubId!];
    const rng = createRng(3);
    const weak = generateStaff(g, rng, 'CHIEF_SCOUT', 10, 'ENG', club.id);
    club.staff.CHIEF_SCOUT = weak.id;
    refreshShortlist(g, rng, true);
    const n1 = g.shortlist.ids.length;
    const strong = generateStaff(g, rng, 'CHIEF_SCOUT', 50, 'ENG', club.id);
    club.staff.CHIEF_SCOUT = strong.id;
    club.finances.bank = 5_000_000;
    refreshShortlist(g, rng, true);
    expect(g.shortlist.ids.length).toBeGreaterThan(n1);
    expect(g.shortlist.ids).not.toContain(club.playerIds[0]);
  });
});
