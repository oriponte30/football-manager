import { describe, it, expect } from 'vitest';
import { generateWorld } from '../worldGenerator';
import { advanceMatchweek, acceptJob, startNextSeason, SEASON_WEEKS } from '../seasonLoop';
import { sortedTable } from '../shadowLeagueEngine';
import { squadStrength } from '../lineup';

describe('season loop', () => {
  it('plays a full 30-matchweek season, rolls over cleanly into season 2', () => {
    const g = generateWorld('Tester', 'ITA', 2024);
    expect(g.jobOffers).toHaveLength(3);
    const tiny = g.jobOffers.find((o) => g.clubs[o.clubId].archetype === 'TINY_UNDERDOG') ?? g.jobOffers[0];
    acceptJob(g, tiny.id);
    expect(g.status).toBe('PLAYING');
    // autopilot manager: keep the board calm so the loop always reaches season end
    const mine = g.clubs[tiny.clubId];
    mine.board.value = 100;
    mine.board.patience = 0.05;
    const times: number[] = [];
    for (let w = 0; w < SEASON_WEEKS; w++) {
      advanceMatchweek(g);
      times.push(g.lastSimMs);
      if (g.status === 'SACKED') break;
    }
    expect(g.season.matchweek).toBeGreaterThan(SEASON_WEEKS);
    expect(g.seasonSummary).not.toBeNull();
    // every active league played 30 rounds; cup & Europe crowned
    for (const lg of Object.values(g.leagues)) {
      const rows = sortedTable(lg.table);
      expect(rows.every((r) => r.p === 30)).toBe(true);
    }
    expect(g.cup.championId).not.toBeNull();
    expect(g.euro.championId).not.toBeNull();
    // the strongest Tier 1 side never finishes last
    const t1 = g.leagues['ITA-1'];
    const strongest = [...t1.clubIds].sort((a, b) => squadStrength(g, g.clubs[b]) - squadStrength(g, g.clubs[a]))[0];
    const final = sortedTable(t1.table);
    expect(final[final.length - 1].clubId).not.toBe(strongest);
    // median matchweek sim comfortably under 30ms
    const sorted = [...times].sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length / 2)]).toBeLessThan(30);

    if (g.status === 'SACKED') {
      expect(g.jobOffers.length).toBeGreaterThanOrEqual(1);
      acceptJob(g, g.jobOffers[0].id);
    }
    const year = g.season.year;
    startNextSeason(g);
    expect(g.season.year).toBe(year + 1);
    expect(g.season.matchweek).toBe(1);
    expect(g.status).toBe('PLAYING');
    for (const id of ['ITA-1', 'ITA-2', 'ITA-3']) expect(g.leagues[id].clubIds).toHaveLength(16);
    expect(g.euro.groups.flatMap((x) => x.clubIds)).toHaveLength(16);
    advanceMatchweek(g);
    expect(g.season.matchweek).toBe(2);
  }, 60_000);
});
