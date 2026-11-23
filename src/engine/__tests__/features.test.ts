import { describe, it, expect } from 'vitest';
import { createRng } from '../rng';
import { rollInjury, physioRecoveryFactor, applyInjury } from '../injuryEngine';
import { NATIONALITIES, NATION_CODES, rollNationality } from '../../data/nationalities';
import { generateWorld } from '../worldGenerator';
import { advanceMatchweek, acceptJob } from '../seasonLoop';
import { addNews, NEWS_CAP } from '../newsEngine';

describe('injuries', () => {
  it('rolls the four severity tiers at roughly 55/30/12/3', () => {
    const rng = createRng(7);
    const n = 20000;
    const c: Record<string, number> = {};
    for (let i = 0; i < n; i++) { const r = rollInjury(rng, 1, 'MATCH', 1994, 1); c[r.severity] = (c[r.severity] ?? 0) + 1; }
    expect(c.MINOR / n).toBeGreaterThan(0.5); expect(c.MINOR / n).toBeLessThan(0.6);
    expect(c.MODERATE / n).toBeGreaterThan(0.26); expect(c.MODERATE / n).toBeLessThan(0.34);
    expect(c.SERIOUS / n).toBeGreaterThan(0.09); expect(c.SERIOUS / n).toBeLessThan(0.15);
    expect(c.SEVERE / n).toBeGreaterThan(0.015); expect(c.SEVERE / n).toBeLessThan(0.045);
  });
  it('a 5★ physio trims recovery by ~25%', () => {
    expect(physioRecoveryFactor(5)).toBeCloseTo(0.75);
    expect(physioRecoveryFactor(1)).toBe(1);
  });
  it('injured players are pulled out of the starting XI', () => {
    const g = generateWorld('T', 'ENG', 11);
    acceptJob(g, g.jobOffers[0].id);
    const club = g.clubs[g.manager.clubId!];
    const pid = club.tactics.lineup.find(Boolean)!;
    applyInjury(g, g.players[pid], rollInjury(createRng(1), 3, 'MATCH', 1994, 1));
    expect(club.tactics.lineup).not.toContain(pid);
    expect(g.players[pid].injuryWeeks).toBeGreaterThan(0);
  });
});

describe('nationalities & unique worlds', () => {
  it('has 25+ nations with their own name pools', () => {
    expect(NATION_CODES.length).toBeGreaterThanOrEqual(25);
    for (const c of NATION_CODES) {
      expect(NATIONALITIES[c].firstNames.length).toBeGreaterThan(10);
      expect(NATIONALITIES[c].lastNames.length).toBeGreaterThan(10);
    }
  });
  it('senior squads ~55–65% domestic, youth ~70%', () => {
    const rng = createRng(3);
    let s = 0, y = 0; const n = 10000;
    for (let i = 0; i < n; i++) { if (rollNationality(rng, 'ITA', 'SENIOR') === 'ITA') s++; if (rollNationality(rng, 'ITA', 'YOUTH') === 'ITA') y++; }
    expect(s / n).toBeGreaterThan(0.55); expect(s / n).toBeLessThan(0.67);
    expect(y / n).toBeGreaterThan(0.66); expect(y / n).toBeLessThan(0.74);
  });
  it('players carry names from their own nationality pool', () => {
    const g = generateWorld('T', 'GER', 5);
    for (const p of Object.values(g.players).slice(0, 400)) {
      expect(NATIONALITIES[p.nationality].lastNames).toContain(p.lastName);
      expect(NATIONALITIES[p.nationality].firstNames).toContain(p.firstName);
    }
  });
  it('different seeds generate different worlds', () => {
    const a = generateWorld('T', 'FRA', 1);
    const b = generateWorld('T', 'FRA', 2);
    const sig = (g: typeof a) => Object.values(g.players).slice(0, 30).map((p) => `${p.lastName}${p.ca}${p.playstyle}`).join('|');
    expect(sig(a)).not.toEqual(sig(b));
    expect(new Set(Object.values(a.clubs).map((c) => c.identity)).size).toBeGreaterThan(4);
  });
});

describe('world news', () => {
  it('caps the archive and flags my-club stories', () => {
    const g = generateWorld('T', 'ESP', 9);
    acceptJob(g, g.jobOffers[0].id);
    for (let w = 0; w < 6; w++) advanceMatchweek(g);
    for (let i = 0; i < 100; i++) addNews(g, { category: 'CLUB', headline: `H${i}`, body: 'b', clubIds: [g.manager.clubId!], weight: 1 });
    expect(g.news.length).toBe(NEWS_CAP);
    expect(g.news[0].headline).toBe('H99');
    expect(g.news[0].myClub).toBe(true);
  });
});
