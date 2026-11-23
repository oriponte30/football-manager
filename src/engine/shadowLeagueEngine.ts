/**
 * Shadow leagues: the 4 non-active Tier 1s are resolved in ONE fast
 * probabilistic pass at season end (Poisson goals from squad strength).
 */
import type { GameState, League, TableRow } from '../types/world';
import { clamp, type Rng } from './rng';
import { squadStrength } from './lineup';

function poisson(rng: Rng, lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > L && k < 12);
  return k - 1;
}

export function emptyRow(clubId: string): TableRow {
  return { clubId, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] };
}

export function applyResultToTable(table: Record<string, TableRow>, homeId: string, awayId: string, hg: number, ag: number): void {
  const h = table[homeId] ?? (table[homeId] = emptyRow(homeId));
  const a = table[awayId] ?? (table[awayId] = emptyRow(awayId));
  h.p++; a.p++;
  h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
  if (hg > ag) { h.w++; a.l++; h.pts += 3; h.form.push('W'); a.form.push('L'); }
  else if (hg < ag) { a.w++; h.l++; a.pts += 3; h.form.push('L'); a.form.push('W'); }
  else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('D'); a.form.push('D'); }
  if (h.form.length > 5) h.form.shift();
  if (a.form.length > 5) a.form.shift();
}

export function sortedTable(table: Record<string, TableRow>): TableRow[] {
  return Object.values(table).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.clubId.localeCompare(b.clubId));
}

export function resolveShadowLeague(g: GameState, rng: Rng, league: League): void {
  league.table = {};
  for (const id of league.clubIds) league.table[id] = emptyRow(id);
  const str: Record<string, number> = {};
  for (const id of league.clubIds) str[id] = squadStrength(g, g.clubs[id]);
  for (const h of league.clubIds) {
    for (const a of league.clubIds) {
      if (h === a) continue;
      const diff = str[h] - str[a] + 1.5;
      const lh = clamp(1.35 * Math.exp(diff / 26), 0.25, 4);
      const la = clamp(1.15 * Math.exp(-diff / 26), 0.2, 4);
      applyResultToTable(league.table, h, a, poisson(rng, lh), poisson(rng, la));
    }
  }
}
