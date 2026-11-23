/**
 * The matchweek is simulated in one go, so the real tables already hold every
 * result while you watch your match. This rebuilds the tables as they were
 * before the week and replays only what you have seen: your finished matches
 * in full, and the one you are watching at its current live score.
 * The other results of the week stay hidden until your matches are over.
 */
import type { GameState, TableRow } from '../types/world';
import { applyResultToTable } from './shadowLeagueEngine';

export interface LiveScore { resultId: string; hg: number; ag: number }

type Tables = Record<string, Record<string, TableRow>>;

function cloneTable(t: Record<string, TableRow>): Record<string, TableRow> {
  const out: Record<string, TableRow> = {};
  for (const [k, r] of Object.entries(t)) out[k] = { ...r, form: [...r.form] };
  return out;
}

function unapply(table: Record<string, TableRow>, homeId: string, awayId: string, hg: number, ag: number): void {
  const h = table[homeId];
  const a = table[awayId];
  if (!h || !a) return;
  h.p--; a.p--;
  h.gf -= hg; h.ga -= ag; a.gf -= ag; a.ga -= hg;
  if (hg > ag) { h.w--; a.l--; h.pts -= 3; }
  else if (hg < ag) { a.w--; h.l--; a.pts -= 3; }
  else { h.d--; a.d--; h.pts--; a.pts--; }
  h.form.pop(); a.form.pop();
}

/** true while some of the user's matches this week have not been watched to full time */
export function hasPendingMatches(g: GameState): boolean {
  return g.phase === 'MATCHDAY' && g.lastUserResults.some((r) => !g.watchedResults.includes(r.id));
}

/** League tables as the manager should see them right now, or null when the real ones are fine. */
export function liveTables(g: GameState, live: LiveScore | null): Tables | null {
  if (!hasPendingMatches(g)) return null;
  const out: Tables = {};
  // roll the whole week back
  for (const l of g.lastWeekResults) {
    if (l.competition !== 'LEAGUE') continue;
    const lid = g.clubs[l.homeId]?.leagueId;
    const lg = lid ? g.leagues[lid] : null;
    if (!lg || !lid) continue;
    const t = out[lid] ?? (out[lid] = cloneTable(lg.table));
    unapply(t, l.homeId, l.awayId, l.homeGoals, l.awayGoals);
  }
  // replay what the manager has seen
  for (const r of g.lastUserResults) {
    if (r.competition !== 'LEAGUE') continue;
    const lid = g.clubs[r.homeId]?.leagueId;
    const t = lid ? out[lid] : null;
    if (!t) continue;
    if (g.watchedResults.includes(r.id)) applyResultToTable(t, r.homeId, r.awayId, r.homeGoals, r.awayGoals);
    else if (live && live.resultId === r.id) applyResultToTable(t, r.homeId, r.awayId, live.hg, live.ag);
  }
  return out;
}

/** The game with its league tables swapped for the live view (or the game itself when nothing is hidden). */
export function withLiveTables(g: GameState, live: LiveScore | null): GameState {
  const t = liveTables(g, live);
  if (!t) return g;
  const leagues = { ...g.leagues };
  for (const [lid, table] of Object.entries(t)) leagues[lid] = { ...g.leagues[lid], table };
  return { ...g, leagues };
}
