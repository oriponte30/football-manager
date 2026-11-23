import { describe, it, expect } from 'vitest';
import { simulateMatch } from '../matchEngine';
import { makeTeam } from './helpers';
import { createRng } from '../rng';
import type { KeyMomentEvent } from '../../types/match';

const ctx = { competition: 'LEAGUE' as const, isKnockout: false, isDerby: false, neutralVenue: false, mode: 'AUTO_SIM' as const };

describe('match engine', () => {
  it('85 OVR team beats 55 OVR team >80% of the time, with occasional upsets', () => {
    const rng = createRng(12345);
    let strongWins = 0;
    let notWins = 0;
    for (let i = 0; i < 100; i++) {
      const strong = makeTeam('STRONG', 85, 100 + i);
      const weak = makeTeam('WEAK', 55, 500 + i);
      const strongHome = i % 2 === 0;
      const r = strongHome ? simulateMatch(strong, weak, ctx, rng) : simulateMatch(weak, strong, ctx, rng);
      const sg = strongHome ? r.homeGoals : r.awayGoals;
      const wg = strongHome ? r.awayGoals : r.homeGoals;
      if (sg > wg) strongWins++;
      else notWins++;
    }
    expect(strongWins).toBeGreaterThan(80);
    expect(notWins).toBeGreaterThanOrEqual(1);
  });

  it('a closer gap (62 vs 75) still produces upsets in a knockout tie', () => {
    const rng = createRng(777);
    let underdog = 0;
    for (let i = 0; i < 300; i++) {
      const fav = makeTeam('FAV', 75, 2000 + i);
      const dog = makeTeam('DOG', 62, 3000 + i);
      const r = simulateMatch(dog, fav, { ...ctx, isKnockout: true, competition: 'CUP' }, rng);
      const dogWon = r.homeGoals > r.awayGoals || (r.penalties !== null && r.penalties.home > r.penalties.away);
      if (dogWon) underdog++;
    }
    expect(underdog).toBeGreaterThan(9);
    expect(underdog).toBeLessThan(120);
  });

  it('xG, xA, xGC and possession sum accurately', () => {
    const rng = createRng(99);
    for (let i = 0; i < 50; i++) {
      const r = simulateMatch(makeTeam('H', 60 + (i % 20), i), makeTeam('A', 65, 900 + i), ctx, rng);
      expect(r.home.possessionPct + r.away.possessionPct).toBe(100);
      expect(r.home.possessions + r.away.possessions).toBe(r.totalPossessions);
      expect(r.home.xgc).toBeCloseTo(r.away.xg, 5);
      expect(r.away.xgc).toBeCloseTo(r.home.xg, 5);
      let hxg = 0, axg = 0, hxa = 0, axa = 0, hg = 0, ag = 0, hShots = 0;
      for (const ps of Object.values(r.players)) {
        if (ps.clubId === 'H') { hxg += ps.xg; hxa += ps.xa; hg += ps.goals; hShots += ps.shots; }
        else { axg += ps.xg; axa += ps.xa; ag += ps.goals; }
      }
      expect(hxg).toBeCloseTo(r.home.xg, 1);
      expect(axg).toBeCloseTo(r.away.xg, 1);
      expect(hxa).toBeCloseTo(r.home.xa, 1);
      expect(axa).toBeCloseTo(r.away.xa, 1);
      expect(r.home.xa).toBeLessThanOrEqual(r.home.xg + 1e-9);
      expect(hg).toBe(r.homeGoals);
      expect(ag).toBe(r.awayGoals);
      expect(hShots).toBe(r.home.shots);
      expect(r.home.shotsOnTarget).toBeGreaterThanOrEqual(r.homeGoals);
      expect(r.home.shots).toBeGreaterThanOrEqual(r.home.shotsOnTarget);
    }
  });

  it('KEY_MOMENTS_HOOK hands highlights to the resolver and respects outcomes', () => {
    const rng = createRng(4242);
    const seen: KeyMomentEvent[] = [];
    const r = simulateMatch(makeTeam('H', 70, 1), makeTeam('A', 70, 2), {
      ...ctx,
      mode: 'KEY_MOMENTS_HOOK',
      onKeyMoment: (m) => { seen.push(m); return 'GOAL'; },
    }, rng);
    expect(seen.length).toBeLessThanOrEqual(5);
    expect(r.keyMoments.length).toBe(seen.length);
    const keyGoals = r.events.filter((e) => e.keyMoment && e.type === 'GOAL').length;
    expect(keyGoals).toBe(seen.length);
  });

  it('simulates a full matchweek of 30 matches well under 30ms', () => {
    const rng = createRng(1);
    const teams = Array.from({ length: 60 }, (_, i) => makeTeam(`T${i}`, 55 + (i % 30), i));
    // warm the JIT once (the game does this during world generation), then take the best of 3 runs
    const run = () => {
      const t0 = performance.now();
      for (let i = 0; i < 30; i++) simulateMatch(teams[i * 2], teams[i * 2 + 1], ctx, rng);
      return performance.now() - t0;
    };
    run();
    const ms = Math.min(run(), run(), run());
    expect(ms).toBeLessThan(30);
  });
});
