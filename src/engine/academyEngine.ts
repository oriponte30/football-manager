/**
 * Quarterly youth intake: every ~10 matchweeks the Youth Director drops 2–3
 * prospects (16–17) on the desk. Low baseline (~80% cut), rare superstar roll.
 */
import type { GameState } from '../types/world';
import type { Club } from '../types/club';
import type { Position } from '../types/player';
import { clamp, type Rng } from './rng';
import { rollNationality } from '../data/nationalities';
import { generatePlayer } from './playerGenerator';
import { staffStarsOf } from './staffGenerator';
import { fax, movePlayer, loanOutPlayer } from './transferEngine';
import { fullName } from './ratings';

export const INTAKE_WEEKS = [9, 18, 27];
const YOUTH_POS: Position[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'LW', 'RW', 'ST', 'ST'];

export function superstarChance(ydStars: number, scoutStars: number, academyLevel: number): number {
  return 0.01 + 0.002 * (ydStars - 1) + 0.0008 * (scoutStars - 1) + 0.001 * (academyLevel - 1);
}

export function youthIntake(g: GameState, rng: Rng, club: Club, toPending: boolean): string[] {
  const yd = staffStarsOf(g, club.id, 'YOUTH_DIRECTOR');
  const sc = staffStarsOf(g, club.id, 'CHIEF_SCOUT');
  const n = rng.int(2, 3);
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const age = rng.int(16, 17);
    const base = rng.range(40, 48) + (yd - 1) * 0.8 + (club.facilities.youth - 1) * 0.6;
    let pa: number;
    if (rng.chance(superstarChance(yd, sc, club.facilities.youth))) pa = rng.int(85, 94);
    else if (rng.chance(0.2 + yd * 0.015)) pa = rng.int(66, 78) + Math.round(yd * 0.6);
    else pa = rng.int(48, 65);
    const p = generatePlayer(g, rng, {
      nationality: rollNationality(rng, club.country, 'YOUTH'), country: club.country, position: rng.pick(YOUTH_POS), age, targetOvr: clamp(base, 36, 56),
      clubId: null, tier: club.tier, paOverride: pa, youth: true, wageMult: 0.35,
    });
    p.contract = { wage: Math.max(150, Math.round(p.contract.wage / 10) * 10), yearsLeft: 3, releaseClause: null };
    g.players[p.id] = p;
    ids.push(p.id);
  }
  if (toPending) {
    g.pendingYouth.push(...ids);
    fax(g, {
      kind: 'YOUTH_INTAKE', from: 'Youth Director', title: `YOUTH INTAKE: ${ids.length} prospects`, resolved: false,
      body: `The academy has ${ids.length} new hopefuls for your consideration. Their dossiers are in the Youth Intake folder (Transfers screen). Sign, release or loan them out.`,
    });
  }
  return ids;
}

export function signYouth(g: GameState, clubId: string, playerId: string): { ok: boolean; message: string } {
  if (!g.pendingYouth.includes(playerId)) return { ok: false, message: 'Prospect no longer available.' };
  const club = g.clubs[clubId];
  if (club.playerIds.length >= 34) return { ok: false, message: 'Squad full.' };
  const p = g.players[playerId];
  g.pendingYouth = g.pendingYouth.filter((x) => x !== playerId);
  p.clubId = null;
  movePlayer(g, p, clubId);
  g.freeAgentIds = g.freeAgentIds.filter((x) => x !== playerId);
  p.isYouthProduct = true;
  closeIntakeFaxIfDone(g);
  return { ok: true, message: `${fullName(p)} signs his first professional contract.` };
}

export function releaseYouth(g: GameState, playerId: string): { ok: boolean; message: string } {
  if (!g.pendingYouth.includes(playerId)) return { ok: false, message: 'Prospect no longer available.' };
  g.pendingYouth = g.pendingYouth.filter((x) => x !== playerId);
  const p = g.players[playerId];
  delete g.players[playerId];
  closeIntakeFaxIfDone(g);
  return { ok: true, message: `${p ? fullName(p) : 'Prospect'} released. Good luck to the lad.` };
}

export function loanOutYouth(g: GameState, rng: Rng, clubId: string, playerId: string): { ok: boolean; message: string } {
  const s = signYouth(g, clubId, playerId);
  if (!s.ok) return s;
  const l = loanOutPlayer(g, rng, clubId, playerId);
  return l.ok ? l : { ok: true, message: `${s.message} (No loan club found — he stays.)` };
}

function closeIntakeFaxIfDone(g: GameState): void {
  if (g.pendingYouth.length === 0) for (const f of g.faxes) if (f.kind === 'YOUTH_INTAKE') f.resolved = true;
}
